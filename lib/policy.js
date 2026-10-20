/**
 * Policy layer for the Manju Skill Hub: version pins, automatic-update
 * settings, semantic version comparison, drift detection and upstream probing.
 *
 * Nothing here writes to disk — callers persist `state` through state.js, which
 * keeps this module usable from a scheduled tick and from the HTTP API alike.
 * Every function tolerates a missing / partial state document.
 */

const DEFAULT_SETTINGS = Object.freeze({
  autoUpdate: false,
  autoUpdateExclude: Object.freeze([]),
  muteUntil: 0,
})

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

/** True for a hub state document (not for an options object wrapping one). */
function isStateLike(value) {
  return value !== null && typeof value === 'object'
    && ('skills' in value || 'discoveries' in value || 'meta' in value || 'pins' in value || 'settings' in value)
}

/** Accept both `fn(state, ...)` and `fn({ state, ... })`. */
function stateArg(value) {
  if (isStateLike(value)) return value
  if (value !== null && typeof value === 'object' && isStateLike(value.state)) return value.state
  return null
}

/** Normalized settings view; never mutates and always returns fresh arrays. */
export function settingsOf(state) {
  const doc = stateArg(state) ?? {}
  const raw = doc.settings !== null && typeof doc.settings === 'object' ? doc.settings : {}
  const muteUntil = Number(raw.muteUntil)
  return {
    autoUpdate: raw.autoUpdate === true,
    autoUpdateExclude: Array.isArray(raw.autoUpdateExclude)
      ? raw.autoUpdateExclude.filter(item => typeof item === 'string' && item.length > 0)
      : [],
    muteUntil: Number.isFinite(muteUntil) && muteUntil > 0 ? muteUntil : 0,
  }
}

function normalizeExclude(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const item of value) {
    const name = safeStr(item).trim()
    if (name.length === 0 || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/* ── pins ──────────────────────────────────────────────────────────────── */

function pinsOf(state) {
  return state.pins !== null && typeof state.pins === 'object' && !Array.isArray(state.pins) ? state.pins : null
}

/**
 * True when the user pinned this skill's version (automatic update must skip it).
 * @param {object} state
 * @param {string} name
 */
export function isPinned(state, name) {
  const doc = stateArg(state)
  if (doc === null) return false
  const skillName = typeof name === 'string' ? name : safeStr(state?.name)
  if (skillName.length === 0) return false
  const pins = pinsOf(doc)
  if (pins === null) return false
  const pin = pins[skillName]
  return pin !== null && typeof pin === 'object'
}

/**
 * Pin one skill to its current version.
 * Accepts pinSkill(state, name, {repo, version}) or pinSkill({state, name, repo, version}).
 * @returns {{ok: true, name: string, pin: {at: number, repo: string|null, version: string|null}} | {ok: false, error: string}}
 */
export function pinSkill(a, b, c) {
  let state = null
  let name = ''
  let info = {}
  if (isStateLike(a)) {
    state = a
    name = safeStr(b)
    info = c !== null && typeof c === 'object' ? c : {}
  } else if (a !== null && typeof a === 'object' && isStateLike(a.state)) {
    state = a.state
    name = safeStr(a.name)
    info = a
  }
  if (state === null) return { ok: false, error: '缺少 state' }
  if (name.length === 0) return { ok: false, error: '缺少技能名' }
  if (state.pins === null || typeof state.pins !== 'object' || Array.isArray(state.pins)) state.pins = {}
  const at = Number.isFinite(Number(info.at)) && Number(info.at) > 0 ? Number(info.at) : Date.now()
  const pin = {
    at,
    repo: safeStr(info.repo).trim().length > 0 ? safeStr(info.repo).trim() : null,
    version: info.version === undefined || info.version === null ? null : String(info.version),
  }
  state.pins[name] = pin
  return { ok: true, name, pin }
}

/**
 * Remove one pin.
 * @returns {{ok: true, name: string, removed: boolean} | {ok: false, error: string}}
 */
export function unpinSkill(a, b) {
  let state = null
  let name = ''
  if (isStateLike(a)) {
    state = a
    name = safeStr(b)
  } else if (a !== null && typeof a === 'object' && isStateLike(a.state)) {
    state = a.state
    name = safeStr(a.name)
  }
  if (state === null) return { ok: false, error: '缺少 state' }
  if (name.length === 0) return { ok: false, error: '缺少技能名' }
  const pins = pinsOf(state)
  if (pins === null || pins[name] === undefined) return { ok: true, name, removed: false }
  delete pins[name]
  return { ok: true, name, removed: true }
}

/** Number of pinned skills. */
export function pinnedCount(state) {
  const doc = stateArg(state)
  const pins = doc === null ? null : pinsOf(doc)
  return pins === null ? 0 : Object.keys(pins).length
}

/* ── automatic update settings ─────────────────────────────────────────── */

/** True when the user opted in to unattended updates. */
export function autoUpdateEnabled(state) {
  return settingsOf(state).autoUpdate === true
}

/**
 * Turn unattended updates on/off (optionally with a per-skill exclusion list).
 * Accepts setAutoUpdate(state, enabled, {exclude}) or setAutoUpdate({state, enabled, exclude}).
 * @returns {{ok: true, settings: object} | {ok: false, error: string}}
 */
export function setAutoUpdate(a, b, c) {
  let state = null
  let patch = {}
  if (isStateLike(a)) {
    state = a
    if (typeof b === 'boolean') patch = { enabled: b, ...(c !== null && typeof c === 'object' ? c : {}) }
    else if (b !== null && typeof b === 'object') patch = b
  } else if (a !== null && typeof a === 'object' && isStateLike(a.state)) {
    state = a.state
    patch = a
  }
  if (state === null) return { ok: false, error: '缺少 state' }
  const current = settingsOf(state)
  const enabled = patch.enabled === undefined ? current.autoUpdate : patch.enabled === true
  const exclude = patch.autoUpdateExclude ?? patch.exclude
  state.settings = {
    ...current,
    autoUpdate: enabled,
    autoUpdateExclude: normalizeExclude(exclude === undefined ? current.autoUpdateExclude : exclude),
  }
  return { ok: true, settings: { ...state.settings, autoUpdateExclude: [...state.settings.autoUpdateExclude] } }
}

/** True when this skill is excluded from unattended updates. */
export function isAutoUpdateExcluded(state, name) {
  const skillName = safeStr(name)
  return settingsOf(state).autoUpdateExclude.includes(skillName)
}

/**
 * Skills that are up to date enough to be updated unattended: upstream has a
 * newer version, the skill is not pinned, and it is not in the exclusion list.
 * The caller still has to check autoUpdateEnabled(state) before acting — this
 * only answers "which ones would qualify".
 * @returns {string[]}
 */
export function autoUpdateCandidates(state) {
  const doc = stateArg(state)
  if (doc === null) return []
  const settings = settingsOf(doc)
  const pins = pinsOf(doc) ?? {}
  const excluded = new Set(settings.autoUpdateExclude)
  const skills = doc.skills !== null && typeof doc.skills === 'object' ? doc.skills : {}
  const out = []
  for (const [name, skill] of Object.entries(skills)) {
    if (skill === null || typeof skill !== 'object') continue
    if (skill.update?.available !== true) continue
    if (pins[name] !== undefined && pins[name] !== null) continue
    if (excluded.has(name)) continue
    out.push(name)
  }
  return out.sort((x, y) => x.localeCompare(y))
}

/* ── versions ──────────────────────────────────────────────────────────── */

function parseVersion(value) {
  const text = String(value ?? '').trim().replace(/^v/i, '')
  if (text.length === 0) return { nums: [0, 0, 0], pre: '' }
  const withoutBuild = text.split('+')[0]
  const dash = withoutBuild.indexOf('-')
  const main = dash >= 0 ? withoutBuild.slice(0, dash) : withoutBuild
  const pre = dash >= 0 ? withoutBuild.slice(dash + 1) : ''
  const parts = main.split('.')
  const nums = [0, 0, 0]
  for (let i = 0; i < 3; i += 1) {
    const parsed = Number.parseInt(parts[i] ?? '0', 10)
    nums[i] = Number.isFinite(parsed) ? parsed : 0
  }
  return { nums, pre }
}

function comparePrerelease(a, b) {
  const left = a.split('.')
  const right = b.split('.')
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff > 0 ? 1 : -1
      continue
    }
    if (xNumeric) return -1
    if (yNumeric) return 1
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/**
 * Semantic version comparison.
 * @returns {-1 | 0 | 1} -1 when a < b, 0 when equal, 1 when a > b.
 * Missing / non-numeric versions compare as 0.0.0; a release outranks its own
 * prerelease (1.0.0 > 1.0.0-beta).
 */
export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i += 1) {
    if (left.nums[i] !== right.nums[i]) return left.nums[i] > right.nums[i] ? 1 : -1
  }
  if (left.pre === right.pre) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  return comparePrerelease(left.pre, right.pre)
}

function normalizeVersionString(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim().replace(/^v/i, '')
  if (text.length === 0) return null
  if (/^(unknown|none|null|undefined|n\/a)$/i.test(text)) return null
  return text
}

/**
 * Local-vs-upstream version drift.
 * @returns {{drift: -1|0|1|null, local: string|null, remote: string|null}}
 *          drift -1 = local older (update available), 0 = same, 1 = local newer,
 *          null = at least one side unknown.
 */
export function versionDrift(local, remote) {
  const left = normalizeVersionString(local)
  const right = normalizeVersionString(remote)
  if (left === null || right === null) return { drift: null, local: left, remote: right }
  return { drift: compareVersions(left, right), local: left, remote: right }
}

/* ── upstream probe ────────────────────────────────────────────────────── */

function githubToken(explicit) {
  const given = safeStr(explicit).trim()
  if (given.length > 0) return given
  for (const name of ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT']) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

function repoSlug(repo) {
  let text = safeStr(repo).trim()
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, '')
  text = text.replace(/^\/?repos\//i, '')
  text = text.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')
  const parts = text.split('/').filter(part => part.length > 0)
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : ''
}

/**
 * Probe one GitHub repository for archived / disabled state and last push.
 * Never throws: a 404 or network failure becomes {ok:false, error}.
 * @param {string} repo 'owner/repo' (URLs are tolerated)
 * @param {string} [token] optional GitHub token; falls back to GITHUB_TOKEN etc.
 * @returns {Promise<{ok: boolean, archived: boolean, disabled: boolean, pushedAt: string|null, fullName: string|null, error: string|null}>}
 */
export async function probeRepo(repo, token) {
  const slug = repoSlug(repo)
  const miss = { ok: false, archived: false, disabled: false, pushedAt: null, fullName: null }
  if (slug.length === 0) return { ...miss, error: '仓库名无效，应为 owner/repo' }

  const headers = {
    'user-agent': 'manju-skill-hub/1.0 (+dsh plugin)',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  const bearer = githubToken(token)
  if (bearer.length > 0) headers.authorization = `Bearer ${bearer}`

  let response
  try {
    response = await fetch(`https://api.github.com/repos/${slug}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    return { ...miss, error: `请求失败：${String(error?.message ?? error)}` }
  }

  let text = ''
  try { text = await response.text() } catch { /* body optional */ }
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON error body */ }

  if (response.status === 404) {
    return { ...miss, error: `上游仓库不存在或已改名：${slug}（HTTP 404）` }
  }
  if (!response.ok) {
    const message = safeStr(json?.message)
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(message)) {
      const reset = response.headers.get('x-ratelimit-reset')
      const when = reset === null ? '稍后' : new Date(Number(reset) * 1000).toLocaleString('zh-CN')
      return { ...miss, fullName: slug, error: `GitHub API 限流，恢复时间约 ${when}（可在 GITHUB_TOKEN 配置令牌提高额度）` }
    }
    return { ...miss, fullName: slug, error: `上游查询失败：HTTP ${response.status}${message.length > 0 ? ` · ${message}` : ''}` }
  }

  return {
    ok: true,
    archived: json?.archived === true,
    disabled: json?.disabled === true,
    pushedAt: typeof json?.pushed_at === 'string' ? json.pushed_at : null,
    fullName: safeStr(json?.full_name).length > 0 ? json.full_name : slug,
    error: null,
  }
}

export { DEFAULT_SETTINGS }
