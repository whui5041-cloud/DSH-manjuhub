/**
 * 编辑增强（snippets）：可复用的「规则片段」，编辑技能时一键插入。
 *
 * state.snippets = [{ id, title, text, tags, createdAt, updatedAt }]
 * 内置 3 条漫剧生产硬规则；只在 snippets 为空时写入，之后完全由用户维护。
 */
export const MAX_SNIPPET_TEXT = 20_000
const MAX_TITLE = 120
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 24

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function snippetId() {
  return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function normalizeTags(tags) {
  const source = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(/[,，;；\s]+/)
      : []
  const out = []
  for (const item of source) {
    if (typeof item !== 'string') continue
    const tag = item.trim().replace(/^#/, '')
    if (tag.length === 0 || tag.length > MAX_TAG_LENGTH || out.includes(tag)) continue
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function record(snippet) {
  return {
    id: safeStr(snippet?.id),
    title: safeStr(snippet?.title),
    text: safeStr(snippet?.text),
    tags: Array.isArray(snippet?.tags) ? [...snippet.tags] : [],
    createdAt: Number.isFinite(Number(snippet?.createdAt)) ? Number(snippet.createdAt) : 0,
    updatedAt: Number.isFinite(Number(snippet?.updatedAt)) ? Number(snippet.updatedAt) : 0,
  }
}

function ensureSnippets(state) {
  if (state === null || typeof state !== 'object') return []
  if (!Array.isArray(state.snippets)) state.snippets = []
  return state.snippets
}

/** 内置片段：15 秒分段硬规则、台词音色标注、上线审核红线。 */
export const DEFAULT_SNIPPETS = [
  {
    title: '15 秒分段硬规则',
    tags: ['分段', 'seedance', '硬规则'],
    text: [
      '- 每段不超过 15 秒；超过必须切段，段缝要能接上（出口帧 = 下段入口帧）。',
      '- 一段内镜头数 2~6 个，不跨空间、不跨主要人物组。',
      '- 台词按 4 字/秒估算，单段台词合计不超过 60 字。',
      '- 段内动作连续：不写定格、不写黑场、不写「镜头突然切换」。',
      '- 每段首尾各留 0.3 秒动作余量，方便剪辑对轨。',
    ].join('\n'),
  },
  {
    title: '台词音色标注',
    tags: ['配音', '台词', '音色'],
    text: [
      '- 每句台词写成「角色名｜音色标签：台词」，例如：苏晚｜清冷女声·中低音：你早就知道了？',
      '- 同一角色跨集音色不变；要换声必须写明原因。',
      '- 情绪写在台词后的括号里（压抑·低声），不用形容词堆叠。',
      '- 旁白单独一行，标成「旁白｜沉稳男声」，不与角色台词混排。',
    ].join('\n'),
  },
  {
    title: '上线审核红线',
    tags: ['审核', '合规', '上线'],
    text: [
      '- 血腥、露骨、未成年人相关桥段一律删改；擦边台词不写。',
      '- 平台名、价格、收益率、真实机构名一律不写死；必要处写「待确认」。',
      '- 不搬运他人成片与角色形象；二创必须注明来源。',
      '- 上线前逐项过：画面合规、音效版权、BGM 版权、封面标题无违禁词。',
      '- 不做收益承诺，不用「最」「第一」这类绝对化表述。',
    ].join('\n'),
  },
]

/**
 * 列出片段（可按关键词过滤 title/text/tags），按 updatedAt 倒序。
 * @param {any} state
 * @param {string} [query]
 */
export function listSnippets(state, query = '') {
  const snippets = Array.isArray(state?.snippets) ? state.snippets : []
  const needle = safeStr(query).trim().toLowerCase()
  const list = snippets
    .filter(item => item !== null && typeof item === 'object')
    .map(record)
    .filter(item => {
      if (needle.length === 0) return true
      return `${item.title}\n${item.text}\n${item.tags.join(' ')}`.toLowerCase().includes(needle)
    })
  return list.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

/**
 * 新建或更新一个片段。
 * @param {{ id?: string, title?: string, text?: string, tags?: string[] | string }} input
 * @returns {{ ok: true, snippet: any, created: boolean } | { ok: false, error: string }}
 */
export function saveSnippet(state, input = {}) {
  if (state === null || typeof state !== 'object') return { ok: false, error: 'state 不可用' }
  const source = input !== null && typeof input === 'object' ? input : {}
  const title = safeStr(source.title).trim()
  const text = safeStr(source.text).trim()
  if (title.length === 0) return { ok: false, error: '片段标题不能为空' }
  if (title.length > MAX_TITLE) return { ok: false, error: `片段标题过长（上限 ${MAX_TITLE} 字）` }
  if (text.length === 0) return { ok: false, error: '片段内容不能为空' }
  if (text.length > MAX_SNIPPET_TEXT) return { ok: false, error: `片段内容过长（上限 ${MAX_SNIPPET_TEXT} 字）` }

  const snippets = ensureSnippets(state)
  const now = Date.now()
  const id = safeStr(source.id).trim()
  if (id.length > 0) {
    const existing = snippets.find(item => item !== null && typeof item === 'object' && item.id === id)
    if (existing === undefined) return { ok: false, error: `未找到片段 ${id}` }
    existing.title = title
    existing.text = text
    existing.tags = normalizeTags(source.tags)
    existing.updatedAt = now
    if (!Number.isFinite(Number(existing.createdAt))) existing.createdAt = now
    return { ok: true, snippet: record(existing), created: false }
  }

  const snippet = {
    id: snippetId(),
    title,
    text,
    tags: normalizeTags(source.tags),
    createdAt: now,
    updatedAt: now,
  }
  snippets.push(snippet)
  return { ok: true, snippet: record(snippet), created: true }
}

/**
 * 删除一个片段。
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
export function removeSnippet(state, id) {
  const snippets = Array.isArray(state?.snippets) ? state.snippets : []
  const target = safeStr(id).trim()
  if (target.length === 0) return { ok: false, error: '缺少片段 id' }
  const index = snippets.findIndex(item => item !== null && typeof item === 'object' && item.id === target)
  if (index < 0) return { ok: false, error: `未找到片段 ${target}` }
  snippets.splice(index, 1)
  return { ok: true, id: target }
}

/**
 * 只在 snippets 为空时写入内置 3 条（幂等）。
 * @returns {{ ok: true, added: number, ids: string[] }}
 */
export function ensureDefaultSnippets(state) {
  if (state === null || typeof state !== 'object') return { ok: false, added: 0, ids: [], error: 'state 不可用' }
  const snippets = ensureSnippets(state)
  if (snippets.length > 0) return { ok: true, added: 0, ids: [] }
  const now = Date.now()
  const created = DEFAULT_SNIPPETS.map(item => ({
    id: snippetId(),
    title: item.title,
    text: item.text,
    tags: [...item.tags],
    createdAt: now,
    updatedAt: now,
  }))
  snippets.push(...created)
  return { ok: true, added: created.length, ids: created.map(item => item.id) }
}
