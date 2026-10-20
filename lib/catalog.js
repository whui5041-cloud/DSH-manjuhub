/**
 * Local skill inventory.
 *
 * Scans $DSH_HOME/skills directly (the user's own folded-in skill library) and
 * merges the harness `skills` service view for bundled / project / custom
 * providers, then enriches every entry with the metadata in its SKILL.md
 * frontmatter (version, tags, agent_created, ...) and filesystem timestamps.
 *
 * The disk scan is primary because the skills service exposes only the calling
 * context's global layer; the user's skills arrive through an agent preset's
 * scoped layer and are invisible to a root-scope read.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { skillsRoot } from './state.js'

/** Core words that make a skill unmistakably about manju / short drama. */
const CORE = [
  '漫剧', '漫劇', '短剧', '短劇', 'microdrama', 'micro-drama', 'micro drama',
  'short-drama', 'short drama', 'shortdrama', 'ai漫剧', 'ai 漫剧', '漫改',
  'manju', '分集剧', '竖屏剧', 'red fruit drama', '红果短剧',
]

/** Strong production-stage words; two of them are enough without a core hit. */
const STRONG = [
  '分镜', '分鏡', 'storyboard', 'story board', '剧本', '劇本', 'screenplay',
  '分集', '钩子', '選書', '选书', '小说改', '小说转', '剧本改编', '网文',
  'seedance', '可灵', 'kling', 'minimax', '运镜', '运鏡', '打戏', '打戲',
  '三视图', '三視圖', '四视图', '角色设计', '角色設計', '立绘', '立繪', '人设',
  '角色定妆', '定妆', '角色一致性', '身份组图', '身份三图', '真人电影', '身份锚点',
  '建模脸', '建模臉', '场景图', '場景圖', '角色资产', '素材接线', '投喂',
  '提示词', 'prompt', 'midjourney', 'mj', 'flova', '旁白', '解说', '解說',
  '配音', '音色', 'bgm', '封面', '剪辑', '剪輯', '短剧导演', '漫剧导演',
  '定位锁', '画幅', '画风', '长镜头', '一镜到底', '镜头语言', '相机运动',
]

/** Weak words: only used for ranking, never for admission on their own. */
const WEAK = ['skill', 'agent', 'ai', 'video', 'comic', 'anime', 'novel', 'story', '生成', '创作']

/** Skill sources that are clearly the user's own (lenient admission). */
const USER_SOURCES = new Set(['user-dsh', 'user-agents', 'custom', 'project-dsh', 'project-agents'])

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Minimal YAML frontmatter reader.
 * Handles the shapes SKILL.md files actually use: quoted scalars, booleans,
 * inline arrays, `- item` lists, and `|` / `>` block scalars.
 */
export function parseFrontmatter(text) {
  const src = safeStr(text)
  if (!src.startsWith('---')) return {}
  const end = src.indexOf('\n---', 3)
  if (end < 0) return {}
  const lines = src.slice(3, end).split(/\r?\n/)
  const out = {}
  let key = null
  let list = null
  let block = null
  const flush = () => {
    if (key === null) return
    if (block !== null) {
      out[key] = block.join('\n').trim()
    } else if (list !== null) {
      out[key] = list
    }
    key = null
    list = null
    block = null
  }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim().length === 0) {
      if (block !== null) block.push('')
      continue
    }
    if (block !== null) {
      if (/^\s+/.test(line)) { block.push(line.trim()); continue }
      flush()
    }
    if (list !== null) {
      const item = /^\s*-\s+(.*)$/.exec(line)
      if (item) { list.push(unquote(item[1])); continue }
      flush()
    }
    if (/^\s/.test(line)) continue
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    if (key !== null) flush()
    key = match[1]
    const value = match[2].trim()
    if (value === '|' || value === '>') {
      block = []
    } else if (value === '') {
      list = []
    } else {
      out[key] = parseScalar(value)
      key = null
    }
  }
  flush()
  for (const k of Object.keys(out)) if (Array.isArray(out[k]) && out[k].length === 0) delete out[k]
  return out
}

function unquote(value) {
  const text = value.trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).replace(/\\"/g, '"')
  }
  return text
}

function parseScalar(value) {
  const text = value.trim()
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map(part => unquote(part)).filter(part => part.length > 0)
  }
  if (/^(true|yes)$/i.test(text)) return true
  if (/^(false|no)$/i.test(text)) return false
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  return unquote(text)
}

/** Score a skill against the manju domain vocabulary. */
export function domainInfo({ name = '', description = '', whenToUse = '', tags = [] }) {
  const haystack = [name, description, whenToUse, ...tags].join(' \n ').toLowerCase()
  const hits = []
  let score = 0
  for (const word of CORE) {
    if (haystack.includes(word)) { hits.push(word); score += 10 }
  }
  for (const word of STRONG) {
    if (word.length <= 3 && /^[a-z]+$/.test(word)) {
      if (!new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(haystack)) continue
    }
    if (haystack.includes(word)) { hits.push(word); score += 3 }
  }
  for (const word of WEAK) {
    if (haystack.includes(word)) score += 1
  }
  return { score, hits: [...new Set(hits)] }
}

/** Admission rule: core hit, two strong hits, or one strong hit for a user skill. */
export function isDomainSkill(info, source) {
  const core = info.hits.some(word => CORE.includes(word))
  if (core) return true
  const strong = info.hits.filter(word => STRONG.includes(word)).length
  if (strong >= 2) return true
  if (strong >= 1 && USER_SOURCES.has(String(source))) return true
  return false
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function statOrNull(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

function asTags(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)
  }
  return []
}

/** Read one skill directory into the hub's record shape. */
async function inspectSkillDir(dir, summary) {
  if (safeStr(dir).length === 0) {
    return {
      name: safeStr(summary?.name) || 'unknown',
      description: safeStr(summary?.description),
      whenToUse: safeStr(summary?.whenToUse),
      path: '',
      skillFile: null,
      source: safeStr(summary?.source),
      provider: safeStr(summary?.provider),
      version: null,
      agentCreated: false,
      tags: [],
      updatedAt: null,
      installedAt: null,
      hasSkillFile: false,
      parseError: null,
    }
  }
  const mdPath = join(dir, 'SKILL.md')
  const mdStat = await statOrNull(mdPath)
  const dirStat = await statOrNull(dir)
  const text = mdStat === null ? null : await readText(mdPath)
  const fm = text === null ? {} : parseFrontmatter(text)
  const description = safeStr(fm.description) || safeStr(summary?.description)
  const tags = asTags(fm.tags ?? fm.keywords)
  const agentCreated = fm.agent_created === true || fm.agent_created === 'true'
  const updatedAt = mdStat?.mtimeMs ?? dirStat?.mtimeMs ?? null
  const installedAt = dirStat?.birthtimeMs ?? dirStat?.ctimeMs ?? null
  return {
    name: safeStr(summary?.name) || safeStr(fm.name) || dir.split(/[\\/]/).pop(),
    description,
    whenToUse: safeStr(summary?.whenToUse) || safeStr(fm.when_to_use),
    path: dir,
    skillFile: mdStat === null ? null : mdPath,
    source: safeStr(summary?.source),
    provider: safeStr(summary?.provider),
    version: fm.version === undefined ? null : String(fm.version),
    agentCreated,
    tags,
    updatedAt,
    installedAt,
    hasSkillFile: mdStat !== null,
    parseError: null,
  }
}

/** Ask the harness skills service for the live catalog. */
async function catalogFromService(ctx, cwd) {
  const service = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
  if (service === undefined || typeof service.snapshot !== 'function') return null
  try {
    const snap = await service.snapshot({ cwd })
    if (snap === null || typeof snap !== 'object' || !Array.isArray(snap.skills)) return null
    return snap.skills.map(summary => {
      const rawPath = safeStr(summary.path)
      const resource = summary.resourceBase
      const fromResource = resource !== null && typeof resource === 'object' && resource.kind === 'directory' ? safeStr(resource.path) : ''
      const dir = rawPath.length > 0
        ? (/\.md$/i.test(rawPath) ? rawPath.replace(/[\\/][^\\/]+\.md$/i, '') : rawPath)
        : fromResource
      return { dir, summary }
    })
  } catch {
    return null
  }
}

/** Fallback: scan $DSH_HOME/skills for directories holding a SKILL.md. */
async function catalogFromDisk() {
  const root = skillsRoot()
  let entries = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const found = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const md = await statOrNull(join(dir, 'SKILL.md'))
    if (md === null) continue
    found.push({ dir, summary: { name: entry.name, source: 'user-dsh', provider: 'filesystem' } })
  }
  return found
}

/**
 * Merge both views by skill name.
 *
 * The harness `skills` service only reads the calling context's global layer,
 * while the user's own skill folders are mounted by an agent preset (a scoped
 * layer). So the disk scan is the primary source for user skills and the
 * service adds bundled / project / custom providers. The service wins on
 * description/source metadata; the first real directory wins on path.
 */
async function mergedCandidates(ctx, cwd) {
  const merged = new Map()
  for (const item of await catalogFromDisk()) {
    const name = safeStr(item.summary?.name) || safeStr(item.dir).split(/[\\/]/).pop()
    if (name.length > 0) merged.set(name, { ...item, summary: { ...item.summary, name } })
  }
  const service = await catalogFromService(ctx, cwd)
  for (const item of service ?? []) {
    const name = safeStr(item.summary?.name)
    if (name.length === 0) continue
    const existing = merged.get(name)
    if (existing === undefined) {
      merged.set(name, item)
      continue
    }
    existing.summary = { ...existing.summary, ...item.summary, name }
    if (safeStr(existing.dir).length === 0 && safeStr(item.dir).length > 0) existing.dir = item.dir
  }
  return [...merged.values()]
}


/** True when `child` lives inside `parent` (Windows-tolerant). */
function isUnder(parent, child) {
  const normalize = value => resolve(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(`${root}/`)
}

/**
 * Refresh the local inventory into `state.skills`.
 * Returns { scanned, domain, added, updated, errors }.
 */
export async function scanLocal(ctx, state, options = {}) {
  const cwd = safeStr(options.cwd) || process.cwd()
  const candidates = await mergedCandidates(ctx, cwd)
  // A skill installed by the hub may not be visible through the skills service
  // yet (its provider watches the filesystem); include it straight from disk.
  const known = new Set(candidates.map(item => safeStr(item.summary?.name)))
  for (const [name, install] of Object.entries(state.installs)) {
    if (known.has(name)) continue
    const dir = join(skillsRoot(), name)
    if ((await statOrNull(join(dir, 'SKILL.md'))) === null) continue
    candidates.push({ dir, summary: { name, source: 'user-dsh', provider: install?.repo ?? 'filesystem' } })
  }
  const now = Date.now()
  const seen = new Set()
  let added = 0
  let updated = 0
  const errors = []

  for (const { dir, summary } of candidates) {
    try {
      const record = await inspectSkillDir(dir, summary)
      seen.add(record.name)
      const previous = state.skills[record.name]
      const domain = domainInfo(record)
      // A folder the user deliberately keeps in $DSH_HOME/skills belongs to the
      // manju library even when a new skill's wording is not in the vocabulary
      // yet; the keyword score then only ranks it. Bundled skills still need a
      // real keyword hit.
      const inUserLibrary = record.source === 'user-dsh' && safeStr(record.path).length > 0 && isUnder(skillsRoot(), record.path)
      const install = state.installs[record.name] ?? null
      const origin = install?.by ?? (record.agentCreated ? 'agent' : 'unknown')
      const updatedBy = install?.lastUpdateBy ?? (record.agentCreated ? 'agent' : 'unknown')
      const next = {
        ...record,
        domain,
        isDomain: isDomainSkill(domain, record.source) || inUserLibrary,
        firstSeenAt: previous?.firstSeenAt ?? now,
        lastSeenAt: now,
        origin,
        updatedBy,
        install,
        update: previous?.update ?? null,
      }
      if (previous === undefined) added += 1
      else if (previous.updatedAt !== next.updatedAt || previous.version !== next.version) updated += 1
      state.skills[record.name] = next
    } catch (error) {
      errors.push(`${dir}: ${String(error?.message ?? error)}`)
    }
  }

  // Drop records whose directory disappeared.
  for (const name of Object.keys(state.skills)) {
    if (!seen.has(name)) delete state.skills[name]
  }
  state.meta.lastLocalScanAt = now
  const all = Object.values(state.skills)
  return {
    scanned: all.length,
    domain: all.filter(skill => skill.isDomain).length,
    added,
    updated,
    errors,
  }
}

/** Sort for display: domain first, then recently updated. */
export function sortedSkills(state, { domainOnly = true } = {}) {
  const list = Object.values(state.skills)
    .filter(skill => !domainOnly || skill.isDomain)
  return list.sort((a, b) => {
    if (a.isDomain !== b.isDomain) return a.isDomain ? -1 : 1
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}
