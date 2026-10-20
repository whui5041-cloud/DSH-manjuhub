/**
 * 思考模式 2.0（think2）：先诊断、再生成的两段式技能更新建议。
 *
 * 与 think.js 的区别：
 *  - 第一段（phase='diagnose'）只让模型输出「问题清单」，每行
 *    `- [severity] 问题 | 为什么 | 建议`，方便用户勾选；
 *  - 第二段（phase='generate'）把勾选的问题 + 按生产阶段选出的 rubric
 *    一起拼进提示，再让模型产出 DIGEST + ---CONTENT--- + 内容。
 *
 * 结果永远不落盘：调用方拿到 digest/content 后自己打开编辑器，用户确认再写。
 */
import { readSkill } from './skill-write.js'
import { stageOf } from './quality-check.js'

export const THINK2_MAX_INPUT = 90_000
export const THINK2_TIMEOUT_MS = 240_000
export const MAX_DIAGNOSIS = 20
const MAX_DIAGNOSIS_PROMPT = 2000
const MAX_CONTENT_APPEND = 20_000
const MAX_CONTENT_REPLACE = 40_000

/** 各生产阶段的验收 rubric：诊断与生成共用。 */
export const RUBRICS = {
  script: {
    stage: 'script',
    title: '剧本阶段',
    criteria: [
      '钩子：前 3 秒/前 3 句必须有冲突或悬念，每集结尾留钩子。',
      '分集：单集 1.5~2 分钟，台词按 4.5 字/秒估算，单集台词量有明确上限。',
      '结构：起承转合齐备，反转点有前置铺垫，不靠旁白解释剧情。',
      '人物：主角动机明确，配角有功能，台词符合身份与关系。',
      '合规：不写平台名、价格、真实机构；血腥/擦边/未成年人相关桥段一律不写。',
      '可执行：给的是能照做的规则与模板，不是「要重视」这类空话。',
    ],
  },
  storyboard: {
    stage: 'storyboard',
    title: '分镜阶段',
    criteria: [
      '分段：单段不超过 15 秒，段缝出口帧 = 下段入口帧。',
      '镜头：一段 2~6 个镜头，不跨空间、不跨人物组，无定格无黑场。',
      '视听：每个镜头写清景别、机位、运镜与动作，能被视频模型理解。',
      '连续性：角色服装、道具、轴线跨镜一致。',
      '可投喂：中文可执行，不写平台黑话与编造的模型参数。',
    ],
  },
  asset: {
    stage: 'asset',
    title: '资产阶段',
    criteria: [
      '清单：角色/道具/场景三清单齐全，主角有固定外观锚点。',
      '一致性：三视图/定妆写清脸型、发型、服装、材质，跨镜可复用。',
      '场景：空间锚点（出入口、光源方向、主要陈设）明确。',
      '提示词：出图提示词可直接粘贴，含画幅、背景、光线，不堆风格词。',
      '编号：资产编号与分镜里的引用一一对应。',
    ],
  },
  feed: {
    stage: 'feed',
    title: '投喂阶段',
    criteria: [
      '版本：锁定视频模型版本（如 Seedance 2.0/2.5），不混用。',
      '映射：@图N 与素材编号严格一一对应，缺图写占位、不编造。',
      '台词：每句带角色名与音色标签，单段台词字数不超上限。',
      '分段：每条提示词不超过 15 秒，动作连续、衔接可执行。',
      '可机检：输出结构固定，能跑脚本核对编号/字数/镜头数。',
    ],
  },
  qc: {
    stage: 'qc',
    title: '质检阶段',
    criteria: [
      '台账：跨镜/跨集一致性有检查表，逐条可勾选。',
      '门禁：15 秒分段、台词时长、字数、编号一致性都有硬门。',
      '声音：BGM/音效/配音分层，版权与音色一致性有检查。',
      '合规：平台审核红线（血腥/擦边/未成年人/夸大宣传）逐项过。',
      '可复现：结论带证据，不写「看起来没问题」。',
    ],
  },
  publish: {
    stage: 'publish',
    title: '发布阶段',
    criteria: [
      '物料：封面、标题、简介、话题标签齐备且不违禁。',
      '节奏：发布时间、更新频率、前 3 集留存设计明确。',
      '拉新：投放/评论区/私域路径清楚，不承诺收益。',
      '复盘：有可量化指标（完播、追更、转化）与迭代动作。',
      '合规：不写平台名与真实价格，不搬运他人素材。',
    ],
  },
  other: {
    stage: 'other',
    title: '通用阶段',
    criteria: [
      '可执行：规则、清单、模板能直接照做。',
      '不空话：禁止「要重视」「灵活把握」这类表述。',
      '不编造：平台规则、价格、模型参数不确定就写「待确认」。',
      '结构：保留技能原有的编号与术语体系。',
      '触发：说明什么时候用、什么时候不用。',
    ],
  },
}

/** 按阶段取 rubric，未知阶段退回 other。 */
export function rubricFor(stage) {
  const key = typeof stage === 'string' ? stage : ''
  const found = RUBRICS[key] ?? RUBRICS.other
  return { ...found, criteria: [...found.criteria] }
}

const DIAGNOSE_SYSTEM = [
  '你是 AI 漫剧 / 短剧生产技能库的体检医生，熟悉从选题、剧本、分集、资产、分镜、Seedance 投喂到质检发布的完整链路。',
  '你的任务：只挑出这个技能真正的问题（缺规则、过时、含糊、不可执行、和阶段不匹配），不要复述优点。',
  '硬性要求：',
  '- 每条问题必须能落到「改哪一句、补哪一条」。',
  '- 不编造平台规则、价格、模型参数；不确定就写「待确认」。',
  '- 中文输出，保留技能原有的编号与术语体系。',
].join('\n')

const GENERATE_SYSTEM = [
  '你是 AI 漫剧 / 短剧生产技能库的维护者，熟悉从选题、剧本、分集、资产、分镜、Seedance 投喂到质检发布的完整链路。',
  '你的任务：按给定阶段的验收标准与用户勾选的问题，给出可以直接落地的更新内容。',
  '硬性要求：',
  '- 只写可执行的规则、清单、模板、判定标准；不写「要重视」「要灵活」这类空话。',
  '- 不编造平台规则、价格、模型参数；不确定的内容写成「待确认/由用户提供」。',
  '- 中文输出。保留技能原有的编号与术语体系，新增内容沿用它的表达风格。',
].join('\n')

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeSeverity(value, fallback = 'medium') {
  const text = safeStr(value).trim().toLowerCase()
  if (/^(high|h|critical|blocker|严重|高|重要)$/.test(text)) return 'high'
  if (/^(low|l|minor|nit|suggestion|低|轻微|建议)$/.test(text)) return 'low'
  if (/^(medium|m|moderate|normal|中|一般)$/.test(text)) return 'medium'
  return fallback
}

/** 解析一行 `- [severity] 问题 | 为什么 | 建议`；不合格返回 null。 */
export function parseDiagnosisLine(raw) {
  let line = safeStr(raw).trim()
  if (line.length === 0) return null
  line = line.replace(/^(?:[-*•>]+|\d+[.)、])\s*/, '').trim()
  if (!line.includes('|') && !line.includes('｜')) return null
  const parts = line.split(/\s*[|｜]\s*/)
  if (parts.length < 2) return null
  let head = parts[0].trim()
  let severity = 'medium'
  const match = /^\[?\s*([A-Za-z\u4e00-\u9fff]{1,6})\s*\]?\s*[:：\-–]?\s*/.exec(head)
  if (match !== null) {
    const parsed = normalizeSeverity(match[1], '')
    if (parsed.length > 0) {
      severity = parsed
      head = head.slice(match[0].length).trim()
    }
  }
  const issue = head.replace(/^["'`「『]|["'`」』]$/g, '').trim()
  if (issue.length === 0) return null
  const why = parts[1].trim()
  const fix = parts.slice(2).join(' | ').trim()
  return { severity, issue, why, fix }
}

/** 把模型整段输出解析成问题清单（最多 20 条）。 */
export function parseDiagnosis(text) {
  const out = []
  for (const line of safeStr(text).split(/\r?\n/)) {
    const parsed = parseDiagnosisLine(line)
    if (parsed !== null) out.push(parsed)
    if (out.length >= MAX_DIAGNOSIS) break
  }
  return out
}

/** 勾选的问题可以是对象，也可以是字符串行；统一成 {severity,issue,why,fix}。 */
function normalizeDiagnosis(list) {
  const source = Array.isArray(list) ? list : []
  const out = []
  for (const raw of source) {
    if (raw === null || raw === undefined) continue
    if (typeof raw === 'string') {
      const parsed = parseDiagnosisLine(raw)
      if (parsed !== null) out.push(parsed)
      continue
    }
    if (typeof raw !== 'object') continue
    const issue = safeStr(raw.issue ?? raw.problem ?? raw.title).trim()
    if (issue.length === 0) continue
    out.push({
      severity: normalizeSeverity(raw.severity),
      issue,
      why: safeStr(raw.why ?? raw.reason).trim(),
      fix: safeStr(raw.fix ?? raw.suggestion ?? raw.requiredFix).trim(),
    })
    if (out.length >= MAX_DIAGNOSIS) break
  }
  return out
}

function splitDigest(text) {
  const source = safeStr(text)
  const digestMatch = /^\s*DIGEST:\s*(.+)$/m.exec(source)
  const markerIndex = source.indexOf('---CONTENT---')
  const digest = digestMatch === null ? '' : digestMatch[1].trim()
  let content = markerIndex >= 0 ? source.slice(markerIndex + '---CONTENT---'.length) : source
  content = content.replace(/^\s*\n/, '').replace(/\s+$/, '')
  const fence = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(content)
  if (fence !== null) content = fence[1]
  return { digest, content }
}

function sourceBlock(content, truncated, totalChars) {
  return [
    `以下是现有 SKILL.md${truncated ? `（已截断，全文 ${totalChars} 字符）` : ''}：`,
    '=====',
    content,
    '=====',
  ]
}

function buildDiagnosePrompt({ name, description, rubric, hint, content, truncated, totalChars }) {
  return [
    `技能名：${name}`,
    `现有介绍：${description || '（无）'}`,
    `生产阶段：${rubric.title}（${rubric.stage}）`,
    hint.trim().length > 0 ? `用户特别关注：${hint.trim()}` : '用户没有额外指定，请按阶段验收标准全面体检。',
    '逐条对照下面的验收标准，只输出真正的问题：',
    ...rubric.criteria.map((item, index) => `${index + 1}. ${item}`),
    '输出格式（严格遵守，一行一条，不要写别的内容）：',
    '- [high] 问题 | 为什么是问题 | 具体怎么改',
    '- [medium] ...',
    '要求：severity 只能是 high / medium / low；最多 8 条；每条不超过 120 字；不写空话；不编造平台规则。',
    '',
    ...sourceBlock(content, truncated, totalChars),
  ].join('\n')
}

function buildGeneratePrompt({ name, description, rubric, mode, hint, diagnosis, content, truncated, totalChars }) {
  const rules = mode === 'replace'
    ? [
      '输出整篇新的 SKILL.md：必须先输出 frontmatter（--- 开头，含 name/description，name 不变），然后是正文。',
      '可以重组章节、补规则、删重复，但不要丢失原有能力点。',
    ]
    : [
      '只输出需要“追加”的补充内容（Markdown 片段），不要重复原文，不要输出 frontmatter，不要加代码围栏。',
      '补充内容会作为一个独立小节挂在技能末尾，所以请写成自成体系、可长期保留的规则。',
    ]
  const selected = diagnosis.length > 0
    ? diagnosis.map(item => `- [${item.severity}] ${item.issue}${item.why ? ` | ${item.why}` : ''}${item.fix ? ` | ${item.fix}` : ''}`)
    : ['（没有勾选具体问题，请按验收标准自查后补最缺的部分）']
  return [
    `技能名：${name}`,
    `现有介绍：${description || '（无）'}`,
    `生产阶段：${rubric.title}（${rubric.stage}）`,
    `更新模式：${mode === 'replace' ? '整篇重写' : '追加补充'}`,
    hint.trim().length > 0 ? `用户这次特别要求：${hint.trim()}` : '用户这次没有额外要求，按选中问题与验收标准补齐。',
    '本阶段的验收标准：',
    ...rubric.criteria.map((item, index) => `${index + 1}. ${item}`),
    '这次要修的问题（按严重程度从高到低）：',
    ...selected,
    ...rules,
    '输出格式（严格遵守）：',
    'DIGEST: 一句话说明你改了什么、修了哪些问题',
    '---CONTENT---',
    '<按模式输出的内容>',
    '',
    ...sourceBlock(content, truncated, totalChars),
  ].join('\n')
}

async function collectText(llm, request, timeoutMs) {
  let text = ''
  let failure = null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const stream = llm.stream({ ...request, signal: controller.signal })
    for await (const chunk of stream) {
      if (chunk === null || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta') {
        if (typeof chunk.text === 'string') text += chunk.text
      } else if (chunk.type === 'finish') {
        if (chunk.reason?.kind === 'error') failure = chunk.reason.failure?.message ?? '模型调用失败'
        if (chunk.reason?.kind === 'aborted') failure = '模型调用已取消或超时'
      } else if (chunk.type === 'block-end' && chunk.block?.type === 'text') {
        if (typeof chunk.block.text === 'string' && !text.includes(chunk.block.text)) text += chunk.block.text
      }
    }
  } catch (error) {
    return { ok: false, error: `模型调用失败：${String(error?.message ?? error)}` }
  } finally {
    clearTimeout(timer)
  }
  if (failure !== null) return { ok: false, error: failure }
  if (text.trim().length === 0) return { ok: false, error: '模型没有返回内容，请重试。' }
  return { ok: true, text }
}

/**
 * 两段式提案。
 * @param {{
 *   llm: any,
 *   selection: { provider: string, model: string, reasoningEffort?: string },
 *   state: any,
 *   name: string,
 *   mode?: 'append' | 'replace',
 *   hint?: string,
 *   phase?: 'diagnose' | 'generate',
 *   diagnosis?: Array<{ severity?: string, issue?: string, why?: string, fix?: string } | string>,
 *   skillsRoot: string,
 *   maxInputChars?: number,
 *   log?: (message: string) => void,
 * }} input
 */
export async function propose(input = {}) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const {
    llm,
    selection,
    state,
    name,
    mode = 'append',
    hint = '',
    phase = 'generate',
    diagnosis = [],
    skillsRoot,
  } = source
  const maxInput = Number(source.maxInputChars) > 0 ? Number(source.maxInputChars) : THINK2_MAX_INPUT
  const phaseName = phase === 'diagnose' ? 'diagnose' : 'generate'
  const updateMode = mode === 'replace' ? 'replace' : 'append'

  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    return { ok: false, error: '当前 profile 没有可用的模型服务，无法使用两段式思考模式；请改用自定义更新。' }
  }
  if (selection === undefined || selection === null || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
    return { ok: false, error: '没有配置默认模型，无法使用两段式思考模式。' }
  }
  const skillName = safeStr(name).trim()
  if (skillName.length === 0) return { ok: false, error: '缺少技能名' }

  const skill = await readSkill({ state, name: skillName, skillsRoot, maxChars: maxInput })
  if (skill.ok !== true) return { ok: false, error: skill.error }

  const model = `${selection.provider}/${selection.model}`
  const profile = state?.skills?.[skillName]
  const stage = stageOf(profile !== null && typeof profile === 'object'
    ? profile
    : { name: skillName, description: skill.description })
  const rubric = rubricFor(stage.stage)
  const base = {
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    temperature: 0.25,
  }

  if (phaseName === 'diagnose') {
    const prompt = buildDiagnosePrompt({
      name: skillName,
      description: skill.description,
      rubric,
      hint: safeStr(hint),
      content: skill.content,
      truncated: skill.truncated,
      totalChars: skill.totalChars,
    })
    const result = await collectText(llm, {
      ...base,
      system: DIAGNOSE_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      // Reasoning models can spend a 1500-token budget on reasoning alone and
      // return no visible text; leave room for the checklist itself.
      maxTokens: 4000,
    }, THINK2_TIMEOUT_MS)
    if (result.ok !== true) return result
    const parsed = parseDiagnosis(result.text)
    if (parsed.length === 0) {
      return { ok: false, error: '模型没有按格式返回问题清单（应为每行 `- [severity] 问题 | 为什么 | 建议`），请重试。' }
    }
    source.log?.(`think2 diagnose ${skillName} via ${model} · ${parsed.length} issues`)
    return { ok: true, phase: 'diagnose', diagnosis: parsed, rubric, model }
  }

  const selected = normalizeDiagnosis(diagnosis)
  const prompt = buildGeneratePrompt({
    name: skillName,
    description: skill.description,
    rubric,
    mode: updateMode,
    hint: safeStr(hint),
    diagnosis: selected,
    content: skill.content,
    truncated: skill.truncated,
    totalChars: skill.totalChars,
  })
  const result = await collectText(llm, {
    ...base,
    system: GENERATE_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    maxTokens: updateMode === 'replace' ? 8000 : 3000,
  }, THINK2_TIMEOUT_MS)
  if (result.ok !== true) return result

  const { digest, content } = splitDigest(result.text)
  if (content.trim().length === 0) return { ok: false, error: '模型返回的内容无法解析为可应用文本。' }
  const limit = updateMode === 'replace' ? MAX_CONTENT_REPLACE : MAX_CONTENT_APPEND
  if (content.length > limit) return { ok: false, error: '模型建议过长，已放弃；请重试或缩小范围。' }

  source.log?.(`think2 generate ${skillName} (${updateMode}) via ${model} · fixes ${selected.length}`)
  return {
    ok: true,
    phase: 'generate',
    name: skillName,
    mode: updateMode,
    digest: digest || '模型未给出摘要，请自行复核内容。',
    content,
    model,
    fixes: selected.length,
  }
}
