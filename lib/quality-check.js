/**
 * 质量体检（quality）：引用检查、健康分、生产阶段识别、重名/同质检测、仓库预览链接。
 *
 * 全部是只读函数：不写盘、不改 state，调用方（工具层 / UI 路由）自己决定怎么展示。
 * 路径一律走 node:path，Windows 反斜杠与大小写都被归一化后再比较。
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseFrontmatter } from './catalog.js'

const MAX_LINK_CHECKS = 200
const MAX_MISSING = 50
const MAX_WARNINGS = 20
const MAX_TOKENS = 600
const DAY_MS = 24 * 3600_000

/** 健康分的“新鲜度”门槛：30 天内更新过。 */
export const HEALTH_MAX_AGE_MS = 30 * DAY_MS

/** 阶段 id，顺序也是同名同分时的优先级。 */
export const STAGES = ['script', 'storyboard', 'asset', 'feed', 'qc', 'publish', 'other']

const STAGE_LABELS = {
  script: '剧本',
  storyboard: '分镜',
  asset: '资产',
  feed: '投喂',
  qc: '质检',
  publish: '发布',
  other: '其他',
}

/** 阶段关键词：中文子串 + 英文词边界。 */
const STAGE_KEYWORDS = {
  script: [
    '剧本', '劇本', '编剧', '編劇', '小说改', '小说转', '改编', '改編', '分集', '大纲', '大綱',
    '台词', '台詞', '钩子', '鉤子', '选书', '選書', '选题', '選題', '故事圣经', '开发圣经',
    'screenplay', 'script', 'novel', 'story', 'episode', 'hook',
  ],
  storyboard: [
    '分镜', '分鏡', '镜头', '鏡頭', '运镜', '運鏡', '故事板', '故事版', '机位', '機位',
    '景别', '景別', '长镜头', '長鏡頭', '一镜到底', '一鏡到底', '轴线', '軸線', '衔接帧',
    'storyboard', 'story board', 'shotlist', 'shot list', 'camera', 'long take',
  ],
  asset: [
    '资产', '資產', '角色', '人设', '人設', '三视图', '三視圖', '四视图', '四視圖', '立绘', '立繪',
    '定妆', '定妝', '场景图', '場景圖', '建模脸', '建模臉', '身份组图', '身份三图', '身份锚点',
    '素材', '道具', 'character', 'asset', 'midjourney', 'reference sheet', 'turnaround',
  ],
  feed: [
    '投喂', '投餵', '提示词', '提示詞', '素材接线', '素材接線', '视频提示词', '视频模型',
    'seedance', '可灵', '可靈', 'kling', 'minimax', 'flova', 'sora', 'veo', 'wan',
    'prompt', 'feed', 'text2video', 'image2video',
  ],
  qc: [
    '质检', '質檢', '检查', '檢查', '审核', '審核', '校对', '校對', '一致性', '连续性', '連續性',
    '版本锁', '版本鎖', '机检', '機檢', '红线', '紅線', 'qc', 'review', 'audit', 'checksum',
  ],
  publish: [
    '发布', '發布', '上线', '上線', '投放', '拉新', '运营', '運營', '封面', '标题', '標題',
    '分发', '分發', '变现', '變現', '复盘', '復盤', '完播', '追更', 'publish', 'launch',
    'marketing', 'growth',
  ],
}

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function toPosix(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

/** 用于比较的归一化路径（统一分隔符、去尾斜杠、小写）。 */
function normalizePath(value) {
  return toPosix(value).replace(/\/+$/, '').toLowerCase()
}

function isUnder(parent, child) {
  const root = normalizePath(parent)
  const target = normalizePath(child)
  return target === root || target.startsWith(`${root}/`)
}

async function statOrNull(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

/** 技能目录：优先 path，退回 SKILL.md 所在目录。 */
function skillDirOf(skill) {
  const dir = safeStr(skill?.path).trim()
  if (dir.length > 0) return resolve(dir)
  const file = safeStr(skill?.skillFile).trim()
  if (file.length > 0) return dirname(resolve(file))
  return ''
}

function skillFileOf(skill, dir) {
  const file = safeStr(skill?.skillFile).trim()
  if (file.length > 0) return file
  return dir.length > 0 ? join(dir, 'SKILL.md') : ''
}

/* ------------------------------------------------------------------ *
 * 引用检查
 * ------------------------------------------------------------------ */

const MD_LINK = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g
// A bare `references/...` mention ends at whitespace or any bracket/punctuation
// character, including the Chinese full-width forms used in the skill bodies.
const BARE_REFERENCE = /(?:^|[\s(`'",，。；：【\[（])((?:\.{0,2}\/)?references\/[^\s)`'",，。；：:;\]】）》」』“”‘’（]+)/gi

/** 把一个链接目标洗成相对路径；外链、锚点、空值返回 null。 */
function cleanLinkTarget(raw) {
  let text = String(raw ?? '').trim()
  if (text.length === 0) return null
  if (text.startsWith('<') && text.endsWith('>')) text = text.slice(1, -1).trim()
  // Markdown 链接可能带标题：path "title"
  const titled = /^(\S+)\s+["'(].*$/.exec(text)
  if (titled !== null) text = titled[1]
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//') || text.startsWith('#')) return null
  const hash = text.indexOf('#')
  if (hash >= 0) text = text.slice(0, hash)
  const query = text.indexOf('?')
  if (query >= 0) text = text.slice(0, query)
  text = text.replace(/\\/g, '/').trim()
  if (text.length === 0) return null
  try {
    text = decodeURIComponent(text)
  } catch {
    // 不是合法百分号编码时保留原文
  }
  return text
}

/** 收集正文里的本地引用：markdown 链接 + 裸 references/ 路径。 */
function linkTargets(text) {
  const source = safeStr(text)
  const found = new Set()
  for (const match of source.matchAll(MD_LINK)) {
    const target = cleanLinkTarget(match[1])
    if (target !== null) found.add(target)
  }
  for (const match of source.matchAll(BARE_REFERENCE)) {
    const target = cleanLinkTarget(match[1])
    if (target !== null) found.add(target)
  }
  return [...found]
}

/** 逐个检查引用目标是否存在，越界/绝对路径只记提示不记缺失。 */
async function checkTargets(dir, targets) {
  const missing = []
  const warnings = []
  let checked = 0
  for (const raw of targets) {
    if (checked >= MAX_LINK_CHECKS) {
      warnings.push(`引用过多，只检查前 ${MAX_LINK_CHECKS} 个`)
      break
    }
    const normalized = raw.replace(/^\.\//, '')
    if (isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized)) {
      warnings.push(`跳过绝对路径引用：${raw}`)
      continue
    }
    const target = resolve(dir, normalized)
    if (!isUnder(dir, target)) {
      warnings.push(`跳过指向技能目录之外的引用：${raw}`)
      continue
    }
    checked += 1
    if ((await statOrNull(target)) === null) missing.push(raw)
  }
  return { checked, missing, warnings }
}

function trimWarnings(warnings) {
  if (warnings.length <= MAX_WARNINGS) return warnings
  return [...warnings.slice(0, MAX_WARNINGS), `另有 ${warnings.length - MAX_WARNINGS} 条提示未显示`]
}

/**
 * 检查一个技能正文里引用的本地文件是否都存在。
 * @param {{ path?: string, skillFile?: string | null }} skill
 * @returns {Promise<{ ok: boolean, checked: number, missing: string[], warnings: string[] }>}
 */
export async function referenceCheck(skill) {
  const info = skill !== null && typeof skill === 'object' ? skill : {}
  const dir = skillDirOf(info)
  const file = skillFileOf(info, dir)
  if (file.length === 0) {
    return { ok: false, checked: 0, missing: [], warnings: ['该技能没有本地目录，无法检查引用'] }
  }
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    return { ok: false, checked: 0, missing: [], warnings: [`读取 SKILL.md 失败：${String(error?.message ?? error)}`] }
  }
  const targets = linkTargets(text)
  if (targets.length === 0) {
    return { ok: true, checked: 0, missing: [], warnings: ['正文没有引用本地文件'] }
  }
  const result = await checkTargets(dir.length > 0 ? dir : dirname(resolve(file)), targets)
  const warnings = [...result.warnings]
  if (result.missing.length > 0) warnings.push(`缺少 ${result.missing.length} 个被引用的文件`)
  return {
    ok: result.missing.length === 0,
    checked: result.checked,
    missing: result.missing.slice(0, MAX_MISSING),
    warnings: trimWarnings(warnings),
  }
}

/* ------------------------------------------------------------------ *
 * 健康分
 * ------------------------------------------------------------------ */

function normalize(value) {
  return safeStr(value).toLowerCase().replace(/^dsh[-_]/, '').replace(/^sd[-_]/, '').replace(/[-_ ]?(engine|skills?)$/, '').replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
}

/** 最有说服力的上游仓库：安装记录 > 更新记录 > 探测记录。 */
function repoOf(skill, state) {
  const installed = safeStr(skill?.install?.repo).trim()
  if (installed.length > 0) return installed
  const updated = safeStr(skill?.update?.repo).trim()
  if (updated.length > 0) return updated
  const name = safeStr(skill?.name).trim()
  if (name.length === 0 || !Array.isArray(state?.discoveries)) return null
  const wanted = normalize(name)
  for (const item of state.discoveries) {
    if (item === null || typeof item !== 'object' || safeStr(item.repo).length === 0) continue
    if (safeStr(item.installedSkill) === name) return item.repo
    for (const path of Array.isArray(item.skillPaths) ? item.skillPaths : []) {
      const folder = safeStr(path).replace(/\/SKILL\.md$/i, '')
      const folderName = folder.split('/').pop() ?? ''
      if (normalize(folderName) === wanted) return item.repo
    }
  }
  return null
}

const BAD_STATUS = new Set(['pending', 'stale'])

/** 技能状态：pending / stale 视为异常（待安装、上游失联）。 */
function statusOf(skill, state) {
  const candidates = [skill?.status, skill?.install?.status, skill?.update?.status]
  if (Array.isArray(state?.discoveries)) {
    for (const item of state.discoveries) {
      if (item === null || typeof item !== 'object') continue
      if (safeStr(item.installedSkill) === safeStr(skill?.name)) candidates.push(item.status)
    }
  }
  const labels = candidates.map(value => safeStr(value).trim().toLowerCase()).filter(Boolean)
  const bad = labels.find(label => BAD_STATUS.has(label))
  if (bad !== undefined) return { ok: false, label: bad }
  return { ok: true, label: labels[0] ?? 'ok' }
}

function updatedStamp(skill) {
  const values = [skill?.updatedAt, skill?.install?.lastUpdatedAt, skill?.installedAt]
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

/**
 * 健康分：0~100 分 + A/B/C/D + 每项信号（id/label/ok/weight）。
 * 权重合计 100：SKILL.md 20、frontmatter 15、引用 20、版本 10、新鲜度 10、上游 10、状态 15。
 * @param {any} skill
 * @param {{ discoveries?: any[] }} [state]
 */
export async function healthScore(skill, state) {
  const info = skill !== null && typeof skill === 'object' ? skill : {}
  const dir = skillDirOf(info)
  const file = skillFileOf(info, dir)
  const fileStat = file.length > 0 ? await statOrNull(file) : null
  const readable = fileStat !== null && fileStat.isFile()
  let text = ''
  if (readable) {
    try {
      text = await readFile(file, 'utf8')
    } catch {
      text = ''
    }
  }

  const frontmatter = readable ? parseFrontmatter(text) : {}
  const hasFrontmatter = text.trimStart().startsWith('---') && Object.keys(frontmatter).length > 0
  const frontmatterOk = hasFrontmatter
    && safeStr(frontmatter.name).trim().length > 0
    && safeStr(frontmatter.description).trim().length > 0

  const refs = readable && dir.length > 0
    ? await checkTargets(dir, linkTargets(text))
    : { checked: 0, missing: [], warnings: [] }
  const refsOk = readable && refs.missing.length === 0

  const repo = repoOf(info, state)
  const status = statusOf(info, state)
  const stamp = updatedStamp(info)
  const fresh = stamp > 0 && Date.now() - stamp <= HEALTH_MAX_AGE_MS
  const version = safeStr(info.version).trim()

  const signals = [
    { id: 'skill-file', label: '有可读的 SKILL.md', weight: 20, ok: readable },
    { id: 'frontmatter', label: 'frontmatter 含 name + description', weight: 15, ok: frontmatterOk },
    { id: 'references', label: '引用文件完整', weight: 20, ok: refsOk },
    { id: 'version', label: '标注版本号', weight: 10, ok: version.length > 0 },
    { id: 'freshness', label: '30 天内更新过', weight: 10, ok: fresh },
    { id: 'upstream', label: '关联上游仓库', weight: 10, ok: repo !== null },
    { id: 'status', label: '状态正常（非 pending/stale）', weight: 15, ok: status.ok },
  ]
  const score = signals.reduce((sum, signal) => sum + (signal.ok ? signal.weight : 0), 0)
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'
  return {
    score,
    grade,
    signals,
    details: {
      repo,
      status: status.label,
      updatedAt: stamp > 0 ? stamp : null,
      updatedDays: stamp > 0 ? Math.floor((Date.now() - stamp) / DAY_MS) : null,
      checkedReferences: refs.checked,
      missingReferences: refs.missing.slice(0, MAX_MISSING),
    },
  }
}

/* ------------------------------------------------------------------ *
 * 阶段识别
 * ------------------------------------------------------------------ */

function matchesKeyword(haystack, keyword) {
  if (keyword.length === 0) return false
  if (/^[a-z0-9 ]+$/.test(keyword)) {
    const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`).test(haystack)
  }
  return haystack.includes(keyword)
}

/**
 * 按关键词判断技能属于哪个生产阶段。
 * @returns {{ stage: string, label: string, reason: string }}
 */
export function stageOf(skill) {
  const info = skill !== null && typeof skill === 'object' ? skill : {}
  const name = safeStr(info.name).toLowerCase()
  const text = [
    safeStr(info.description),
    safeStr(info.whenToUse),
    ...(Array.isArray(info.tags) ? info.tags.map(tag => safeStr(tag)) : []),
  ].join(' \n ').toLowerCase()
  const haystack = `${name} \n ${text}`

  let best = { stage: 'other', score: 0, hits: [] }
  for (const stage of STAGES) {
    if (stage === 'other') continue
    const hits = []
    let score = 0
    for (const keyword of STAGE_KEYWORDS[stage] ?? []) {
      const inName = matchesKeyword(name, keyword)
      const inText = matchesKeyword(text, keyword)
      if (!inName && !inText) continue
      hits.push(keyword)
      score += inName ? 3 : 1
    }
    if (score > best.score) best = { stage, score, hits }
  }
  const reason = best.hits.length > 0
    ? `命中关键词：${best.hits.slice(0, 4).join('、')}`
    : '没有命中阶段关键词，归为其他'
  return { stage: best.stage, label: STAGE_LABELS[best.stage] ?? '其他', reason }
}

/* ------------------------------------------------------------------ *
 * 重名 / 同质检测
 * ------------------------------------------------------------------ */

/** 归一化技能名：小写、去 sd-/dsh- 前缀、去 engine/skill/引擎 后缀、去分隔符。 */
export function normalizeSkillName(name) {
  return safeStr(name)
    .toLowerCase()
    .trim()
    .replace(/^(?:sd|dsh)[-_]/, '')
    .replace(/[-_\s]*(?:engine|skills?|引擎|技能)$/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function tokensOf(text) {
  const source = safeStr(text).toLowerCase()
  const tokens = new Set()
  if (source.length === 0) return tokens
  for (const word of source.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (word.length >= 2) tokens.add(word)
  }
  for (const run of source.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let index = 0; index + 2 <= run.length; index += 1) tokens.add(run.slice(index, index + 2))
  }
  if (tokens.size <= MAX_TOKENS) return tokens
  return new Set([...tokens].slice(0, MAX_TOKENS))
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const token of small) {
    if (large.has(token)) shared += 1
  }
  return shared / (a.size + b.size - shared)
}

/**
 * 找出重名（归一化后同名）与描述高度相似（token Jaccard > 0.6）的技能组。
 * @param {Array<{ name?: string, description?: string }>} skills
 * @returns {Array<{ key: string, names: string[], reason: string }>}
 */
export function dedupeGroups(skills) {
  const list = (Array.isArray(skills) ? skills : [])
    .filter(item => item !== null && typeof item === 'object' && safeStr(item.name).trim().length > 0)
  const count = list.length
  if (count < 2) return []

  const parent = list.map((_, index) => index)
  const find = index => {
    let root = index
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]]
      root = parent[root]
    }
    return root
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) return
    if (rootA < rootB) parent[rootB] = rootA
    else parent[rootA] = rootB
  }

  const keys = list.map(item => normalizeSkillName(item.name))
  const tokens = list.map(item => tokensOf(item.description))
  const similar = []

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const sameName = keys[i].length > 0 && keys[i] === keys[j]
      const score = jaccard(tokens[i], tokens[j])
      if (sameName) union(i, j)
      if (score > 0.6) {
        union(i, j)
        similar.push({ i, j, score })
      }
    }
  }

  const buckets = new Map()
  for (let index = 0; index < count; index += 1) {
    const root = find(index)
    if (!buckets.has(root)) buckets.set(root, [])
    buckets.get(root).push(index)
  }

  const groups = []
  for (const members of buckets.values()) {
    if (members.length < 2) continue
    const names = [...new Set(members.map(index => safeStr(list[index].name).trim()))]
    if (names.length < 2) continue
    const groupKeys = [...new Set(members.map(index => keys[index]).filter(Boolean))]
    const allSameName = members.every(index => keys[index].length > 0 && keys[index] === keys[members[0]])
    // 组内是否真的出现过「归一化同名」这条边（只看全组同名会把纯描述相似的组说错理由）。
    let hasNameEdge = false
    for (let a = 0; a < members.length && !hasNameEdge; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const left = members[a]
        const right = members[b]
        if (keys[left].length > 0 && keys[left] === keys[right]) { hasNameEdge = true; break }
      }
    }
    const bestSimilar = similar
      .filter(pair => members.includes(pair.i) && members.includes(pair.j))
      .reduce((max, pair) => Math.max(max, pair.score), 0)
    const reasons = []
    if (hasNameEdge) reasons.push(`名称归一化后相同：${groupKeys[0]}`)
    if (bestSimilar > 0.6) reasons.push(`描述相似度 ${bestSimilar.toFixed(2)}（token Jaccard）`)
    const key = allSameName && groupKeys.length > 0
      ? groupKeys[0]
      : `similar:${(groupKeys[0] ?? normalizeSkillName(names[0])) || 'group'}`
    groups.push({ key, names, reason: reasons.join('；') })
  }
  return groups.sort((a, b) => b.names.length - a.names.length)
}

/* ------------------------------------------------------------------ *
 * 仓库预览链接
 * ------------------------------------------------------------------ */

/**
 * 把仓库标识（owner/name、GitHub URL 或探测记录）变成可点击的 GitHub 预览地址。
 * @param {string | { repo?: string, full_name?: string, htmlUrl?: string, html_url?: string }} repo
 * @returns {string | null}
 */
export function repoPreviewUrl(repo) {
  const raw = typeof repo === 'string'
    ? repo
    : safeStr(repo?.repo) || safeStr(repo?.full_name) || safeStr(repo?.htmlUrl) || safeStr(repo?.html_url)
  let text = safeStr(raw).trim()
  if (text.length === 0) return null
  text = text
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  const parts = text.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const name = parts[1]
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) return null
  return `https://github.com/${owner}/${name}#readme`
}
