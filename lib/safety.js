/**
 * Data-safety layer for the Manju Skill Hub: backup inventory, retention
 * pruning, snapshot / recycle / export / import of skill folders.
 *
 * Every backup is a full directory copy under hubDir/backups, named
 * `<skill>-<kind>-<stamp>` (see history.js / upgrade.js). This module reads that
 * same layout, so pruning never has to know which feature made a backup.
 *
 * All functions are defensive: a missing directory yields an empty result
 * instead of an exception, and every destructive path is re-checked to live
 * inside the managed roots before anything is removed.
 */
import { cp, lstat, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

/** Backup kinds produced elsewhere in the hub, longest suffix first. */
const BACKUP_KINDS = [
  'pre-rollback',
  'snapshot',
  'recycle',
  'custom',
  'import',
  'export',
  'manual',
  'rollback',
  'update',
]

/** Millisecond stamps (history.js / skill-write.js) and plain ms epochs (snapshots). */
const STAMP_PATTERNS = [
  /^(.*)-(\d{8})-(\d{6})-(\d{3})$/,
  /^(.*)-(\d{8})-(\d{6})$/,
  /^(.*)-(\d{13})$/,
  /^(.*)-(\d{10})$/,
]

const DEFAULT_KEEP_PER_SKILL = 5
const DEFAULT_MAX_TOTAL_BYTES = 2_000_000_000

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function isUnderPath(parent, child) {
  if (safeStr(parent).length === 0 || safeStr(child).length === 0) return false
  const root = resolve(parent).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const target = resolve(child).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return target === root || target.startsWith(`${root}/`)
}

function stampNow() {
  // Millisecond precision and lexicographically sortable, same as history.js.
  return new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.(\d{3})Z$/, '-$1')
}

function messageOf(error) {
  return String(error?.message ?? error)
}

/** Split a backup directory name into { skill, kind, stamp }. */
function parseBackupName(dirName) {
  const name = safeStr(dirName)
  for (const pattern of STAMP_PATTERNS) {
    const match = pattern.exec(name)
    if (match === null) continue
    const prefix = match[1]
    const stamp = name.slice(prefix.length + 1)
    const lower = prefix.toLowerCase()
    for (const kind of BACKUP_KINDS) {
      const suffix = `-${kind}`
      if (lower.endsWith(suffix)) {
        return { skill: prefix.slice(0, prefix.length - suffix.length), kind, stamp }
      }
    }
    return { skill: prefix, kind: 'backup', stamp }
  }
  return { skill: name, kind: 'other', stamp: '' }
}

/** Recursive file count + byte size. Symlinks are counted, never followed. */
async function usageOf(dir) {
  const root = safeStr(dir)
  let files = 0
  let bytes = 0
  if (root.length === 0) return { files, bytes }
  const walk = async current => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      files += 1
      try {
        const info = await lstat(full)
        bytes += Number(info.size) || 0
      } catch {
        // Unreadable entry: it still exists, so it is still counted.
      }
    }
  }
  await walk(root)
  return { files, bytes }
}

async function statOrNull(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

async function isDirectory(path) {
  const info = await statOrNull(path)
  return info !== null && info.isDirectory()
}

async function isFile(path) {
  const info = await statOrNull(path)
  return info !== null && info.isFile()
}

async function exists(path) {
  return (await statOrNull(path)) !== null
}

/** Backup subdirectories, newest first (mtime, then name for a stable order). */
async function listBackupDirs(hubDir) {
  const root = join(safeStr(hubDir), 'backups')
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    const info = await statOrNull(path)
    if (info === null || !info.isDirectory()) continue
    dirs.push({
      path,
      dirName: entry.name,
      mtimeMs: Number(info.mtimeMs) || 0,
      ...parseBackupName(entry.name),
    })
  }
  dirs.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.dirName.localeCompare(b.dirName))
  return dirs
}

function clampCount(value, fallback, min) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.floor(parsed))
}

/**
 * Inventory of every backup directory.
 * @param {{hubDir: string}} options
 * @returns {Promise<{ok: true, count: number, totalBytes: number, bySkill: {name: string, count: number, bytes: number}[]}>}
 */
export async function backupStats({ hubDir } = {}) {
  const dirs = await listBackupDirs(hubDir)
  const bySkill = new Map()
  let totalBytes = 0
  for (const dir of dirs) {
    const usage = await usageOf(dir.path)
    totalBytes += usage.bytes
    const entry = bySkill.get(dir.skill) ?? { name: dir.skill, count: 0, bytes: 0 }
    entry.count += 1
    entry.bytes += usage.bytes
    bySkill.set(dir.skill, entry)
  }
  const list = [...bySkill.values()].sort((a, b) => (b.bytes - a.bytes) || a.name.localeCompare(b.name))
  return { ok: true, count: dirs.length, totalBytes, bySkill: list }
}

/**
 * Retention pruning.
 *
 * Per skill: keep the newest `keepPerSkill` backups, and never remove the single
 * newest backup of a skill (that is the only copy some users have).
 * Then: while the retained total exceeds `maxTotalBytes`, drop the oldest
 * non-newest backups until the budget is met.
 *
 * @param {{hubDir: string, keepPerSkill?: number, maxTotalBytes?: number, dryRun?: boolean}} options
 * @returns {Promise<{ok: true, removed: {path: string, bytes: number}[], kept: number, freedBytes: number}>}
 */
export async function pruneBackups({
  hubDir,
  keepPerSkill = DEFAULT_KEEP_PER_SKILL,
  maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
  dryRun = false,
} = {}) {
  const dirs = await listBackupDirs(hubDir)
  if (dirs.length === 0) return { ok: true, removed: [], kept: 0, freedBytes: 0 }

  const keepN = clampCount(keepPerSkill, DEFAULT_KEEP_PER_SKILL, 1)
  const limit = clampCount(maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, 1)

  for (const dir of dirs) {
    const usage = await usageOf(dir.path)
    dir.bytes = usage.bytes
    dir.files = usage.files
  }

  const groups = new Map()
  for (const dir of dirs) {
    const group = groups.get(dir.skill)
    if (group === undefined) groups.set(dir.skill, [dir])
    else group.push(dir)
  }

  const drop = new Set()
  for (const group of groups.values()) {
    // group[0] is the newest backup of this skill: always protected.
    for (const dir of group.slice(keepN)) drop.add(dir)
  }

  let keptBytes = dirs.reduce((sum, dir) => (drop.has(dir) ? sum : sum + dir.bytes), 0)
  if (keptBytes > limit) {
    const newestPerSkill = new Set([...groups.values()].map(group => group[0]))
    const oldestFirst = dirs.filter(dir => !drop.has(dir)).sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const dir of oldestFirst) {
      if (keptBytes <= limit) break
      if (newestPerSkill.has(dir)) continue
      drop.add(dir)
      keptBytes -= dir.bytes
    }
  }

  const removed = []
  let freedBytes = 0
  for (const dir of dirs) {
    if (!drop.has(dir)) continue
    if (!dryRun) {
      try {
        await rm(dir.path, { recursive: true, force: true })
      } catch {
        // Leave it counted as kept: it is still on disk.
        continue
      }
    }
    removed.push({ path: dir.path, bytes: dir.bytes })
    freedBytes += dir.bytes
  }
  return { ok: true, removed, kept: dirs.length - removed.length, freedBytes }
}

/**
 * Integrity check for one backup directory.
 * @param {string} dir
 * @returns {Promise<{ok: boolean, hasSkillMd: boolean, files: number, bytes: number}>}
 */
export async function verifyBackupDir(dir) {
  const root = safeStr(dir)
  const empty = { ok: false, hasSkillMd: false, files: 0, bytes: 0 }
  if (root.length === 0 || !(await isDirectory(root))) return empty
  const hasSkillMd = await isFile(join(root, 'SKILL.md'))
  const usage = await usageOf(root)
  return { ok: true, hasSkillMd, files: usage.files, bytes: usage.bytes }
}

function normalizeNames(names, state) {
  if (Array.isArray(names)) return names.filter(item => typeof item === 'string' && item.length > 0).slice(0, 200)
  if (typeof names === 'string') {
    return names.split(/[,，\s]+/).filter(item => item.length > 0).slice(0, 200)
  }
  const skills = state !== null && typeof state === 'object' && state.skills !== null && typeof state.skills === 'object'
    ? state.skills
    : {}
  return Object.keys(skills).slice(0, 200)
}

/**
 * Snapshot whole skill directories into backups/<name>-snapshot-<ms>.
 * @param {{state: object, hubDir: string, skillsRoot: string, names?: string|string[]}} options
 * @returns {Promise<{ok: boolean, backups: {name: string, dir: string}[], skipped: {name: string, reason: string}[]}>}
 */
export async function createSnapshot({ state, hubDir, skillsRoot, names } = {}) {
  const list = normalizeNames(names, state)
  const backups = []
  const skipped = []
  const backupRoot = join(safeStr(hubDir), 'backups')
  if (safeStr(hubDir).length === 0) return { ok: false, backups, skipped }

  for (const name of list) {
    const skill = state?.skills?.[name]
    const source = safeStr(skill?.path)
    if (source.length === 0 || !isUnderPath(skillsRoot, source) || !(await isDirectory(source))) {
      skipped.push({ name, reason: '技能目录不存在或不在技能目录内' })
      continue
    }
    try {
      await mkdir(backupRoot, { recursive: true })
      let dir = ''
      for (let attempt = 0; attempt < 1000; attempt += 1) {
        dir = join(backupRoot, `${name}-snapshot-${Date.now() + attempt}`)
        if (!(await exists(dir))) break
      }
      await cp(source, dir, { recursive: true, force: true })
      backups.push({ name, dir })
    } catch (error) {
      skipped.push({ name, reason: `快照失败：${messageOf(error)}` })
    }
  }
  return { ok: backups.length > 0 || skipped.length === 0, backups, skipped }
}

/**
 * Move one skill out of the library: full backup, delete the folder, drop the
 * state record and rescan. Nothing is lost — the backup dir is returned.
 * @param {{state: object, name: string, skillsRoot: string, hubDir: string, by?: 'user'|'agent', rescan?: Function}} options
 * @returns {Promise<{ok: true, backupDir: string, name: string} | {ok: false, error: string}>}
 */
export async function recycleSkill({ state, name, skillsRoot, hubDir, by, rescan } = {}) {
  const skillName = safeStr(name)
  if (skillName.length === 0) return { ok: false, error: '缺少技能名' }
  const skill = state !== null && typeof state === 'object' ? state.skills?.[skillName] : undefined
  const target = safeStr(skill?.path)
  if (target.length === 0 || !isUnderPath(skillsRoot, target) || resolve(target) === resolve(safeStr(skillsRoot))) {
    return { ok: false, error: '该技能不在技能目录内，无法回收' }
  }
  if (!(await isDirectory(target))) return { ok: false, error: '技能目录不存在，无法回收' }

  const backupRoot = join(safeStr(hubDir), 'backups')
  const backupDir = join(backupRoot, `${skillName}-recycle-${stampNow()}`)
  try {
    await mkdir(backupRoot, { recursive: true })
    await cp(target, backupDir, { recursive: true, force: true })
  } catch (error) {
    return { ok: false, error: `备份失败，已取消回收：${messageOf(error)}` }
  }
  try {
    await rm(target, { recursive: true, force: true })
  } catch (error) {
    return { ok: false, error: `删除失败（备份仍保留在 ${backupDir}）：${messageOf(error)}` }
  }

  delete state.skills[skillName]
  if (state.edits !== null && typeof state.edits === 'object') delete state.edits[skillName]
  if (typeof rescan === 'function') {
    try {
      await rescan()
    } catch {
      // A failed rescan does not undo the recycle; the next scan repairs state.
    }
  }
  return { ok: true, name: skillName, backupDir, by: by === 'agent' ? 'agent' : 'user' }
}

function readmeText(count, exportedAt) {
  return [
    '漫剧技能中枢 · 技能库导出',
    '',
    `导出时间：${exportedAt}`,
    `技能数量：${count}`,
    '',
    '目录结构：',
    '  manifest.json   技能清单（名称 / 版本 / 来源仓库）',
    '  skills/         每个技能的完整目录（含 SKILL.md）',
    '',
    '如何恢复：',
    '  1) 在漫剧技能中枢里执行导入（manju_skill_hub action=import source=<这个目录>）；',
    '  2) 或把 skills/ 下的目录逐个复制回本机技能目录（$DSH_HOME/skills）。',
    '导入默认跳过已存在的同名技能，不会覆盖本机现有版本。',
    '',
  ].join('\n')
}

/**
 * Export the whole library: one folder per skill plus a manifest and README.
 * @param {{state: object, hubDir: string, skillsRoot: string, targetDir: string}} options
 * @returns {Promise<{ok: true, dir: string, skills: number, bytes: number} | {ok: false, error: string}>}
 */
export async function exportLibrary({ state, hubDir, skillsRoot, targetDir } = {}) {
  const target = safeStr(targetDir).trim()
  if (target.length === 0) return { ok: false, error: '未指定导出目录' }
  if (safeStr(skillsRoot).length > 0 && isUnderPath(skillsRoot, target)) {
    return { ok: false, error: '导出目录不能位于技能目录内' }
  }
  const outSkills = join(target, 'skills')
  try {
    await mkdir(outSkills, { recursive: true })
  } catch (error) {
    return { ok: false, error: `无法创建导出目录：${messageOf(error)}` }
  }

  const skills = []
  let bytes = 0
  const skillsMap = state !== null && typeof state === 'object' && state.skills !== null && typeof state.skills === 'object'
    ? state.skills
    : {}
  for (const [key, skill] of Object.entries(skillsMap)) {
    if (skill === null || typeof skill !== 'object') continue
    const source = safeStr(skill.path)
    if (source.length === 0 || !(await isDirectory(source))) continue
    const name = safeStr(skill.name).length > 0 ? skill.name : (basename(source) || key)
    try {
      const destination = join(outSkills, name)
      await cp(source, destination, { recursive: true, force: true })
      const usage = await usageOf(destination)
      bytes += usage.bytes
      skills.push({
        name,
        version: skill.version ?? null,
        repo: safeStr(skill.install?.repo) || safeStr(skill.update?.repo) || null,
        source: safeStr(skill.source) || null,
        description: safeStr(skill.description),
        updatedAt: Number.isFinite(Number(skill.updatedAt)) ? Number(skill.updatedAt) : null,
      })
    } catch {
      // One unreadable skill must not abort the whole export.
    }
  }

  const exportedAt = new Date().toISOString()
  const manifest = {
    app: 'manju-skill-hub',
    schema: 1,
    exportedAt,
    hubDir: safeStr(hubDir) || null,
    count: skills.length,
    skills,
  }
  try {
    await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await writeFile(join(target, 'README.txt'), readmeText(skills.length, exportedAt), 'utf8')
  } catch (error) {
    return { ok: false, error: `写入清单失败：${messageOf(error)}` }
  }
  return { ok: true, dir: target, skills: skills.length, bytes }
}

/**
 * Import skills from an exported library (or any folder shaped like one).
 * Only directories holding a SKILL.md are considered; existing names are
 * skipped unless skipExisting is false (then they are backed up first).
 * @param {{sourceDir: string, skillsRoot: string, hubDir: string, rescan?: Function, skipExisting?: boolean}} options
 * @returns {Promise<{ok: true, imported: number, skipped: number, importedNames: string[], skippedNames: string[], errors: string[]}>}
 */
export async function importLibrary({ sourceDir, skillsRoot, hubDir, rescan, skipExisting = true } = {}) {
  const imported = []
  const skipped = []
  const errors = []
  const root = join(safeStr(sourceDir), 'skills')
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return { ok: true, imported: 0, skipped: 0, importedNames: [], skippedNames: [], errors }
  }
  const destinationRoot = safeStr(skillsRoot)
  if (destinationRoot.length === 0) {
    return { ok: false, imported: 0, skipped: 0, importedNames: [], skippedNames: [], errors: ['缺少技能目录'] }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('.') || name.includes('/') || name.includes('\\') || name === '..') continue
    const source = join(root, name)
    if (!(await isFile(join(source, 'SKILL.md')))) continue
    const destination = join(destinationRoot, name)
    if (!isUnderPath(destinationRoot, destination)) continue
    if (await exists(destination)) {
      if (skipExisting) {
        skipped.push(name)
        continue
      }
      try {
        const backupRoot = join(safeStr(hubDir), 'backups')
        await mkdir(backupRoot, { recursive: true })
        await cp(destination, join(backupRoot, `${name}-import-${stampNow()}`), { recursive: true, force: true })
        await rm(destination, { recursive: true, force: true })
      } catch (error) {
        errors.push(`${name}: ${messageOf(error)}`)
        continue
      }
    }
    try {
      await cp(source, destination, { recursive: true, force: true })
      imported.push(name)
    } catch (error) {
      errors.push(`${name}: ${messageOf(error)}`)
    }
  }

  if (typeof rescan === 'function' && imported.length > 0) {
    try {
      await rescan()
    } catch (error) {
      errors.push(`重新扫描失败：${messageOf(error)}`)
    }
  }
  return {
    ok: errors.length === 0,
    imported: imported.length,
    skipped: skipped.length,
    importedNames: imported,
    skippedNames: skipped,
    errors,
  }
}
