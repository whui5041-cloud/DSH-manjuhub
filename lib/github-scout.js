/**
 * GitHub scout + update checker + skill installer.
 *
 * The scout is deliberately deterministic: GitHub search -> keyword relevance
 * -> tree verification for a real SKILL.md -> stored candidates. No model call
 * is involved, so a daily run costs a handful of GitHub API requests and the
 * result is auditable. The agent (through the manju_skill_hub tool) reads the
 * same state and can go deeper when the user asks.
 */
import { gunzipSync } from 'node:zlib'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { skillsRoot } from './state.js'

export const DEFAULT_QUERIES = [
  'topic:claude-skills storyboard',
  'topic:claude-skills drama',
  'topic:claude-skills 分镜',
  'topic:agent-skills 短剧',
  'short-drama skill in:name,description',
  '漫剧 skill in:name,description',
  '短剧 分镜 skill in:name,description',
]

const CORE = ['漫剧', '漫劇', '短剧', '短劇', 'microdrama', 'micro-drama', 'short-drama', 'short drama', 'manju', 'ai漫剧', '漫改']
const STRONG = [
  '分镜', '分鏡', 'storyboard', 'story board', '剧本', '劇本', 'screenplay', '分集',
  '选书', '小说改', '小说转', '网文', 'seedance', '可灵', 'kling', 'minimax', '运镜',
  '打戏', '打戲', '三视图', '四视图', '角色设计', '立绘', '人设', '建模脸', '场景图',
  '角色资产', '投喂', '提示词', 'prompt', 'midjourney', 'flova', '旁白', '解说',
  '配音', '音色', 'bgm', '封面', '剪辑', '短剧导演', '漫剧导演', '画幅', '画风',
]

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function token() {
  const names = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT']
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

async function gh(url, signal) {
  const headers = {
    'user-agent': 'manju-skill-hub/1.0 (+dsh plugin)',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  const bearer = token()
  if (bearer.length > 0) headers.authorization = `Bearer ${bearer}`
  const response = await fetch(url, { headers, signal: signal ?? AbortSignal.timeout(25000) })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
  const remaining = response.headers.get('x-ratelimit-remaining')
  const reset = response.headers.get('x-ratelimit-reset')
  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
    remaining: remaining === null ? null : Number(remaining),
    resetAt: reset === null ? null : Number(reset) * 1000,
  }
}

function rateLimitMessage(result) {
  if (result.status !== 403 && result.status !== 429) return null
  const message = safeStr(result.json?.message)
  if (!/rate limit/i.test(message)) return null
  const when = result.resetAt === null ? '稍后' : new Date(result.resetAt).toLocaleString('zh-CN')
  return `GitHub API 限流（未配置 GITHUB_TOKEN 时每小时 60 次）。恢复时间：${when}。可在环境变量 GITHUB_TOKEN 里配置令牌提高额度。`
}

/** Relevance of one repository to the manju production domain. */
export function relevance(repo) {
  const text = [safeStr(repo.full_name), safeStr(repo.description), ...(Array.isArray(repo.topics) ? repo.topics : [])]
    .join(' \n ').toLowerCase()
  const hits = []
  let score = 0
  let coreHit = false
  for (const word of CORE) if (text.includes(word)) { hits.push(word); score += 10; coreHit = true }
  for (const word of STRONG) if (text.includes(word)) { hits.push(word); score += 3 }
  const strong = hits.filter(word => STRONG.includes(word)).length
  return { score, hits: [...new Set(hits)], accepted: coreHit || strong >= 2 }
}

function skillPathsFromTree(tree) {
  if (tree === null || !Array.isArray(tree.tree)) return []
  return tree.tree
    .map(node => safeStr(node.path))
    .filter(path => /(^|\/)SKILL\.md$/i.test(path) && !/^\./.test(path))
}

/** Run the configured GitHub searches and store verified candidates. */
export async function discover(state, config, options = {}) {
  const now = Date.now()
  const minHours = Number(config.githubMinIntervalHours ?? 6)
  if (!options.force && state.meta.lastGithubScanAt > 0 && now - state.meta.lastGithubScanAt < minHours * 3600_000) {
    return {
      skipped: true,
      reason: `距离上次 GitHub 扫描不足 ${minHours} 小时；如需立即扫描请用 force。`,
      lastGithubScanAt: state.meta.lastGithubScanAt,
    }
  }

  const queries = Array.isArray(config.queries) && config.queries.length > 0 ? config.queries : DEFAULT_QUERIES
  const candidates = new Map()
  const notes = []
  let searchCount = 0
  let rateLimited = null

  for (const query of queries) {
    if (rateLimited !== null) break
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`
    try {
      const result = await gh(url)
      if (!result.ok) {
        const limited = rateLimitMessage(result)
        if (limited !== null) { rateLimited = limited; break }
        notes.push(`搜索「${query}」失败：HTTP ${result.status}`)
        continue
      }
      searchCount += 1
      const items = Array.isArray(result.json?.items) ? result.json.items : []
      for (const repo of items) {
        if (repo.archived === true || repo.disabled === true || repo.fork === true) continue
        if ((repo.size ?? 0) <= 0) continue
        const rel = relevance(repo)
        if (!rel.accepted) continue
        const key = safeStr(repo.full_name)
        if (key.length === 0) continue
        const previous = candidates.get(key)
        if (previous === undefined || rel.score > previous.rel.score) {
          candidates.set(key, { repo, rel })
        }
      }
    } catch (error) {
      notes.push(`搜索「${query}」异常：${String(error?.message ?? error)}`)
    }
    await new Promise(done => setTimeout(done, 1100))
  }

  const ranked = [...candidates.values()]
    .sort((a, b) => b.rel.score - a.rel.score || (b.repo.stargazers_count ?? 0) - (a.repo.stargazers_count ?? 0))
  const verifyLimit = Math.max(0, Number(config.verifyReposPerRun ?? 10))
  const toVerify = ranked.slice(0, verifyLimit)
  const verified = []
  let skippedNoSkill = 0

  for (const { repo, rel } of toVerify) {
    const branch = safeStr(repo.default_branch) || 'main'
    try {
      const tree = await gh(`https://api.github.com/repos/${repo.full_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
      if (!tree.ok) continue
      const paths = skillPathsFromTree(tree.json)
      if (paths.length === 0) { skippedNoSkill += 1; continue }
      verified.push({ repo, rel, paths, branch })
    } catch {
      // A single failed tree read never fails the whole run.
    }
    await new Promise(done => setTimeout(done, 250))
  }

  const idOf = repo => `gh:${safeStr(repo.full_name).toLowerCase()}`
  const kept = new Set()
  for (const { repo, rel, paths, branch } of verified) {
    const id = idOf(repo)
    kept.add(id)
    const previous = state.discoveries.find(item => item.id === id)
    const record = {
      id,
      repo: safeStr(repo.full_name),
      owner: safeStr(repo.owner?.login),
      description: safeStr(repo.description),
      stars: Number(repo.stargazers_count ?? 0),
      forks: Number(repo.forks_count ?? 0),
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      license: safeStr(repo.license?.spdx_id),
      htmlUrl: safeStr(repo.html_url),
      branch,
      pushedAt: repo.pushed_at === null ? null : Date.parse(repo.pushed_at),
      updatedAt: repo.updated_at === null ? null : Date.parse(repo.updated_at),
      skillPaths: paths.slice(0, 20),
      score: rel.score,
      hits: rel.hits,
      status: previous?.status ?? 'pending',
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      lastRemindedAt: previous?.lastRemindedAt ?? 0,
      installedSkill: previous?.installedSkill ?? null,
      installPath: previous?.installPath ?? null,
    }
    if (previous === undefined) state.discoveries.push(record)
    else Object.assign(previous, record)
  }

  // Keep old discoveries (they are still installable), but drop ones whose repo
  // no longer verifies only after they have aged out.
  for (const item of state.discoveries) {
    if (kept.has(item.id)) continue
    if (item.status === 'pending' && now - item.lastSeenAt > 30 * 24 * 3600_000) item.status = 'stale'
  }

  state.meta.lastGithubScanAt = now
  state.meta.lastGithubScanError = rateLimited
  state.meta.lastGithubScanCount = verified.length

  const pending = state.discoveries.filter(item => item.status === 'pending').length
  return {
    skipped: false,
    searches: searchCount,
    candidates: ranked.length,
    verified: verified.length,
    rejectedNoSkillFile: skippedNoSkill,
    pending,
    newPending: verified.filter(item => item.status === 'pending').length,
    notes,
    error: rateLimited,
  }
}

function normalize(value) {
  return safeStr(value).toLowerCase().replace(/^dsh[-_]/, '').replace(/[-_]skill$/, '').replace(/[^a-z0-9]/g, '')
}

/** Best GitHub repository for one installed skill, if any. */
function repoForSkill(skill, state) {
  if (skill.install?.repo) return { repo: skill.install.repo, source: 'install-record' }
  const wanted = normalize(skill.name)
  for (const item of state.discoveries) {
    for (const path of item.skillPaths) {
      const folder = path.replace(/\/SKILL\.md$/i, '')
      const name = folder.split('/').pop()
      if (normalize(name) === wanted) return { repo: item.repo, source: 'discovery-path' }
    }
  }
  return null
}

/** Compare local install stamps with the upstream repository's last push. */
export async function checkUpdates(state, config) {
  const now = Date.now()
  const perRun = Math.max(1, Number(config.updateCheckPerRun ?? 15))
  const targets = new Map()
  for (const skill of Object.values(state.skills)) {
    const match = repoForSkill(skill, state)
    if (match === null) continue
    if (!targets.has(match.repo)) targets.set(match.repo, [])
    targets.get(match.repo).push({ skill, source: match.source })
  }

  let checkedRepos = 0
  let available = 0
  const notes = []
  let index = 0
  for (const [repo, entries] of targets) {
    if (index >= perRun) break
    index += 1
    try {
      const result = await gh(`https://api.github.com/repos/${repo}`)
      if (!result.ok) {
        const limited = rateLimitMessage(result)
        if (limited !== null) { notes.push(limited); break }
        continue
      }
      checkedRepos += 1
      const pushedAt = result.json?.pushed_at === null ? null : Date.parse(result.json.pushed_at)
      const stars = Number(result.json?.stargazers_count ?? 0)
      for (const { skill, source } of entries) {
        const baseline = skill.install?.pushedAtAtInstall ?? skill.install?.installedAt ?? skill.installedAt ?? skill.firstSeenAt
        const isNewer = pushedAt !== null && baseline !== null && pushedAt > baseline + 1000
        skill.update = {
          available: isNewer,
          repo,
          stars,
          remotePushedAt: pushedAt,
          checkedAt: now,
          source,
          reason: isNewer ? '上游仓库在本机安装之后有提交' : '本机版本不早于上游最近提交',
        }
        if (isNewer) available += 1
      }
    } catch (error) {
      notes.push(`${repo}: ${String(error?.message ?? error)}`)
    }
    await new Promise(done => setTimeout(done, 200))
  }

  // Every skill gets an explicit update verdict so the UI never implies a check
  // that could not run. Unlinked skills stay "no upstream repository" instead
  // of a permanent "not checked".
  for (const skill of Object.values(state.skills)) {
    if (skill.update !== null && typeof skill.update?.repo === 'string' && skill.update.repo.length > 0) continue
    skill.update = {
      available: false,
      repo: null,
      stars: null,
      remotePushedAt: null,
      checkedAt: now,
      source: null,
      reason: '本机技能未关联到 GitHub 上游仓库',
    }
  }

  state.meta.lastUpdateCheckAt = now
  return { checked: checkedRepos, skills: [...targets.values()].reduce((sum, list) => sum + list.length, 0), available, notes }
}

/* ── tar extraction (GitHub codeload tarball) ─────────────────────────── */

/** Parse a ustar/pax tar buffer into file entries. */
export function parseTar(buffer) {
  const entries = []
  let offset = 0
  let longName = null
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const read = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/, '')
    const rawName = read(0, 100)
    const size = parseInt(read(124, 12).trim() || '0', 8)
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156])
    const prefix = read(345, 155)
    const name = prefix.length > 0 ? `${prefix}/${rawName}` : rawName
    const dataStart = offset + 512
    const data = buffer.subarray(dataStart, dataStart + size)
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0.*$/, '')
    } else if (type === 'x') {
      const pax = data.toString('utf8')
      const match = /(?:^|\n)\d+ path=([^\n]+)/.exec(pax)
      if (match) longName = match[1]
    } else if (type === '0' || type === '\0') {
      entries.push({ name: longName ?? name, type: 'file', data })
      longName = null
    } else if (type === '5') {
      entries.push({ name: longName ?? name, type: 'dir' })
      longName = null
    } else {
      longName = null
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

function isInside(parent, child) {
  const root = resolve(parent)
  const target = resolve(child)
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Download one skill folder out of a repository and install it under
 * $DSH_HOME/skills/<name>. Existing directories are never overwritten.
 */
export async function installSkill(state, config, request) {
  const id = safeStr(request.id)
  const wantedPath = safeStr(request.skillPath)
  const by = request.by === 'agent' ? 'agent' : 'user'
  const item = state.discoveries.find(entry => entry.id === id)
  if (item === undefined) return { ok: false, error: `未找到待安装条目 ${id}` }
  const skillPath = wantedPath.length > 0 ? wantedPath : item.skillPaths[0]
  if (typeof skillPath !== 'string' || !/SKILL\.md$/i.test(skillPath)) {
    return { ok: false, error: '该仓库没有可安装的 SKILL.md 路径' }
  }
  const folder = skillPath.replace(/\/SKILL\.md$/i, '').replace(/^\/+/, '')
  const name = folder.split('/').pop()
  if (!/^[A-Za-z0-9._-]+$/.test(name ?? '')) return { ok: false, error: `技能名不合法：${name}` }

  const root = skillsRoot()
  const target = join(root, name)
  if (!isInside(root, target)) return { ok: false, error: '目标路径越界，已拒绝' }
  const existing = await stat(target).catch(() => null)
  if (existing !== null) return { ok: false, error: `技能目录已存在，未覆盖：${target}` }

  const branch = item.branch || 'main'
  const url = `https://codeload.github.com/${item.repo}/tar.gz/refs/heads/${encodeURIComponent(branch)}`
  let archive
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'manju-skill-hub/1.0' },
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok) return { ok: false, error: `下载失败：HTTP ${response.status}` }
    archive = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    return { ok: false, error: `下载失败：${String(error?.message ?? error)}` }
  }

  let entries
  try {
    entries = parseTar(gunzipSync(archive))
  } catch (error) {
    return { ok: false, error: `解压失败：${String(error?.message ?? error)}` }
  }

  const wanted = entries.find(entry => entry.type === 'file' && entry.name.replace(/^[^/]+\//, '') === `${folder}/SKILL.md`)
  if (wanted === undefined) return { ok: false, error: `压缩包里找不到 ${folder}/SKILL.md` }
  const top = wanted.name.slice(0, wanted.name.length - `${folder}/SKILL.md`.length)
  const files = entries.filter(entry => entry.type === 'file' && entry.name.startsWith(`${top}${folder}/`))

  let written = 0
  for (const entry of files) {
    const relative = entry.name.slice(top.length + folder.length + 1)
    if (relative.length === 0 || relative.includes('\0')) continue
    const destination = join(target, relative)
    if (!isInside(target, destination)) continue
    try {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, entry.data)
      written += 1
    } catch {
      // A single unreadable file should not abort an otherwise good install.
    }
  }
  if (written === 0) return { ok: false, error: '没有写入任何文件' }

  const installedAt = Date.now()
  state.installs[name] = {
    by,
    repo: item.repo,
    skillPath,
    ref: branch,
    installedAt,
    pushedAtAtInstall: item.pushedAt,
    lastUpdateBy: by,
  }
  item.status = 'installed'
  item.installedSkill = name
  item.installPath = target
  return { ok: true, name, target, repo: item.repo, files: written, by }
}
