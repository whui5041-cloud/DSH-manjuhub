/**
 * "思考模式" — ask the configured default model to propose a skill update.
 *
 * The proposal is never written directly: the UI opens the same editor used by
 * 自定义更新, prefilled with the model's digest + content, and the user reviews
 * and applies it (which backs up first).
 */
import { readSkill } from './skill-write.js'

export const DEFAULT_THINK_MAX_INPUT = 90_000
export const THINK_TIMEOUT_MS = 180_000

const SYSTEM = [
  '你是 AI 漫剧 / 短剧生产技能库的维护者，熟悉从选题、剧本、分集、资产、分镜、Seedance 投喂到质检发布的完整链路。',
  '你的任务：阅读一个技能的 SKILL.md，判断它缺什么、哪里过时或含糊，然后给出可以直接落地的更新内容。',
  '硬性要求：',
  '- 只写可执行的规则、清单、模板、判定标准；不写“要重视”“要灵活”这类空话。',
  '- 不编造平台规则、价格、模型参数；不确定的内容写成“待确认/由用户提供”。',
  '- 中文输出。保留技能原有的编号与术语体系，新增内容沿用它的表达风格。',
].join('\n')

function splitDigest(text) {
  const digestMatch = /^\s*DIGEST:\s*(.+)$/m.exec(text)
  const markerIndex = text.indexOf('---CONTENT---')
  const digest = digestMatch === null ? '' : digestMatch[1].trim()
  let content = markerIndex >= 0 ? text.slice(markerIndex + '---CONTENT---'.length) : text
  content = content.replace(/^\s*\n/, '').replace(/\s+$/, '')
  const fence = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(content)
  if (fence !== null) content = fence[1]
  return { digest, content }
}

function buildUserPrompt({ name, description, content, mode, hint, truncated, totalChars }) {
  const rules = mode === 'replace'
    ? [
      '输出整篇新的 SKILL.md：必须先输出 frontmatter（--- 开头，含 name/description，name 不变），然后是正文。',
      '可以重组章节、补规则、删重复，但不要丢失原有能力点。',
    ]
    : [
      '只输出需要“追加”的补充内容（Markdown 片段），不要重复原文，不要输出 frontmatter，不要加代码围栏。',
      '补充内容会作为一个独立小节挂在技能末尾，所以请写成自成体系、可长期保留的规则。',
    ]
  return [
    `技能名：${name}`,
    `现有介绍：${description || '（无）'}`,
    `更新模式：${mode === 'replace' ? '整篇重写' : '追加补充'}`,
    hint && hint.trim().length > 0 ? `用户这次特别要求：${hint.trim()}` : '用户这次没有额外要求，请按你的判断找最该补的部分。',
    ...rules,
    '输出格式（严格遵守）：',
    'DIGEST: 一句话说明你改了什么、为什么',
    '---CONTENT---',
    '<按模式输出的内容>',
    '',
    `以下是现有 SKILL.md${truncated ? `（已截断，全文 ${totalChars} 字符）` : ''}：`,
    '=====',
    content,
    '=====',
  ].join('\n')
}

/**
 * Ask the model for a proposal.
 * @param {{ llm: any, selection: {provider: string, model: string, reasoningEffort?: string}, state: any, name: string, mode?: 'append'|'replace', hint?: string, skillsRoot: string, maxInputChars?: number, log?: (message: string) => void }} input
 */
export async function proposeSkillUpdate(input) {
  const { llm, selection, state, name, mode = 'append', hint = '', skillsRoot } = input
  const maxInput = Number(input.maxInputChars) > 0 ? Number(input.maxInputChars) : DEFAULT_THINK_MAX_INPUT
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    return { ok: false, error: '当前 profile 没有可用的模型服务，无法使用思考模式；请改用自定义更新。' }
  }
  if (selection === undefined || selection === null || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
    return { ok: false, error: '没有配置默认模型，无法使用思考模式。' }
  }
  const skill = await readSkill({ state, name, skillsRoot, maxChars: maxInput })
  if (skill.ok !== true) return { ok: false, error: skill.error }

  const prompt = buildUserPrompt({
    name,
    description: skill.description,
    content: skill.content,
    mode,
    hint,
    truncated: skill.truncated,
    totalChars: skill.totalChars,
  })

  let text = ''
  let failure = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), THINK_TIMEOUT_MS)
    try {
      const stream = llm.stream({
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        temperature: 0.25,
        maxTokens: mode === 'replace' ? 8000 : 3000,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') {
          if (chunk.reason?.kind === 'error') failure = chunk.reason.failure?.message ?? '模型调用失败'
          if (chunk.reason?.kind === 'aborted') failure = '模型调用已取消或超时'
        } else if (chunk.type === 'block-end' && chunk.block?.type === 'text') {
          if (!text.includes(chunk.block.text)) text += chunk.block.text
        }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    return { ok: false, error: `模型调用失败：${String(error?.message ?? error)}` }
  }
  if (failure !== null) return { ok: false, error: failure }
  if (text.trim().length === 0) return { ok: false, error: '模型没有返回内容，请重试或改用自定义更新。' }

  const { digest, content } = splitDigest(text)
  if (content.trim().length === 0) return { ok: false, error: '模型返回的内容无法解析为可应用文本。' }
  if (content.length > 20_000 && mode === 'append') {
    return { ok: false, error: '模型建议过长，已放弃；请重试或缩小范围。' }
  }
  input.log?.(`think ${name} (${mode}) via ${selection.provider}/${selection.model}`)
  return {
    ok: true,
    name,
    mode,
    digest: digest || '模型未给出摘要，请自行复核内容。',
    content,
    model: `${selection.provider}/${selection.model}`,
    truncated: skill.truncated,
  }
}
