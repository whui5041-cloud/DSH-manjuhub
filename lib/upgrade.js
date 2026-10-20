/**
 * One-click skill updater.
 *
 * Replaces a skill folder with the upstream repository's current head, keeping
 * a full backup first. The swap is folder-based (old folder moved aside, new
 * folder renamed into place) so a failure restores the previous version
 * without re-downloading anything.
 *
 * Kept out of the entry module so it can be exercised by tests with an isolated
 * skills root.
 */
import { basename, dirname, join } from 'node:path'
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { parseTar } from './github-scout.js'

function isUnderPath(parent, child) {
  const normalize = value => String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(`${root}/`)
}

function stampNow() {
  // Millisecond precision: two quick operations must not share a backup dir.
  return new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.(\d{3})Z$/, '-$1')
}

/** Best known upstream repository + SKILL.md path for one installed skill. */
export function upstreamOf(state, skill) {
  const install = state.installs?.[skill.name] ?? {}
  let repo = typeof install.repo === 'string' && install.repo.length > 0 ? install.repo : null
  let skillPath = typeof install.skillPath === 'string' && install.skillPath.length > 0 ? install.skillPath : null
  let branch = typeof install.ref === 'string' && install.ref.length > 0 ? install.ref : null
  for (const item of state.discoveries ?? []) {
    if (repo !== null && item.repo !== repo) continue
    if (skillPath === null) {
      const hit = (item.skillPaths ?? []).find(path => basename(path.replace(/\/SKILL\.md$/i, '')) === skill.name)
      if (hit !== undefined) {
        repo = item.repo
        branch = branch ?? item.branch
        skillPath = hit
      }
    }
    if (repo !== null && skillPath !== null) break
  }
  if (repo === null || skillPath === null) return null
  return { repo, branch: branch || 'main', skillPath }
}

/**
 * Update one still-installed skill from GitHub.
 * @returns {Promise<{ok: true, name: string, repo: string, skillPath: string, files: number, backupDir: string, previousVersion: string | null} | {ok: false, name: string, error: string}>}
 */
export async function updateSkillCore({ state, name, skillsRoot, hubDir, by = 'user', rescan, log }) {
  const skill = state.skills?.[name]
  if (skill === undefined) return { ok: false, name, error: `未找到技能 ${name}` }
  const target = skill.path
  if (typeof target !== 'string' || target.length === 0 || !isUnderPath(skillsRoot, target)) {
    return { ok: false, name, error: '该技能不在技能目录内，无法自动更新' }
  }
  const upstream = upstreamOf(state, skill)
  if (upstream === null) return { ok: false, name, error: '该技能未关联 GitHub 上游仓库，无法自动更新' }
  const item = (state.discoveries ?? []).find(entry => entry.repo === upstream.repo)
  const folder = upstream.skillPath.replace(/\/SKILL\.md$/i, '').replace(/^\/+/, '')
  const branch = upstream.branch || item?.branch || 'main'

  let archive
  try {
    const response = await fetch(`https://codeload.github.com/${upstream.repo}/tar.gz/refs/heads/${encodeURIComponent(branch)}`, {
      headers: { 'user-agent': 'manju-skill-hub/1.0' },
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok) return { ok: false, name, error: `下载失败：HTTP ${response.status}` }
    archive = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    return { ok: false, name, error: `下载失败：${String(error?.message ?? error)}` }
  }

  let entries
  try {
    entries = parseTar(gunzipSync(archive))
  } catch (error) {
    return { ok: false, name, error: `解压失败：${String(error?.message ?? error)}` }
  }
  const marker = `${folder}/SKILL.md`
  const wanted = entries.find(entry => entry.type === 'file' && entry.name.replace(/^[^/]+\//, '') === marker)
  if (wanted === undefined) return { ok: false, name, error: `上游压缩包里找不到 ${marker}` }
  const top = wanted.name.slice(0, wanted.name.length - marker.length)
  const files = entries.filter(entry => entry.type === 'file' && entry.name.startsWith(`${top}${folder}/`))
  if (files.length === 0) return { ok: false, name, error: '上游压缩包没有可写入的文件' }

  const stamp = stampNow()
  const backupDir = join(hubDir, 'backups', `${name}-${stamp}`)
  const tmpDir = join(hubDir, 'tmp', `${name}-${stamp}`)
  const oldDir = join(hubDir, 'tmp', `${name}-${stamp}-old`)
  try {
    await cp(target, backupDir, { recursive: true, force: true })
    await rm(tmpDir, { recursive: true, force: true })
    await mkdir(tmpDir, { recursive: true })
    for (const entry of files) {
      const relative = entry.name.slice(top.length + folder.length + 1)
      if (relative.length === 0 || relative.includes('\0')) continue
      const destination = join(tmpDir, relative)
      if (!isUnderPath(tmpDir, destination)) continue
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, entry.data)
    }
    await rm(oldDir, { recursive: true, force: true })
    await rename(target, oldDir)
    try {
      await rename(tmpDir, target)
    } catch (error) {
      await rename(oldDir, target).catch(() => null)
      throw error
    }
    await rm(oldDir, { recursive: true, force: true }).catch(() => null)
    await rm(tmpDir, { recursive: true, force: true }).catch(() => null)
  } catch (error) {
    return { ok: false, name, error: `替换失败，旧版本已保留：${String(error?.message ?? error)}` }
  }

  const now = Date.now()
  const previous = state.installs?.[name] ?? {}
  state.installs = state.installs ?? {}
  state.installs[name] = {
    ...previous,
    by: previous.by ?? (by === 'agent' ? 'agent' : 'user'),
    lastUpdateBy: by === 'agent' ? 'agent' : 'user',
    lastUpdatedAt: now,
    repo: upstream.repo,
    skillPath: upstream.skillPath,
    ref: branch,
    installedAt: previous.installedAt ?? skill.installedAt ?? now,
    pushedAtAtInstall: item?.pushedAt ?? null,
    backupDir,
  }
  if (state.skills[name] !== undefined) {
    state.skills[name].update = {
      available: false,
      repo: upstream.repo,
      stars: item?.stars ?? null,
      remotePushedAt: item?.pushedAt ?? null,
      checkedAt: now,
      source: 'update',
      reason: '已更新到上游最新',
    }
  }
  if (typeof rescan === 'function') await rescan()
  log?.(`updated ${name} from ${upstream.repo} (${files.length} files) · backup ${backupDir}`)
  return {
    ok: true,
    name,
    repo: upstream.repo,
    skillPath: upstream.skillPath,
    files: files.length,
    backupDir,
    previousVersion: skill.version ?? null,
  }
}

/** Update every skill currently flagged as updatable (cap 25). */
export async function updateAllCore({ state, skillsRoot, hubDir, by = 'user', rescan, log }) {
  const names = Object.values(state.skills ?? {})
    .filter(skill => skill.update?.available === true && upstreamOf(state, skill) !== null)
    .map(skill => skill.name)
    .slice(0, 25)
  const results = []
  for (const name of names) {
    try {
      results.push(await updateSkillCore({ state, name, skillsRoot, hubDir, by, rescan, log }))
    } catch (error) {
      results.push({ ok: false, name, error: String(error?.message ?? error) })
    }
  }
  return { ok: true, attempted: names.length, updated: results.filter(result => result.ok === true).length, results }
}
