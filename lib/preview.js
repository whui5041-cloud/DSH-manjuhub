/**
 * 编辑增强（preview）：在真正写盘之前，算出「应用之后」的 SKILL.md 与逐行差异。
 *
 * 复用 skill-write.js 的合并/校验规则与 history.js 的 lineDiff，所以预览结果
 * 和随后 applyCustom 写入的内容完全一致，只是这里不落盘、不做备份。
 */
import { CUSTOM_BEGIN, CUSTOM_END, MAX_CUSTOM_TEXT, mergeCustomBlock, validateReplacement } from './skill-write.js'
import { lineDiff } from './history.js'

/**
 * 预览一次自定义更新。
 * @param {{ original?: string, text?: string, mode?: 'append' | 'replace', position?: 'end' | 'top' }} input
 * @returns {{ ok: true, validation: null, beforeChars: number, afterChars: number, diff: { text: string, added: number, removed: number, truncated: boolean } }
 *   | { ok: false, error: string, validation: string | null, beforeChars: number, afterChars: number, diff: null }}
 */
export function previewEdit(input = {}) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const before = typeof source.original === 'string' ? source.original : ''
  const body = typeof source.text === 'string' ? source.text.trim() : ''
  const mode = source.mode === 'replace' ? 'replace' : 'append'
  const position = source.position === 'top' ? 'top' : 'end'
  const fail = (error, validation = null) => ({
    ok: false,
    error,
    validation,
    beforeChars: before.length,
    afterChars: before.length,
    diff: null,
  })

  if (body.length === 0) return fail('内容为空')
  if (body.length > MAX_CUSTOM_TEXT) return fail(`内容过长（上限 ${MAX_CUSTOM_TEXT} 字）`)

  let after
  if (mode === 'replace') {
    const validation = validateReplacement(body)
    if (validation !== null) return fail(validation, validation)
    after = `${body.replace(/\s+$/, '')}\n`
  } else {
    // 和 applyCustom 一致：不允许粘贴文本伪造受管小节边界。
    const safeBody = body.split(CUSTOM_BEGIN).join('').split(CUSTOM_END).join('')
    if (safeBody.trim().length === 0) return fail('内容为空（去掉受管标记后没有可写入的文本）')
    after = mergeCustomBlock(before, safeBody, position)
  }

  const diff = lineDiff(before, after)
  return {
    ok: true,
    validation: null,
    beforeChars: before.length,
    afterChars: after.length,
    diff: { text: diff.text, added: diff.added, removed: diff.removed, truncated: diff.truncated },
  }
}
