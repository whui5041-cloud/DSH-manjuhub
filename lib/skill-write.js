/**
 * User-authored skill edits ("自定义更新").
 *
 * Two modes:
 *  - append: keep the skill as written and maintain one clearly delimited
 *    "自定义补充" block. Re-applying replaces that block instead of stacking.
 *  - replace: replace SKILL.md with the supplied full text; frontmatter and a
 *    name field are required so the skill stays loadable.
 *
 * Every write is preceded by a full directory backup.
 */
import { cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const CUSTOM_BEGIN = '<!-- manju-skill-hub:custom:begin -->'
export const CUSTOM_END = '<!-- manju-skill-hub:custom:end -->'
export const CUSTOM_HEADING = '## 自定义补充（漫剧技能中枢维护）'
export const MAX_CUSTOM_TEXT = 20_000

function isUnderPath(parent, child) {
  const normalize = value => String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(`${root}/`)
}

function stampNow() {
  // Millisecond precision: two quick edits of the same skill must not share a
  // backup directory and overwrite each other.
  return new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.(\d{3})Z$/, '-$1')
}

/** Split YAML frontmatter from the body. `head` includes the closing fence. */
export function splitFrontmatter(text) {
  const match = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/.exec(text)
  if (match === null) return { head: '', body: text, hasFrontmatter: false }
  return { head: match[1], body: text.slice(match[1].length), hasFrontmatter: true }
}

/** The managed block's current text, if the skill already has one. */
export function existingCustomBlock(text) {
  const start = text.indexOf(CUSTOM_BEGIN)
  const end = text.indexOf(CUSTOM_END)
  if (start < 0 || end < start) return null
  return text.slice(start + CUSTOM_BEGIN.length, end).trim()
}

/** Build the new SKILL.md content for an append edit. */
export function mergeCustomBlock(original, text, position = 'end') {
  const block = `${CUSTOM_BEGIN}\n${CUSTOM_HEADING}\n\n${text.trim()}\n${CUSTOM_END}`
  const start = original.indexOf(CUSTOM_BEGIN)
  const end = original.indexOf(CUSTOM_END)
  if (start >= 0 && end > start) {
    return `${original.slice(0, start)}${block}${original.slice(end + CUSTOM_END.length)}`
  }
  if (position === 'top') {
    const { head, body } = splitFrontmatter(original)
    const rest = body.replace(/^\s+/, '')
    return `${head}${head.length > 0 ? '\n' : ''}${block}\n\n${rest}`
  }
  return `${original.replace(/\s+$/, '')}\n\n${block}\n`
}

/** Validate a full replacement: loadable frontmatter with a name field. */
export function validateReplacement(text) {
  const { head, hasFrontmatter } = splitFrontmatter(text.trimStart())
  if (!hasFrontmatter) return '整篇替换必须保留 YAML frontmatter（以 --- 开头并以 --- 结束）'
  if (!/^name:\s*\S+/m.test(head)) return 'frontmatter 缺少 name 字段'
  return null
}

/** Read a skill's SKILL.md through the same path guard. */
export async function readSkill({ state, name, skillsRoot, maxChars = 120_000 }) {
  const skill = state.skills?.[name]
  if (skill === undefined) return { ok: false, error: `未找到技能 ${name}` }
  const file = skill.skillFile ?? (skill.path ? join(skill.path, 'SKILL.md') : null)
  if (typeof file !== 'string' || file.length === 0 || !isUnderPath(skillsRoot, file)) {
    return { ok: false, error: '该技能没有可编辑的本地 SKILL.md' }
  }
  try {
    const content = await readFile(file, 'utf8')
    const truncated = content.length > maxChars
    return {
      ok: true,
      name,
      path: skill.path,
      file,
      content: truncated ? content.slice(0, maxChars) : content,
      totalChars: content.length,
      truncated,
      version: skill.version ?? null,
      description: skill.description ?? '',
    }
  } catch (error) {
    return { ok: false, error: `读取失败：${String(error?.message ?? error)}` }
  }
}

/** Apply a user-authored edit (backup first). */
export async function applyCustom({ state, name, text, mode = 'append', position = 'end', by = 'user', skillsRoot, hubDir, rescan, log }) {
  const body = typeof text === 'string' ? text.trim() : ''
  if (body.length === 0) return { ok: false, error: '内容为空' }
  if (body.length > MAX_CUSTOM_TEXT) return { ok: false, error: `内容过长（上限 ${MAX_CUSTOM_TEXT} 字）` }

  const skill = state.skills?.[name]
  if (skill === undefined) return { ok: false, error: `未找到技能 ${name}` }
  const target = skill.path
  if (typeof target !== 'string' || target.length === 0 || !isUnderPath(skillsRoot, target)) {
    return { ok: false, error: '该技能不在技能目录内，无法编辑' }
  }
  const file = skill.skillFile ?? join(target, 'SKILL.md')
  if (!isUnderPath(target, file)) return { ok: false, error: 'SKILL.md 路径异常' }

  let original
  try {
    original = await readFile(file, 'utf8')
  } catch (error) {
    return { ok: false, error: `读取 SKILL.md 失败：${String(error?.message ?? error)}` }
  }

  let next
  if (mode === 'replace') {
    const invalid = validateReplacement(body)
    if (invalid !== null) return { ok: false, error: invalid }
    next = `${body.replace(/\s+$/, '')}\n`
  } else {
    // Never let pasted text forge the managed-block boundary.
    const safeBody = body.split(CUSTOM_BEGIN).join('').split(CUSTOM_END).join('')
    next = mergeCustomBlock(original, safeBody, position)
  }

  const backupDir = join(hubDir, 'backups', `${name}-custom-${stampNow()}`)
  try {
    await cp(target, backupDir, { recursive: true, force: true })
    await writeFile(file, next, 'utf8')
  } catch (error) {
    return { ok: false, error: `写入失败：${String(error?.message ?? error)}` }
  }

  state.edits = state.edits ?? {}
  state.edits[name] = {
    by: by === 'agent' ? 'agent' : 'user',
    at: Date.now(),
    mode,
    position,
    backupDir,
  }
  if (typeof rescan === 'function') await rescan()
  log?.(`custom edit ${name} (${mode}) · backup ${backupDir}`)
  return { ok: true, name, mode, position, backupDir, bytes: Buffer.byteLength(next, 'utf8') }
}
