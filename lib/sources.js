/**
 * Repository source parsing for the Manju Skill Hub.
 *
 * The hub can read skill archives from GitHub, Gitee and GitLab. Every reader
 * shares one canonical shape — { host, repo, slug } — so install / update /
 * probe code does not re-parse URLs:
 *   host  'github' | 'gitee' | 'gitlab'
 *   repo  canonical repository path, e.g. 'owner/repo' (GitLab keeps nested
 *         groups: 'group/sub/repo'), case preserved
 *   slug  filesystem/URL-safe folder fragment derived from `repo`
 *
 * Pure functions, zero dependencies, no I/O.
 */

const DOMAINS = { github: 'github.com', gitee: 'gitee.com', gitlab: 'gitlab.com' }

/**
 * Web URL segments that terminate the repository part of a URL. They appear in
 * /tree/main, /repository/archive/..., /-/archive/..., /releases, ...
 */
const STOP_SEGMENTS = new Set([
  '-', 'tree', 'blob', 'raw', 'archive', 'releases', 'release', 'issues', 'issue',
  'pulls', 'pull', 'merge_requests', 'tags', 'commits', 'commit', 'wiki',
  'actions', 'branches', 'compare', 'network', 'graphs', 'settings', 'repository',
])

/** One repository path segment: GitHub/Gitee/GitLab allow letters, digits, . _ - */
const SEGMENT = /^[A-Za-z0-9._-]+$/
const MAX_SEGMENT = 100

/** Explicit `github:owner/repo` style prefixes. */
const PREFIX_HOSTS = { gh: 'github', github: 'github', gitee: 'gitee', gitlab: 'gitlab' }

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function hostOf(hostname) {
  const host = safeStr(hostname).toLowerCase().replace(/^www\./, '')
  if (host === 'github.com' || host === 'api.github.com') return 'github'
  if (host === 'gitee.com') return 'gitee'
  if (host === 'gitlab.com') return 'gitlab'
  return null
}

function splitPath(path) {
  return safeStr(path)
    .split('/')
    .map(part => {
      let value
      try { value = decodeURIComponent(part.trim()) } catch { value = part.trim() }
      // `owner/repo.git` in a web URL names the same repository as `owner/repo`.
      return value.replace(/\.git$/i, '')
    })
    .filter(part => part.length > 0)
}

/** True when `repo` is a usable owner/repo (or GitLab group/sub/repo) path. */
export function isRepoPath(repo) {
  const parts = safeStr(repo).split('/')
  if (parts.length < 2 || parts.length > 8) return false
  return parts.every(part => part.length <= MAX_SEGMENT
    && SEGMENT.test(part)
    && part !== '.'
    && part !== '..')
}

/**
 * Repository part of a web/API path.
 * GitHub and Gitee always use exactly owner/repo; GitLab supports nested
 * groups, so keep every segment until a known URL verb shows up.
 */
function repoFromSegments(host, segments) {
  const kept = []
  for (const segment of segments) {
    if (STOP_SEGMENTS.has(segment.toLowerCase())) break
    kept.push(segment)
    if (host !== 'gitlab' && kept.length === 2) break
  }
  if (kept.length < 2) return null
  const repo = kept.slice(0, host === 'gitlab' ? 8 : 2).join('/')
  return isRepoPath(repo) ? repo : null
}

function slugOf(repo) {
  const slug = safeStr(repo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'skill'
}

/**
 * Parse any repository reference into { host, repo, slug }.
 *
 * Accepted inputs:
 *   owner/repo
 *   github:owner/repo · gh:owner/repo · gitee:owner/repo / gitlab:owner/repo
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo(.git)(/tree/main/...)
 *   https://gitee.com/owner/repo(/repository/archive/...)
 *   https://gitlab.com/group/sub/repo(/-/archive/...)
 *
 * @returns {{host: 'github'|'gitee'|'gitlab', repo: string, slug: string} | null}
 *          null when the input is empty or not a recognized repository.
 */
export function parseSource(input) {
  if (input !== null && typeof input === 'object') {
    const repo = safeStr(input.repo)
    const host = safeStr(input.host).toLowerCase()
    if (host in DOMAINS && isRepoPath(repo)) return { host, repo, slug: slugOf(repo) }
    if (isRepoPath(repo)) return { host: 'github', repo, slug: slugOf(repo) }
    return null
  }

  let raw = safeStr(input).trim()
  if (raw.length === 0) return null

  // git@github.com:owner/repo.git (scp-like SSH form)
  const ssh = /^git@([^:/]+):(.+)$/i.exec(raw)
  if (ssh !== null) {
    const host = hostOf(ssh[1])
    if (host === null) return null
    const repo = repoFromSegments(host, splitPath(ssh[2].replace(/\.git$/i, '')))
    return repo === null ? null : { host, repo, slug: slugOf(repo) }
  }

  // Explicit host prefix: gh:owner/repo, github:owner/repo, ...
  const prefixed = /^(gh|github|gitee|gitlab):(.+)$/i.exec(raw)
  if (prefixed !== null) {
    const host = PREFIX_HOSTS[prefixed[1].toLowerCase()] ?? null
    if (host === null) return null
    const repo = repoFromSegments(host, splitPath(prefixed[2]))
    return repo === null ? null : { host, repo, slug: slugOf(repo) }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url
    try { url = new URL(raw) } catch { return null }
    const host = hostOf(url.hostname)
    if (host === null) return null
    const repo = repoFromSegments(host, splitPath(url.pathname))
    return repo === null ? null : { host, repo, slug: slugOf(repo) }
  }

  // Bare path: a known host may still be spelled out first.
  raw = raw.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  const segments = splitPath(raw)
  if (segments.length === 0) return null
  const leadingHost = hostOf(segments[0])
  const host = leadingHost ?? 'github'
  const repo = repoFromSegments(host, leadingHost === null ? segments : segments.slice(1))
  return repo === null ? null : { host, repo, slug: slugOf(repo) }
}

/** Encode a git ref for a URL path while keeping its slashes. */
function encodeRef(ref) {
  return safeStr(ref)
    .split('/')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => encodeURIComponent(part))
    .join('/')
}

/**
 * Source archive URL for one repository ref.
 *
 * @param {string | {host: string, repo: string}} source
 * @param {string} [branch='main']
 * @returns {string | null} null when the source is not recognized.
 */
export function tarballUrl(source, branch = 'main') {
  const parsed = typeof source === 'string' ? parseSource(source) : parseSource(source)
  if (parsed === null) return null
  const repo = parsed.repo
  if (!isRepoPath(repo)) return null
  const ref = encodeRef(branch).length > 0 ? encodeRef(branch) : 'main'
  if (parsed.host === 'github') return `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`
  if (parsed.host === 'gitee') return `https://gitee.com/${repo}/repository/archive/${ref}.tar.gz`
  if (parsed.host === 'gitlab') {
    const folder = repo.split('/').pop()
    return `https://gitlab.com/${repo}/-/archive/${ref}/${folder}-${ref}.tar.gz`
  }
  return null
}

/**
 * Human-facing repository page.
 * @param {string | {host: string, repo: string}} source
 * @returns {string | null}
 */
export function webUrl(source) {
  const parsed = parseSource(source)
  if (parsed === null) return null
  const domain = DOMAINS[parsed.host]
  return domain === undefined ? null : `https://${domain}/${parsed.repo}`
}
