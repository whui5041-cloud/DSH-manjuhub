/**
 * 项目工作台（projects）：把「一个项目的目录」和「本机技能」绑在一起，
 * 打开就能看到目录是否存在、技能解析到哪些、顶层交付物有哪些、缺什么。
 *
 * 只做读取与 state.projects 的增删改（由调用方持久化），不写任何文件。
 */
import { readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import { stageOf } from './quality-check.js'

/** 顶层交付物最多列 50 个，避免大目录把 UI 拖死。 */
export const MAX_DELIVERABLES = 50
const MAX_NAME_LENGTH = 80
const MAX_SKILL_NAME_LENGTH = 120

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

async function statOrNull(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

function projectId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function uniqueStrings(values, limit = 200) {
  const out = []
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (text.length === 0 || text.length > limit || out.includes(text)) continue
    out.push(text)
  }
  return out
}

/** 去掉包裹引号并 resolve 成绝对路径（不要求目录已存在）。 */
function normalizeProjectPath(raw) {
  let text = typeof raw === 'string' ? raw.trim() : ''
  if (text.length === 0) return ''
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  if (text.length === 0) return ''
  return resolve(text)
}

function projectRecord(project) {
  return {
    id: safeStr(project?.id),
    name: safeStr(project?.name),
    path: safeStr(project?.path),
    skillNames: Array.isArray(project?.skillNames) ? [...project.skillNames] : [],
    createdAt: Number.isFinite(Number(project?.createdAt)) ? Number(project.createdAt) : 0,
  }
}

function ensureProjects(state) {
  if (state === null || typeof state !== 'object') return []
  if (!Array.isArray(state.projects)) state.projects = []
  return state.projects
}

function findIndex(state, id) {
  const projects = Array.isArray(state?.projects) ? state.projects : []
  return projects.findIndex(item => item !== null && typeof item === 'object' && item.id === id)
}

/**
 * 列出全部项目（按添加顺序，返回副本，调用方可以随便改）。
 * @returns {Array<{ id: string, name: string, path: string, skillNames: string[], createdAt: number }>}
 */
export function listProjects(state) {
  const projects = Array.isArray(state?.projects) ? state.projects : []
  return projects
    .filter(item => item !== null && typeof item === 'object' && safeStr(item.id).length > 0)
    .map(projectRecord)
}

/**
 * 新建项目：校验名称非空、路径规范化并去重。
 * @returns {{ ok: true, project: any } | { ok: false, error: string }}
 */
export function addProject(state, input = {}) {
  if (state === null || typeof state !== 'object') return { ok: false, error: 'state 不可用' }
  const source = input !== null && typeof input === 'object' ? input : {}
  const name = safeStr(source.name).trim()
  if (name.length === 0) return { ok: false, error: '项目名称不能为空' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `项目名称过长（上限 ${MAX_NAME_LENGTH} 字）` }
  const path = normalizeProjectPath(source.path)
  if (path.length === 0) return { ok: false, error: '项目路径不能为空' }

  const projects = ensureProjects(state)
  const duplicate = projects.find(item => item !== null && typeof item === 'object'
    && safeStr(item.path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())
  if (duplicate !== undefined) return { ok: false, error: `该项目路径已经添加过：${duplicate.name || path}` }

  const project = {
    id: projectId(),
    name,
    path,
    skillNames: uniqueStrings(source.skillNames, MAX_SKILL_NAME_LENGTH),
    createdAt: Date.now(),
  }
  projects.push(project)
  return { ok: true, project: projectRecord(project) }
}

/**
 * 删除项目。
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
export function removeProject(state, id) {
  const projects = Array.isArray(state?.projects) ? state.projects : []
  const index = findIndex(state, id)
  if (index < 0) return { ok: false, error: `未找到项目 ${safeStr(id) || '（缺少 id）'}` }
  projects.splice(index, 1)
  return { ok: true, id: safeStr(id) }
}

/**
 * 给项目绑定一个技能。
 * @returns {{ ok: true, project: any } | { ok: false, error: string }}
 */
export function bindSkill(state, id, skillName) {
  const index = findIndex(state, id)
  if (index < 0) return { ok: false, error: `未找到项目 ${safeStr(id) || '（缺少 id）'}` }
  const name = safeStr(skillName).trim()
  if (name.length === 0) return { ok: false, error: '技能名不能为空' }
  if (name.length > MAX_SKILL_NAME_LENGTH) return { ok: false, error: '技能名过长' }
  const project = state.projects[index]
  if (!Array.isArray(project.skillNames)) project.skillNames = []
  if (project.skillNames.includes(name)) return { ok: false, error: `技能 ${name} 已经绑定到这个项目` }
  project.skillNames.push(name)
  return { ok: true, project: projectRecord(project) }
}

/**
 * 解绑一个技能。
 * @returns {{ ok: true, project: any } | { ok: false, error: string }}
 */
export function unbindSkill(state, id, skillName) {
  const index = findIndex(state, id)
  if (index < 0) return { ok: false, error: `未找到项目 ${safeStr(id) || '（缺少 id）'}` }
  const name = safeStr(skillName).trim()
  if (name.length === 0) return { ok: false, error: '技能名不能为空' }
  const project = state.projects[index]
  const skillNames = Array.isArray(project.skillNames) ? project.skillNames : []
  if (!skillNames.includes(name)) return { ok: false, error: `技能 ${name} 没有绑定到这个项目` }
  project.skillNames = skillNames.filter(item => item !== name)
  return { ok: true, project: projectRecord(project) }
}

/* ------------------------------------------------------------------ *
 * 交付物命名检查
 * ------------------------------------------------------------------ */

const DELIVERABLE_PATTERNS = [
  { id: 'script', label: '剧本', pattern: /(?:^|[\\/\s_.-])(?:scripts?|screenplay|剧本|分集|台词表)(?:[\\/\s_.-]|$)/i, hint: '缺少 script-* 命名的剧本交付物（如 script-ep01.md）' },
  { id: 'storyboard', label: '分镜', pattern: /(?:^|[\\/\s_.-])(?:storyboards?|shotlist|分镜|镜头表|故事板)(?:[\\/\s_.-]|$)/i, hint: '缺少 storyboard-* 命名的分镜交付物（如 storyboard-ep01.md）' },
  { id: 'assets', label: '资产', pattern: /(?:^|[\\/\s_.-])(?:assets?|资产|角色|人设|立绘|场景图)(?:[\\/\s_.-]|$)/i, hint: '缺少 assets-* 命名的资产清单（如 assets-characters.md）' },
  { id: 'feed', label: '投喂', pattern: /(?:^|[\\/\s_.-])(?:feed|seedance|投喂|提示词|prompts?)(?:[\\/\s_.-]|$)/i, hint: '缺少 feed-* 命名的投喂稿（如 feed-ep01.md）' },
  { id: 'qc', label: '质检', pattern: /(?:^|[\\/\s_.-])(?:qc|质检|检查表|review|audit)(?:[\\/\s_.-]|$)/i, hint: '缺少 qc-* 命名的质检记录（如 qc-ep01.md）' },
]

/**
 * 对交付物命名给轻量提示：有没有 script / storyboard / assets 这样的前缀。
 * @param {Array<string | { name?: string }>} files
 * @returns {{ ok: boolean, checked: number, missing: string[], hints: string[], covered: Record<string, boolean> }}
 */
export function deliverableCheck(files) {
  const names = (Array.isArray(files) ? files : [])
    .map(item => (typeof item === 'string' ? item : safeStr(item?.name)))
    .map(name => name.trim())
    .filter(name => name.length > 0)
  const covered = {}
  for (const item of DELIVERABLE_PATTERNS) {
    covered[item.id] = names.some(name => item.pattern.test(name))
  }
  const missing = DELIVERABLE_PATTERNS.filter(item => covered[item.id] !== true).map(item => item.id)
  const hints = DELIVERABLE_PATTERNS.filter(item => covered[item.id] !== true).map(item => item.hint)
  if (names.length === 0) hints.unshift('没有可检查的交付文件')
  return {
    ok: names.length > 0 && missing.length === 0,
    checked: names.length,
    missing,
    hints,
    covered,
  }
}

/* ------------------------------------------------------------------ *
 * 项目概览
 * ------------------------------------------------------------------ */

function resolveProjectDir(project, hubDir) {
  const raw = safeStr(project?.path).trim()
  if (raw.length === 0) return ''
  if (isAbsolute(raw)) return resolve(raw)
  const base = safeStr(hubDir).trim()
  return resolve(base.length > 0 ? base : process.cwd(), raw)
}

async function listTopLevel(dir, limit = MAX_DELIVERABLES) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    return { files: [], total: 0, truncated: false, error: String(error?.message ?? error) }
  }
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    const info = await statOrNull(full)
    const isDirectory = entry.isDirectory() || (info !== null && info.isDirectory())
    const isFile = info !== null && info.isFile()
    files.push({
      name: entry.name,
      isDirectory,
      size: isFile ? info.size : null,
      mtime: info === null ? null : info.mtimeMs,
      ext: isFile ? extname(entry.name).toLowerCase() : '',
    })
  }
  files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return {
    files: files.slice(0, limit),
    total: files.length,
    truncated: files.length > limit,
    error: null,
  }
}

function resolveSkills(project, state) {
  const names = uniqueStrings(project?.skillNames, MAX_SKILL_NAME_LENGTH)
  return names.map(name => {
    const skill = state?.skills?.[name]
    if (skill === undefined || skill === null || typeof skill !== 'object') {
      return {
        name,
        found: false,
        path: null,
        version: null,
        updatedAt: null,
        stage: 'other',
        label: '其他',
        reason: '本机没有这个技能',
      }
    }
    const stage = stageOf(skill)
    return {
      name,
      found: true,
      path: safeStr(skill.path) || null,
      version: safeStr(skill.version).trim() || null,
      updatedAt: Number.isFinite(Number(skill.updatedAt)) ? Number(skill.updatedAt) : null,
      stage: stage.stage,
      label: stage.label,
      reason: stage.reason,
    }
  })
}

/**
 * 项目概览：目录是否存在、绑定技能解析结果、顶层交付物、命名提示。
 * @param {{ state: any, project: any, hubDir?: string }} input
 */
export async function projectSummary(input = {}) {
  const { state, project: rawProject, hubDir } = input !== null && typeof input === 'object' ? input : {}
  const project = (rawProject !== null && typeof rawProject === 'object')
    ? rawProject
    : (Array.isArray(state?.projects) ? state.projects.find(item => item?.id === rawProject) : undefined)
  if (project === undefined || project === null || typeof project !== 'object') {
    return { ok: false, error: '缺少项目信息', project: null, path: '', exists: false, skills: [], files: [], fileCount: 0, truncated: false, warnings: [], checkedAt: Date.now() }
  }

  const dir = resolveProjectDir(project, hubDir)
  const dirStat = dir.length > 0 ? await statOrNull(dir) : null
  const exists = dirStat !== null && dirStat.isDirectory()
  const skills = resolveSkills(project, state)
  const warnings = []

  if (dir.length === 0) warnings.push('项目没有记录路径')
  else if (!exists) warnings.push(`项目目录不存在：${dir}`)

  const missingSkills = skills.filter(skill => skill.found !== true).map(skill => skill.name)
  if (skills.length === 0) warnings.push('还没有绑定技能，先绑定才能判断阶段覆盖')
  else if (missingSkills.length > 0) warnings.push(`技能未在本机找到：${missingSkills.join('、')}`)

  let listing = { files: [], total: 0, truncated: false, error: null }
  if (exists) {
    listing = await listTopLevel(dir)
    if (listing.error !== null) warnings.push(`读取项目目录失败：${listing.error}`)
    if (listing.total === 0) warnings.push('项目目录为空，没有可交付文件')
    if (listing.truncated) warnings.push(`顶层文件超过 ${MAX_DELIVERABLES} 个，只列出前 ${MAX_DELIVERABLES} 个`)
    if (listing.total > 0) {
      const check = deliverableCheck(listing.files)
      warnings.push(...check.hints)
    }
  }

  return {
    ok: exists,
    project: projectRecord(project),
    path: dir,
    exists,
    skills,
    files: listing.files,
    fileCount: listing.total,
    truncated: listing.truncated,
    warnings,
    checkedAt: Date.now(),
  }
}
