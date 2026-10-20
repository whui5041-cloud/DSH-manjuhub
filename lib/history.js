/**
 * Change history + rollback for Manju Skill Hub.
 *
 * Every write records one history entry and a bounded line diff under
 * $DSH_HOME/manju-skill-hub/history/. Backups themselves are full directory
 * copies, so a rollback is a restore, not a re-download.
 */
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_ENTRIES = 200
const MAX_DIFF_LINES = 500
const MAX_SIDE_LINES = 1200

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

function coarseCounts(a, b) {
  const counts = new Map()
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1)
  for (const line of b) counts.set(line, (counts.get(line) ?? 0) - 1)
  let added = 0
  let removed = 0
  for (const value of counts.values()) {
    if (value > 0) removed += value
    else added += -value
  }
  return { added, removed }
}

/** Unified-ish line diff, bounded for large skills. */
export function lineDiff(before, after, options = {}) {
  const maxOutput = Number(options.maxOutput) > 0 ? Number(options.maxOutput) : MAX_DIFF_LINES
  const a = String(before ?? '').split(/\r?\n/)
  const b = String(after ?? '').split(/\r?\n/)
  if (a.length > MAX_SIDE_LINES || b.length > MAX_SIDE_LINES) {
    const counts = coarseCounts(a, b)
    return {
      text: [
        `（文件较大，省略逐行 diff；${a.length} 行 → ${b.length} 行）`,
        `新增约 ${counts.added} 行，删除约 ${counts.removed} 行`,
        `字符：${String(before ?? '').length} → ${String(after ?? '').length}`,
      ].join('\n'),
      added: counts.added,
      removed: counts.removed,
      truncated: true,
    }
  }

  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + (j + 1)] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)])
    }
  }
  const lines = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`)
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      lines.push(`- ${a[i]}`)
      removed += 1
      i += 1
    } else {
      lines.push(`+ ${b[j]}`)
      added += 1
      j += 1
    }
  }
  while (i < n) { lines.push(`- ${a[i]}`); removed += 1; i += 1 }
  while (j < m) { lines.push(`+ ${b[j]}`); added += 1; j += 1 }
  let truncated = false
  let text = lines.join('\n')
  if (lines.length > maxOutput) {
    text = `${lines.slice(0, maxOutput).join('\n')}\n…（diff 过长，已截断，共 ${lines.length} 行变化）`
    truncated = true
  }
  return { text, added, removed, truncated }
}

/** Append one change to state.history and persist its diff file. */
export async function recordChange({ state, hubDir, name, kind, by, backupDir, before, after, summary, repo, skillsRoot }) {
  state.history = state.history ?? []
  const id = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const diff = lineDiff(before ?? '', after ?? '')
  const dir = join(hubDir, 'history')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${id}.diff`), diff.text, 'utf8')
  } catch {
    // The history entry is still useful without the diff file.
  }
  const entry = {
    id,
    at: Date.now(),
    name,
    kind,
    by: by === 'agent' ? 'agent' : 'user',
    backupDir: typeof backupDir === 'string' ? backupDir : null,
    summary: typeof summary === 'string' ? summary : '',
    repo: typeof repo === 'string' ? repo : null,
    added: diff.added,
    removed: diff.removed,
    diffTruncated: diff.truncated,
    beforeChars: String(before ?? '').length,
    afterChars: String(after ?? '').length,
  }
  state.history.unshift(entry)
  if (state.history.length > MAX_ENTRIES) state.history.length = MAX_ENTRIES
  return entry
}

export function listHistory(state, name) {
  const all = Array.isArray(state.history) ? state.history : []
  return name ? all.filter(entry => entry.name === name) : all
}

export async function readDiff(hubDir, id) {
  if (!/^h-[a-z0-9]+-[a-z0-9]+$/.test(String(id))) return { ok: false, error: '非法的历史记录 id' }
  try {
    const text = await readFile(join(hubDir, 'history', `${id}.diff`), 'utf8')
    return { ok: true, id, text }
  } catch {
    return { ok: false, error: '没有找到这次变更的 diff 文件' }
  }
}

/**
 * Restore one history entry's full-directory backup.
 * A safety backup of the current state is taken before replacing anything.
 */
export async function restoreBackup({ state, id, skillsRoot, hubDir, by = 'user', rescan, log }) {
  const entry = listHistory(state).find(item => item.id === id)
  if (entry === undefined) return { ok: false, error: `未找到历史记录 ${id}` }
  if (typeof entry.backupDir !== 'string' || entry.backupDir.length === 0) {
    return { ok: false, error: '这条记录没有可用的备份目录' }
  }
  const skill = state.skills?.[entry.name]
  if (skill === undefined) return { ok: false, error: `技能 ${entry.name} 已不存在` }
  const target = skill.path
  if (typeof target !== 'string' || !isUnderPath(skillsRoot, target)) {
    return { ok: false, error: '该技能不在技能目录内，无法回滚' }
  }
  if (!isUnderPath(join(hubDir, 'backups'), entry.backupDir)) {
    return { ok: false, error: '备份目录不在受管范围内，已拒绝' }
  }

  let before = ''
  try { before = await readFile(join(target, 'SKILL.md'), 'utf8') } catch { /* absent */ }
  let after = ''
  try { after = await readFile(join(entry.backupDir, 'SKILL.md'), 'utf8') } catch {
    return { ok: false, error: '备份目录里没有 SKILL.md，无法回滚' }
  }

  const stamp = stampNow()
  const safety = join(hubDir, 'backups', `${entry.name}-pre-rollback-${stamp}`)
  const tmp = join(hubDir, 'tmp', `${entry.name}-rollback-${stamp}`)
  const old = join(hubDir, 'tmp', `${entry.name}-rollback-${stamp}-old`)
  try {
    await cp(target, safety, { recursive: true, force: true })
    await rm(tmp, { recursive: true, force: true })
    await cp(entry.backupDir, tmp, { recursive: true, force: true })
    await rm(old, { recursive: true, force: true })
    await rename(target, old)
    try {
      await rename(tmp, target)
    } catch (error) {
      await rename(old, target).catch(() => null)
      throw error
    }
    await rm(old, { recursive: true, force: true }).catch(() => null)
    await rm(tmp, { recursive: true, force: true }).catch(() => null)
  } catch (error) {
    return { ok: false, error: `回滚失败，当前版本已保留：${String(error?.message ?? error)}` }
  }

  const recorded = await recordChange({
    state,
    hubDir,
    name: entry.name,
    kind: 'rollback',
    by,
    backupDir: safety,
    before,
    after,
    summary: `回滚到 ${new Date(entry.at).toLocaleString('zh-CN')} 的版本`,
  })
  if (typeof rescan === 'function') await rescan()
  log?.(`rollback ${entry.name} → ${entry.id} · safety ${safety}`)
  return { ok: true, name: entry.name, restoredFrom: entry.id, safetyBackup: safety, historyId: recorded.id }
}
