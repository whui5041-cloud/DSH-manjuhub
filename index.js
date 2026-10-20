/**
 * 漫剧技能中枢 (Manju Skill Hub) — Host half.
 *
 * Three jobs, one state file:
 *  1. Inventory every local skill (through the harness `skills` service),
 *     with description, version, timestamps, provenance and update state.
 *  2. A scheduled GitHub scout (deterministic search + SKILL.md verification)
 *     plus a daily reminder of what is pending installation.
 *  3. One operation surface shared by the agent tool `manju_skill_hub` and the
 *     Web UI (HTTP routes under /api/manju-skill-hub).
 */
import { loadState, saveState, dshHome, hubDir, skillsRoot } from './lib/state.js'
import { scanLocal, sortedSkills } from './lib/catalog.js'
import { checkUpdates, discover, installSkill } from './lib/github-scout.js'
import { updateAllCore, updateSkillCore } from './lib/upgrade.js'
import { applyCustom, readSkill } from './lib/skill-write.js'
import { propose as proposeWithRubric } from './lib/think-rubric.js'
import { listHistory, readDiff, recordChange, restoreBackup } from './lib/history.js'
import {
  backupStats, createSnapshot, exportLibrary, importLibrary, pruneBackups, recycleSkill, verifyBackupDir,
} from './lib/safety.js'
import {
  autoUpdateCandidates, autoUpdateEnabled, isPinned, pinSkill, probeRepo, setAutoUpdate, unpinSkill,
} from './lib/policy.js'
import { diagnostics, muteStatus, recentErrors, setMute, setUiState, uiState } from './lib/ops.js'
import { dedupeGroups, healthScore, referenceCheck, stageOf } from './lib/quality-check.js'
import { addProject, bindSkill, listProjects, projectSummary, removeProject, unbindSkill } from './lib/projects.js'
import { ensureDefaultSnippets, listSnippets, removeSnippet, saveSnippet } from './lib/snippets.js'
import { previewEdit } from './lib/preview.js'
import { parseSource, webUrl } from './lib/sources.js'
import { basename, join, resolve } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

export const inject = ['tools', 'timer']

const DEFAULT_TIME = '09:30'

function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const time = typeof source.reminderTime === 'string' && /^\d{1,2}:\d{2}$/.test(source.reminderTime) ? source.reminderTime : DEFAULT_TIME
  return {
    domainOnly: source.domainOnly !== false,
    reminderTime: time,
    remindOnBoot: source.remindOnBoot !== false,
    githubMinIntervalHours: Number.isFinite(source.githubMinIntervalHours) ? Number(source.githubMinIntervalHours) : 6,
    verifyReposPerRun: Number.isFinite(source.verifyReposPerRun) ? Number(source.verifyReposPerRun) : 10,
    updateCheckPerRun: Number.isFinite(source.updateCheckPerRun) ? Number(source.updateCheckPerRun) : 15,
    thinkMaxInputChars: Number.isFinite(source.thinkMaxInputChars) ? Number(source.thinkMaxInputChars) : 90_000,
    queries: Array.isArray(source.queries) ? source.queries.filter(item => typeof item === 'string' && item.length > 0) : undefined,
  }
}

/** True when `child` lives inside `parent` (Windows-tolerant). */
function isUnderPath(parent, child) {
  const normalize = value => resolve(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(`${root}/`)
}

/** Reveal a directory or file in the OS file manager (no shell, no output). */
function revealTarget(target) {
  const isDirectory = statSync(target).isDirectory()
  const platform = process.platform
  let command
  let args
  if (platform === 'win32') {
    command = 'explorer.exe'
    args = isDirectory ? [target] : [`/select,${target}`]
  } else if (platform === 'darwin') {
    command = 'open'
    args = isDirectory ? [target] : ['-R', target]
  } else {
    command = 'xdg-open'
    args = [isDirectory ? target : resolve(target, '..')]
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolvePromise() })
  })
}

function dayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function msUntilNextRun(time) {
  const [hoursRaw, minutesRaw] = String(time).split(':')
  const hours = Math.max(0, Math.min(23, Number(hoursRaw) || 0))
  const minutes = Math.max(0, Math.min(59, Number(minutesRaw) || 0))
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return Math.max(5_000, next.getTime() - now.getTime())
}

/** Whether today's scheduled reminder time has already passed. */
function pastReminderTime(time, now = new Date()) {
  const [hoursRaw, minutesRaw] = String(time).split(':')
  const hours = Math.max(0, Math.min(23, Number(hoursRaw) || 0))
  const minutes = Math.max(0, Math.min(59, Number(minutesRaw) || 0))
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  return now.getTime() >= due.getTime()
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req, maxBytes = 64 * 1024) {
  return await new Promise(resolve => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) { req.destroy(); resolve(null); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

function loopbackRequest(req) {
  const address = req.socket?.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1' && address !== '::ffff:7f00:1') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostname
  try { hostname = new URL(`http://${host}`).hostname }
  catch { return false }
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === new URL(`http://${host}`).host }
  catch { return false }
}

/** Short model-facing text for one action result. */
function skillLine(skill) {
  const version = skill.version === null ? '无版本' : `v${skill.version}`
  const update = skill.update?.available === true ? `上游有更新(${skill.update.repo})` : skill.update ? '已是最新' : '未检查更新'
  const owner = skill.updatedBy === 'agent' ? '智能体' : skill.updatedBy === 'user' ? '本人' : '未知'
  return `- ${skill.name} (${version}) · ${update} · 更新者:${owner} · ${String(skill.description ?? '').replace(/\s+/g, ' ').slice(0, 110)}`
}

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const state = loadState()
  const logger = ctx.get?.('logger')
  const log = message => { try { logger?.info?.(`[manju-skill-hub] ${message}`) } catch { /* logging is best-effort */ } }

  let chain = Promise.resolve()
  const withLock = operation => {
    const run = chain.then(operation)
    chain = run.catch(() => undefined)
    return run
  }

  const cwd = () => {
    try {
      const working = ctx.get?.('workingDirectory')
      const dir = working?.defaultDirectory
      if (typeof dir === 'string' && dir.length > 0) return dir
    } catch { /* optional service */ }
    return process.cwd()
  }

  /** A discovery path is already installed when a local skill has that folder name. */
  const installedPathsOf = item => {
    const paths = Array.isArray(item.skillPaths) ? item.skillPaths : []
    return paths.filter(path => state.skills[basename(path.replace(/\/SKILL\.md$/i, ''))] !== undefined)
  }
  const availablePathsOf = item => {
    const done = new Set(installedPathsOf(item))
    return (Array.isArray(item.skillPaths) ? item.skillPaths : []).filter(path => !done.has(path))
  }
  const isPending = item => item.status === 'pending' && availablePathsOf(item).length > 0

  const persist = () => {
    const error = saveState(state)
    if (error !== null) log(`state save failed: ${error}`)
    return error
  }

  /** Record a change by diffing its backup against the current SKILL.md. */
  const recordBackupChange = async ({ name, kind, by, backupDir, summary, repo }) => {
    const skill = state.skills[name]
    const afterFile = skill?.skillFile ?? (skill?.path ? join(skill.path, 'SKILL.md') : null)
    let before = ''
    let after = ''
    try { before = await readFile(join(backupDir, 'SKILL.md'), 'utf8') } catch { /* no before */ }
    if (afterFile !== null) {
      try { after = await readFile(afterFile, 'utf8') } catch { /* no after */ }
    }
    return recordChange({ state, hubDir: hubDir(), name, kind, by, backupDir, before, after, summary, repo })
  }

  const ensureLocal = (force = false) => withLock(async () => {
    if (!force && Date.now() - state.meta.lastLocalScanAt < 60_000) return null
    const result = await scanLocal(ctx, state, { cwd: cwd() })
    persist()
    return result
  })

  const ensureGithub = (force = false) => withLock(async () => {
    const result = await discover(state, config, { force })
    persist()
    return result
  })

  const ensureUpdates = () => withLock(async () => {
    const result = await checkUpdates(state, config)
    persist()
    return result
  })

  const overview = async (options = {}) => {
    await ensureLocal(false)
    const domainOnly = options.domainOnly !== false && config.domainOnly !== false
    const skills = sortedSkills(state, { domainOnly }).map(skill => {
      const edit = state.edits?.[skill.name]
      const editAt = edit?.at ?? 0
      const installAt = skill.install?.lastUpdatedAt ?? 0
      // A user/agent edit that is newer than the last upstream update owns the
      // provenance badge.
      const updatedBy = editAt > installAt ? edit.by : skill.updatedBy
      return {
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse,
        path: skill.path,
        skillFile: skill.skillFile,
        source: skill.source,
        provider: skill.provider,
        version: skill.version,
        tags: skill.tags,
        isDomain: skill.isDomain,
        agentCreated: skill.agentCreated,
        origin: skill.origin,
        updatedBy,
        editedAt: editAt > 0 ? editAt : null,
        updatedAt: skill.updatedAt,
        installedAt: skill.installedAt,
        firstSeenAt: skill.firstSeenAt,
        hasSkillFile: skill.hasSkillFile,
        update: skill.update,
        install: skill.install,
      }
    })
    const all = Object.values(state.skills)
    const pendingDiscoveries = state.discoveries.filter(isPending)
    const todayStart = startOfToday()
    const today = pendingDiscoveries.filter(item => item.firstSeenAt >= todayStart).length
    const updateCount = all.filter(skill => skill.update?.available === true).length
    // The stored reminder is a daily snapshot; the counts shown to the user and
    // the model must follow the live list (an install or ignore changes them).
    const reminderView = state.reminder === null ? null : {
      ...state.reminder,
      pending: pendingDiscoveries.length,
      pendingToday: today,
      updates: updateCount,
      pendingRepos: pendingDiscoveries.slice(0, 8).map(item => item.repo),
      updatedSkills: all.filter(skill => skill.update?.available === true).slice(0, 8).map(skill => skill.name),
    }
    return {
      ok: true,
      now: Date.now(),
      config: {
        reminderTime: config.reminderTime,
        domainOnly: config.domainOnly,
        githubMinIntervalHours: config.githubMinIntervalHours,
        hasGithubToken: ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT'].some(name => typeof process.env[name] === 'string' && process.env[name].length > 0),
        autoUpdate: autoUpdateEnabled(state),
        muteUntil: muteStatus(state).until,
      },
      ui: uiState(state),
      pins: Object.keys(state.pins ?? {}),
      home: dshHome(),
      skillsRoot: skillsRoot(),
      reminder: reminderView,
      reminderToday: state.reminder?.date === dayKey(),
      stats: {
        total: all.length,
        domain: all.filter(skill => skill.isDomain).length,
        pending: pendingDiscoveries.length,
        pendingToday: today,
        updates: updateCount,
        agentUpdated: all.filter(skill => skill.updatedBy === 'agent').length,
        lastLocalScanAt: state.meta.lastLocalScanAt,
        lastGithubScanAt: state.meta.lastGithubScanAt,
        lastGithubScanError: state.meta.lastGithubScanError,
        historyCount: Array.isArray(state.history) ? state.history.length : 0,
      },
      skills,
      discoveries: [...state.discoveries]
        .filter(item => item.status !== 'stale')
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .map(item => {
          const installedPaths = installedPathsOf(item)
          const availablePaths = availablePathsOf(item)
          return {
            ...item,
            installedPaths,
            availablePaths,
            allInstalled: installedPaths.length > 0 && availablePaths.length === 0,
            installedHere: item.status === 'installed',
          }
        }),
      meta: state.meta,
    }
  }

  const summary = async () => {
    await ensureLocal(false)
    const pending = state.discoveries.filter(isPending)
    const updates = Object.values(state.skills).filter(skill => skill.update?.available === true)
    const reminderToday = state.reminder?.date === dayKey()
    return {
      ok: true,
      pending: pending.length,
      pendingToday: pending.filter(item => item.firstSeenAt >= startOfToday()).length,
      updates: updates.length,
      domain: Object.values(state.skills).filter(skill => skill.isDomain).length,
      reminder: reminderToday ? {
        ...state.reminder,
        pending: pending.length,
        updates: updates.length,
        pendingRepos: pending.slice(0, 8).map(item => item.repo),
        updatedSkills: updates.slice(0, 8).map(skill => skill.name),
      } : state.reminder,
      reminderToday,
      now: Date.now(),
    }
  }

  /** Daily reminder: refresh data, then publish today's reminder record. */
  const deliverReminder = async (options = {}) => {
    const today = dayKey()
    if (muteStatus(state).until > Date.now() && options.force !== true) return state.reminder
    if (state.reminder?.date === today && options.force !== true) return state.reminder
    await ensureLocal(true)
    const gh = await ensureGithub(false).catch(error => ({ error: String(error?.message ?? error) }))
    await ensureUpdates().catch(() => null)
    const pending = state.discoveries.filter(isPending)
    const updates = Object.values(state.skills).filter(skill => skill.update?.available === true)
    const todayStart = startOfToday()
    state.reminder = {
      date: today,
      at: Date.now(),
      pending: pending.length,
      pendingToday: pending.filter(item => item.firstSeenAt >= todayStart).length,
      updates: updates.length,
      updatedSkills: updates.slice(0, 8).map(skill => skill.name),
      pendingRepos: pending.slice(0, 8).map(item => item.repo),
      githubError: gh?.error ?? gh?.notes?.[0] ?? null,
    }
    state.meta.lastReminderDate = today
    state.meta.lastReminderAt = Date.now()
    persist()
    log(`daily reminder ${today}: ${pending.length} pending, ${updates.length} updates`)
    return state.reminder
  }

  const ignore = id => withLock(async () => {
    const item = state.discoveries.find(entry => entry.id === id)
    if (item === undefined) return { ok: false, error: `未找到 ${id}` }
    item.status = 'ignored'
    persist()
    return { ok: true, id, status: 'ignored' }
  })

  const unignore = id => withLock(async () => {
    const item = state.discoveries.find(entry => entry.id === id)
    if (item === undefined) return { ok: false, error: `未找到 ${id}` }
    item.status = 'pending'
    persist()
    return { ok: true, id, status: 'pending' }
  })

  const install = (request = {}) => withLock(async () => {
    const result = await installSkill(state, config, {
      id: request.id,
      skillPath: request.skillPath,
      by: request.by,
    })
    if (result.ok === true) {
      await scanLocal(ctx, state, { cwd: cwd() })
      const skill = state.skills[result.name]
      const afterFile = skill?.skillFile ?? join(result.target, 'SKILL.md')
      let after = ''
      try { after = await readFile(afterFile, 'utf8') } catch { /* no body */ }
      await recordChange({
        state,
        hubDir: hubDir(),
        name: result.name,
        kind: 'install',
        by: request.by,
        backupDir: null,
        before: '',
        after,
        summary: `安装自 ${result.repo}`,
        repo: result.repo,
      })
      persist()
    }
    return result
  })

  /**
   * Reveal a skill's folder or SKILL.md in the OS file manager.
   * User-facing navigation only: the path is resolved from the live inventory
   * and must stay inside the skills root, so the UI can never ask the Host to
   * open an arbitrary path.
   */
  const openLocal = async (request = {}) => {
    try {
      const root = skillsRoot()
      let allowedRoot = root
      let target = null
      if (request.root === true) {
        target = root
      } else if (request.backups === true) {
        target = join(hubDir(), 'backups')
        await mkdir(target, { recursive: true })
        allowedRoot = hubDir()
      } else {
        const name = typeof request.name === 'string' ? request.name : ''
        const skill = state.skills[name]
        if (skill === undefined) return { ok: false, error: `未找到技能 ${name}` }
        if (request.target === 'file') {
          target = skill.skillFile ?? (skill.path ? join(skill.path, 'SKILL.md') : null)
        } else {
          target = skill.path
        }
      }
      if (typeof target !== 'string' || target.length === 0) return { ok: false, error: '该技能没有本地路径' }
      if (!isUnderPath(allowedRoot, target)) return { ok: false, error: '只允许打开技能目录内的文件' }
      if (!existsSync(target)) return { ok: false, error: `路径不存在：${target}` }
      await revealTarget(target)
      return { ok: true, target }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  const updateSkill = (name, options = {}) => withLock(async () => {
    const result = await updateSkillCore({
      state,
      name,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      by: options.by,
      log,
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    if (result.ok === true) {
      await recordBackupChange({
        name: result.name,
        kind: 'upstream',
        by: options.by,
        backupDir: result.backupDir,
        summary: `上游更新 ${result.repo}`,
        repo: result.repo,
      })
    }
    persist()
    return result
  })

  const updateAll = (options = {}) => withLock(async () => {
    const result = await updateAllCore({
      state,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      by: options.by,
      log,
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    for (const item of result.results) {
      if (item.ok !== true) continue
      await recordBackupChange({
        name: item.name,
        kind: 'upstream',
        by: options.by,
        backupDir: item.backupDir,
        summary: `上游更新 ${item.repo}`,
        repo: item.repo,
      })
    }
    persist()
    return result
  })

  /** 自定义更新：用户提供文案，追加为受管小节或整篇替换（先备份）。 */
  const customUpdate = (request = {}) => withLock(async () => {
    const result = await applyCustom({
      state,
      name: request.name,
      text: request.text,
      mode: request.mode === 'replace' ? 'replace' : 'append',
      position: request.position === 'top' ? 'top' : 'end',
      by: request.by,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      log,
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    if (result.ok === true) {
      await recordBackupChange({
        name: result.name,
        kind: 'custom',
        by: request.by,
        backupDir: result.backupDir,
        summary: `自定义更新（${result.mode === 'replace' ? '整篇替换' : '追加小节'}）`,
      })
    }
    persist()
    return result
  })

  /** 回滚：把某次历史记录的完整目录备份恢复回来（先给当前版本做安全备份）。 */
  const rollback = (id, options = {}) => withLock(async () => {
    const result = await restoreBackup({
      state,
      id,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      by: options.by,
      log,
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    persist()
    return result
  })

  /** 思考模式：诊断 / 生成两段式，让默认模型给出可复核的更新建议（不落盘）。 */
  const thinkAbout = (request = {}) => proposeWithRubric({    llm: ctx.get?.('llm'),
    selection: ctx.get?.('agentDefaultModel')?.currentSelection?.(),
    state,
    name: request.name,
    mode: request.mode === 'replace' ? 'replace' : 'append',
    hint: typeof request.hint === 'string' ? request.hint : '',
    phase: request.phase === 'diagnose' ? 'diagnose' : 'generate',
    diagnosis: Array.isArray(request.diagnosis) ? request.diagnosis : [],
    skillsRoot: skillsRoot(),
    maxInputChars: config.thinkMaxInputChars,
    log,
  })

  const readSkillBody = (name, maxChars = 120_000) => readSkill({ state, name, skillsRoot: skillsRoot(), maxChars })

  /* ── roadmap: policy / safety / quality / projects / snippets ─────────── */

  const settings = () => {
    state.settings = { autoUpdate: false, autoUpdateExclude: [], muteUntil: 0, ...(state.settings ?? {}) }
    return state.settings
  }
  const ensureUi = () => {
    state.ui = { favorites: [], groups: {}, order: [], ...(state.ui ?? {}) }
    return state.ui
  }
  const findProject = ref => (state.projects ?? []).find(project => project.id === ref || project.name === ref)

  const qualityList = async () => {
    const items = []
    for (const skill of sortedSkills(state, { domainOnly: false })) {
      let refs = { ok: true, checked: 0, missing: [], warnings: [] }
      try { refs = await referenceCheck(skill) } catch { /* keep empty */ }
      const health = await healthScore(skill, state)
      const stage = stageOf(skill)
      items.push({
        name: skill.name,
        score: health.score,
        grade: health.grade,
        stage: stage?.stage ?? 'other',
        stageLabel: stage?.label ?? '',
        missing: refs.missing ?? [],
        signals: health.signals ?? [],
        pinned: isPinned(state, skill.name),
      })
    }
    return { items, duplicates: dedupeGroups(Object.values(state.skills)) }
  }

  const saveUi = patch => withLock(async () => {
    setUiState(state, patch)
    persist()
    return { ok: true, ui: uiState(state) }
  })

  const pin = (name, pinned) => withLock(async () => {
    if (typeof name !== 'string' || name.length === 0) return { ok: false, error: '缺少 name' }
    if (pinned === true) {
      pinSkill(state, name, {
        repo: state.skills[name]?.install?.repo ?? null,
        version: state.skills[name]?.version ?? null,
      })
    } else {
      unpinSkill(state, name)
    }
    persist()
    return { ok: true, name, pinned: isPinned(state, name) }
  })

  const setAuto = enabled => withLock(async () => {
    setAutoUpdate(state, enabled === true)
    persist()
    return { ok: true, autoUpdate: autoUpdateEnabled(state) }
  })

  const prune = request => withLock(async () => pruneBackups({
    hubDir: hubDir(),
    keepPerSkill: Number(request.keepPerSkill) > 0 ? Number(request.keepPerSkill) : 5,
    maxTotalBytes: Number(request.maxTotalBytes) > 0 ? Number(request.maxTotalBytes) : 2_000_000_000,
    dryRun: request.dryRun === true,
  }))

  const snapshot = request => withLock(async () => {
    const names = Array.isArray(request.names) && request.names.length > 0
      ? request.names
      : Object.keys(state.skills).slice(0, 30)
    return createSnapshot({ state, hubDir: hubDir(), skillsRoot: skillsRoot(), names })
  })

  const recycle = (name, options = {}) => withLock(async () => {
    const result = await recycleSkill({
      state,
      name,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      by: options.by,
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    persist()
    return result
  })

  const exportAll = request => withLock(async () => {
    const dir = typeof request.dir === 'string' && request.dir.length > 0
      ? request.dir
      : join(hubDir(), 'exports', `export-${Date.now().toString(36)}`)
    return exportLibrary({ state, hubDir: hubDir(), skillsRoot: skillsRoot(), targetDir: dir })
  })

  const importAll = request => withLock(async () => {
    if (typeof request.dir !== 'string' || request.dir.length === 0) return { ok: false, error: '缺少导入目录' }
    const result = await importLibrary({
      sourceDir: request.dir,
      skillsRoot: skillsRoot(),
      hubDir: hubDir(),
      rescan: async () => { await scanLocal(ctx, state, { cwd: cwd() }) },
    })
    persist()
    return result
  })

  const saveMute = request => withLock(async () => {
    const until = Number(request.untilMs) > 0
      ? Number(request.untilMs)
      : Date.now() + (Math.max(0, Number(request.hours) || 0) * 3600_000)
    setMute(state, until)
    persist()
    return { ok: true, muteUntil: muteStatus(state).until }
  })

  const preview = async request => {
    const body = await readSkillBody(request.name, 200_000)
    if (body.ok !== true) return { ok: false, error: body.error }
    const result = previewEdit({ original: body.content, text: request.text, mode: request.mode, position: request.position })
    return {
      ok: result.ok === true,
      error: result.error ?? null,
      validation: result.validation ?? null,
      beforeChars: result.beforeChars,
      afterChars: result.afterChars,
      diff: result.diff?.text ?? '',
      added: result.diff?.added ?? 0,
      removed: result.diff?.removed ?? 0,
      truncated: result.diff?.truncated === true,
    }
  }

  const projectAdd = (name, path) => withLock(async () => {
    const result = addProject(state, { name, path })
    if (result?.ok === true) persist()
    return result
  })
  const projectRemove = ref => withLock(async () => {
    const project = findProject(ref)
    if (project === undefined) return { ok: false, error: '项目不存在' }
    removeProject(state, project.id)
    persist()
    return { ok: true, removed: project.id }
  })
  const projectBind = (ref, skillName, bind = true) => withLock(async () => {
    const project = findProject(ref)
    if (project === undefined) return { ok: false, error: '项目不存在' }
    if (bind === true) bindSkill(state, project.id, skillName)
    else unbindSkill(state, project.id, skillName)
    persist()
    return { ok: true, project }
  })
  const openProject = async ref => {
    const project = findProject(ref)
    if (project === undefined) return { ok: false, error: '项目不存在' }
    if (!existsSync(project.path)) return { ok: false, error: `项目目录不存在：${project.path}` }
    await revealTarget(project.path)
    return { ok: true, path: project.path }
  }
  const projectSummaryOf = async request => {
    const project = findProject(request.name ?? request.id)
    if (project === undefined) return { ok: false, error: '项目不存在' }
    return { ok: true, ...(await projectSummary({ state, project, hubDir: hubDir() })) }
  }
  const snippetSave = body => withLock(async () => {
    const result = saveSnippet(state, { id: body.id, title: body.title, text: body.text, tags: body.tags })
    if (result?.ok === true) persist()
    return result
  })
  const snippetRemove = id => withLock(async () => {
    removeSnippet(state, id)
    persist()
    return { ok: true }
  })
  const healthOf = async name => {
    const skill = state.skills[name]
    if (skill === undefined) return { ok: false, error: '技能不存在' }
    const discoveryRepo = state.discoveries.find(item => (item.skillPaths ?? []).some(path => basename(path.replace(/\/SKILL\.md$/i, '')) === name))
    const repo = skill.install?.repo ?? discoveryRepo?.repo
    if (typeof repo !== 'string') return { ok: false, error: '该技能未关联上游仓库' }
    const health = await probeRepo(repo)
    let link = null
    try { link = webUrl(parseSource(repo)) } catch { link = null }
    return { ok: true, repo, webUrl: link, ...health }
  }

  // Tool surface: one tool, several actions. Every mutating action returns an
  // explicit status and never installs without the caller's confirmation.
  ctx.effect(() => ctx.tools.register({
    name: 'manju_skill_hub',
    description: '漫剧技能中枢：全览本机漫剧技能（介绍/版本/是否更新/由谁更新），并读取每日 GitHub 开源技能探测结果。action=overview 看清单；quality 看健康度/阶段/引用缺失；diagnostics 看运行诊断；projects 看项目工作台；read_skill 读取技能全文；custom_update 融合文案（需 confirm）；history/rollback 变更历史与回滚；discover/check_updates 探测与更新检查；install/update/update_all 安装与更新（需 confirm）；pin/unpin 锁定技能版本；ignore 忽略发现；reminder 生成今日提醒。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'quality', 'diagnostics', 'projects', 'read_skill', 'custom_update', 'history', 'rollback', 'pin', 'unpin', 'discover', 'check_updates', 'install', 'update', 'update_all', 'ignore', 'unignore', 'reminder', 'summary'],
          description: '要执行的动作，默认 overview。',
        },
        target: { type: 'string', description: 'discover 结果里的仓库/技能条目 id（形如 gh:owner/repo），或技能名（read_skill/custom_update/update/history 必填）。' },
        id: { type: 'string', description: 'rollback 要恢复的历史记录 id（h-...，由 history 返回）。' },
        text: { type: 'string', description: 'custom_update 要融合进技能的文案（Markdown）。' },
        mode: { type: 'string', enum: ['append', 'replace'], description: 'custom_update 的融合方式：append 追加受管小节（默认，安全），replace 整篇替换（需保留 frontmatter 与 name）。' },
        position: { type: 'string', enum: ['end', 'top'], description: 'append 时补充小节的位置：end 末尾（默认），top 正文开头。' },
        skill_path: { type: 'string', description: '可选：仓库内 SKILL.md 的路径；多技能仓库用它指定要装哪一套。' },
        scope: { type: 'string', enum: ['domain', 'all'], description: 'overview 的过滤范围：domain=只看漫剧相关（默认），all=全部技能。' },
        force: { type: 'boolean', description: 'discover 是否忽略最小间隔立即执行。' },
        confirm: { type: 'boolean', description: 'install/update/custom_update 必须在用户明确确认后传 true。' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    timeoutMs: 120_000,
    execute: async (rawArgs) => {
      const args = rawArgs !== null && typeof rawArgs === 'object' ? rawArgs : {}
      const action = typeof args.action === 'string' ? args.action : 'overview'
      if (action === 'overview' || action === 'summary') {
        const data = await overview({ domainOnly: args.scope !== 'all' })
        if (action === 'summary') return JSON.stringify(await summary())
        const lines = [
          `漫剧技能中枢 · 本机 ${data.stats.domain}/${data.stats.total} 个漫剧技能 · 待安装 ${data.stats.pending} · 可更新 ${data.stats.updates}`,
          data.stats.lastGithubScanError === null ? '' : `GitHub 状态：${data.stats.lastGithubScanError}`,
          ...data.skills.map(skillLine),
        ]
        return lines.filter(Boolean).join('\n')
      }
      if (action === 'discover') {
        const result = await ensureGithub(args.force === true)
        if (result.skipped === true) return result.reason
        const pending = state.discoveries.filter(isPending)
        const lines = [
          `GitHub 探测完成：搜索 ${result.searches} 次，相关性候选 ${result.candidates}，校验到 SKILL.md ${result.verified} 个，当前待确认安装 ${pending.length} 个。`,
          result.error === null ? '' : `注意：${result.error}`,
          ...(result.notes ?? []).slice(0, 5),
          ...pending.slice(0, 12).map(item => `- ${item.repo} ★${item.stars} · ${item.skillPaths.length} 个技能 · ${item.description.replace(/\s+/g, ' ').slice(0, 80)} · id=${item.id}`),
        ]
        return lines.filter(Boolean).join('\n')
      }
      if (action === 'check_updates') {
        const result = await ensureUpdates()
        const updates = Object.values(state.skills).filter(skill => skill.update?.available === true)
        return [
          `更新检查：读取 ${result.checked} 个上游仓库，覆盖 ${result.skills} 个技能，发现 ${result.available} 个可更新。`,
          ...updates.map(skill => `- ${skill.name}：上游 ${skill.update.repo} 有新提交`),
          ...(result.notes ?? []),
        ].join('\n')
      }
      if (action === 'install') {
        if (args.confirm !== true) return '拒绝安装：按协议，install 必须先在对话里得到用户的明确确认；确认后带 confirm=true 再调用。'
        if (typeof args.target !== 'string' || args.target.length === 0) return '缺少 target（discover 结果中的 id）。'
        const result = await install({ id: args.target, skillPath: args.skill_path, by: 'agent' })
        return result.ok
          ? `已安装技能 ${result.name}（${result.repo}）到 ${result.target}，写入 ${result.files} 个文件；新会话生效。`
          : `安装失败：${result.error}`
      }
      if (action === 'read_skill') {
        const name = typeof args.target === 'string' ? args.target : ''
        const result = await readSkillBody(name)
        if (result.ok !== true) return `读取失败：${result.error}`
        return [
          `# ${result.name} · ${result.totalChars} 字符${result.truncated ? '（已截断）' : ''}`,
          `路径：${result.file}`,
          '',
          result.content,
        ].join('\n')
      }
      if (action === 'custom_update') {
        if (args.confirm !== true) return '拒绝写入：custom_update 会修改技能文件，必须先得到用户明确确认，再带 confirm=true 调用。'
        if (typeof args.target !== 'string' || args.target.length === 0) return '缺少 target（技能名）。'
        if (typeof args.text !== 'string' || args.text.trim().length === 0) return '缺少 text（要融合的文案）。'
        const result = await customUpdate({ name: args.target, text: args.text, mode: args.mode, position: args.position, by: 'agent' })
        return result.ok
          ? `已融合到 ${result.name}（${result.mode === 'replace' ? '整篇替换' : '追加受管小节'}），备份在 ${result.backupDir}；新会话生效。`
          : `写入失败：${result.error}`
      }
      if (action === 'update') {
        if (args.confirm !== true) return '拒绝更新：update 会先备份再替换技能目录，必须先在对话里得到用户明确确认；确认后带 confirm=true 再调用。'
        if (typeof args.target !== 'string' || args.target.length === 0) return '缺少 target（技能名，例如 zongdaoyan）。'
        const result = await updateSkill(args.target, { by: 'agent' })
        return result.ok
          ? `已更新 ${result.name} ← ${result.repo}，写入 ${result.files} 个文件；旧版本备份在 ${result.backupDir}。新会话生效。`
          : `更新失败：${result.error}`
      }
      if (action === 'update_all') {
        if (args.confirm !== true) return '拒绝批量更新：必须先得到用户明确确认，再带 confirm=true 调用。'
        const result = await updateAll({ by: 'agent' })
        const failed = result.results.filter(item => item.ok !== true)
        return [
          `批量更新：尝试 ${result.attempted} 个，成功 ${result.updated} 个。`,
          ...result.results.filter(item => item.ok === true).map(item => `- ${item.name} ← ${item.repo}（${item.files} 个文件，备份 ${item.backupDir}）`),
          ...failed.map(item => `- ${item.name}：${item.error}`),
        ].join('\n')
      }
      if (action === 'ignore') {
        if (typeof args.target !== 'string') return '缺少 target。'
        const result = await ignore(args.target)
        return result.ok ? `已忽略 ${args.target}` : result.error
      }
      if (action === 'unignore') {
        if (typeof args.target !== 'string') return '缺少 target。'
        const result = await unignore(args.target)
        return result.ok ? `已恢复 ${args.target}` : result.error
      }
      if (action === 'history') {
        const name = typeof args.target === 'string' ? args.target : ''
        const items = listHistory(state, name).slice(0, 20)
        const line = item => `- ${new Date(item.at).toLocaleString()} [${item.kind}] ${item.name} · by ${item.by} · +${item.added}/-${item.removed} · ${item.summary} · id=${item.id}`
        return [`变更历史${name.length > 0 ? ` · ${name}` : ''}（最近 ${items.length} 条）`, ...items.map(line)].join('\n')
      }
      if (action === 'rollback') {
        if (args.confirm !== true) return '拒绝回滚：回滚会替换技能目录，必须先在对话里得到用户明确确认；确认后带 confirm=true 再调用。'
        const id = typeof args.id === 'string' && args.id.length > 0 ? args.id : (typeof args.target === 'string' ? args.target : '')
        if (id.length === 0) return '缺少 id（历史记录 id）。'
        const result = await rollback(id, { by: 'agent' })
        return result.ok === true
          ? `已把 ${result.name} 回滚到历史版本 ${result.restoredFrom}；回滚前的版本已备份到 ${result.safetyBackup}。`
          : `回滚失败：${result.error}`
      }
      if (action === 'quality') {
        const data = await qualityList()
        return [
          `质量体检（${data.items.length} 个技能）`,
          ...data.items.map(item => `- ${item.name} · ${item.grade}(${item.score}) · 阶段 ${item.stage}${item.missing.length > 0 ? ` · 缺引用 ${item.missing.length}` : ''}${item.pinned ? ' · pinned' : ''}`),
          ...(data.duplicates.length > 0 ? [`疑似重复：${data.duplicates.map(group => group.names.join('/')).join('；')}`] : []),
        ].join('\n')
      }
      if (action === 'diagnostics') {
        const data = await diagnostics({ state, hubDir: hubDir(), skillsRoot: skillsRoot() })
        return JSON.stringify({ ...data, recentErrors: recentErrors(state), muteUntil: muteStatus(state).until }, null, 2)
      }
      if (action === 'projects') {
        const items = listProjects(state)
        return [`项目工作台（${items.length}）`, ...items.map(project => `- ${project.name} · ${project.path} · 技能 ${project.skillNames?.length ?? 0}`)].join('\n')
      }
      if (action === 'pin' || action === 'unpin') {
        if (typeof args.target !== 'string' || args.target.length === 0) return '缺少 target（技能名）。'
        const result = await pin(args.target, action === 'pin')
        return result.ok ? `已${action === 'pin' ? '锁定' : '解锁'} ${args.target}` : result.error
      }
      if (action === 'reminder') {
        const reminder = await deliverReminder({ force: true })
        return `今日漫剧技能提醒（${reminder.date}）：待确认安装 ${reminder.pending} 个（今日新增 ${reminder.pendingToday}），可更新技能 ${reminder.updates} 个。${reminder.pendingRepos.length > 0 ? '仓库：' + reminder.pendingRepos.join('、') : ''}`
      }
      return `未知 action：${action}`
    },
  }))

  // Daily reminder through the system prompt (model-visible, no polling).
  const prompt = ctx.get?.('systemPrompt')
  if (prompt !== undefined && typeof prompt.section === 'function') {
    ctx.effect(() => prompt.section({
      name: 'manju-skill-hub:reminder',
      order: 40,
      text: () => {
        const reminder = state.reminder
        if (muteStatus(state).until > Date.now()) return ''
        if (reminder === null || reminder.date !== dayKey()) return ''
        const pending = state.discoveries.filter(isPending)
        const updates = Object.values(state.skills).filter(skill => skill.update?.available === true)
        if (pending.length + updates.length === 0) return ''
        const parts = [`【漫剧技能中枢 · 今日提醒 ${reminder.date}】待确认安装 ${pending.length} 个开源技能，可更新 ${updates.length} 个本机技能。`]
        if (pending.length > 0) parts.push(`待安装仓库：${pending.slice(0, 8).map(item => item.repo).join('、')}。`)
        if (updates.length > 0) parts.push(`可更新：${updates.slice(0, 8).map(skill => skill.name).join('、')}。`)
        parts.push('请在合适时机向用户汇报并询问是否安装/更新；安装必须得到用户明确同意后，用 manju_skill_hub(action=install, target, confirm=true) 执行。详细清单用 manju_skill_hub(action=overview)。')
        return parts.join('\n')
      },
    }))
  }

  // HTTP surface for the Web UI (loopback only, same-origin for mutations).
  ctx.inject(['webServer'], webCtx => {
    const disposers = []
    const prefix = '/api/manju-skill-hub'
    const handler = async (req, res) => {
      if (!loopbackRequest(req)) { json(res, 403, { ok: false, error: '仅允许本机同源访问' }); return }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname
      try {
        if (req.method === 'GET' && pathname === `${prefix}/overview`) {
          const domainOnly = url.searchParams.get('all') !== '1'
          json(res, 200, await overview({ domainOnly }))
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/summary`) {
          json(res, 200, await summary())
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/skill`) {
          const result = await readSkillBody(url.searchParams.get('name') ?? '', 200_000)
          json(res, result.ok ? 200 : 400, result)
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/history`) {
          const items = listHistory(state, url.searchParams.get('name') ?? '')
          json(res, 200, { ok: true, items, count: items.length })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/diff`) {
          const result = await readDiff(hubDir(), url.searchParams.get('id') ?? '')
          json(res, result.ok ? 200 : 400, result)
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/safety`) {
          json(res, 200, { ok: true, safety: await backupStats({ hubDir: hubDir() }) })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/diagnostics`) {
          const data = await diagnostics({ state, hubDir: hubDir(), skillsRoot: skillsRoot() })
          json(res, 200, {
            ok: true,
            diagnostics: {
              skills: data.skills?.total ?? 0,
              domain: data.skills?.domain ?? 0,
              pending: data.installs?.pending ?? 0,
              updates: data.updates?.available ?? 0,
              pins: data.pins ?? 0,
              history: typeof data.history === 'number' ? data.history : (data.history?.count ?? 0),
              edits: typeof data.edits === 'number' ? data.edits : (data.edits?.count ?? 0),
              backups: data.backups?.count ?? 0,
              backupBytes: data.backups?.bytes ?? 0,
              stateBytes: data.stateFile?.bytes ?? 0,
              stateFile: data.stateFile?.path ?? null,
              skillsRootExists: data.skillsRoot?.exists === true,
              recentErrors: recentErrors(state),
              muteUntil: muteStatus(state).until,
            },
            ui: uiState(state),
          })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/quality`) {
          json(res, 200, { ok: true, ...(await qualityList()) })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/projects`) {
          json(res, 200, { ok: true, items: listProjects(state) })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/projects/summary`) {
          json(res, 200, await projectSummaryOf({ name: url.searchParams.get('name') ?? url.searchParams.get('id') ?? '' }))
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/snippets`) {
          ensureDefaultSnippets(state)
          json(res, 200, { ok: true, items: listSnippets(state) })
          return
        }
        if (req.method === 'GET' && pathname === `${prefix}/ui`) {
          json(res, 200, { ok: true, ui: uiState(state) })
          return
        }
        if (req.method === 'POST' && pathname === `${prefix}/action`) {
          const body = await readBody(req)
          if (body === null) { json(res, 400, { ok: false, error: '请求体解析失败' }); return }
          const action = typeof body.action === 'string' ? body.action : ''
          if (action === 'open') { const result = await openLocal(body); json(res, result.ok ? 200 : 400, result); return }
          if (action === 'refresh') { const result = await ensureLocal(true); json(res, 200, { ok: true, result }); return }
          if (action === 'discover') {
            const result = await ensureGithub(body.force === true)
            json(res, 200, { ok: true, result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'check_updates') {
            const result = await ensureUpdates()
            json(res, 200, { ok: true, result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'prune_backups') {
            const result = await prune(body)
            json(res, 200, result)
            return
          }
          if (action === 'snapshot') {
            const result = await snapshot(body)
            json(res, 200, result)
            return
          }
          if (action === 'export') {
            const result = await exportAll(body)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'import') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '导入需要二次确认' }); return }
            const result = await importAll(body)
            json(res, result.ok ? 200 : 400, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'recycle') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '回收需要二次确认（会先备份）' }); return }
            const result = await recycle(body.name, { by: 'user' })
            json(res, result.ok ? 200 : 400, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'pin' || action === 'unpin') {
            const result = await pin(body.name, action === 'pin')
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'auto_update') {
            const result = await setAuto(body.enabled === true)
            json(res, 200, result)
            return
          }
          if (action === 'mute') {
            const result = await saveMute(body)
            json(res, 200, result)
            return
          }
          if (action === 'ui') {
            const result = await saveUi(body.patch ?? { favorites: body.favorites })
            json(res, 200, result)
            return
          }
          if (action === 'preview') {
            const result = await preview(body)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'think_diagnose') {
            const result = await thinkAbout({ name: body.name, mode: body.mode, hint: body.hint, phase: 'diagnose' })
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'project_add') {
            if (typeof body.name !== 'string' || typeof body.path !== 'string') {
              json(res, 400, { ok: false, error: '缺少 name / path' })
              return
            }
            try {
              json(res, 200, await projectAdd(body.name, body.path))
            } catch (error) {
              json(res, 400, { ok: false, error: String(error?.message ?? error) })
            }
            return
          }
          if (action === 'project_remove') {
            const result = await projectRemove(body.id ?? body.name)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'bind' || action === 'unbind') {
            const result = await projectBind(
              body.projectId ?? body.projectName ?? body.project,
              body.skillName ?? body.name,
              action === 'bind',
            )
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'open_project') {
            const result = await openProject(body.id ?? body.name)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'project_summary') {
            json(res, 200, await projectSummaryOf(body))
            return
          }
          if (action === 'snippet_save') {
            json(res, 200, await snippetSave(body))
            return
          }
          if (action === 'snippet_remove') {
            json(res, 200, await snippetRemove(body.id))
            return
          }
          if (action === 'health_check') {
            const result = await healthOf(body.name)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'install') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '安装需要二次确认' }); return }
            const result = await install({ id: body.id, skillPath: body.skillPath, by: 'user' })
            json(res, result.ok ? 200 : 400, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'update') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '更新需要二次确认（会先备份）' }); return }
            const result = await updateSkill(body.name, { by: 'user' })
            json(res, result.ok ? 200 : 400, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'update_all') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '批量更新需要二次确认' }); return }
            const result = await updateAll({ by: 'user' })
            json(res, 200, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'custom_update') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '写入技能需要二次确认（会先备份）' }); return }
            const result = await customUpdate({ name: body.name, text: body.text, mode: body.mode, position: body.position, by: 'user' })
            json(res, result.ok ? 200 : 400, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          if (action === 'rollback') {
            if (body.confirm !== true) { json(res, 400, { ok: false, error: '回滚需要二次确认（会先备份当前版本）' }); return }
            const result = await rollback(body.id, { by: 'user' })
            json(res, result.ok ? 200 : 400, {
              ...result,
              overview: await overview({ domainOnly: config.domainOnly }),
              history: listHistory(state),
            })
            return
          }
          if (action === 'think') {
            const result = await thinkAbout({ name: body.name, mode: body.mode, hint: body.hint, diagnosis: body.diagnosis })
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'ignore' || action === 'unignore') {
            const result = action === 'ignore' ? await ignore(body.id) : await unignore(body.id)
            json(res, 200, { ...result, overview: await overview({ domainOnly: config.domainOnly }) })
            return
          }
          json(res, 400, { ok: false, error: `未知 action：${action}` })
          return
        }
        json(res, 404, { ok: false, error: 'not found' })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    }
    for (const route of [
      { kind: 'exact', path: `${prefix}/overview` },
      { kind: 'exact', path: `${prefix}/summary` },
      { kind: 'exact', path: `${prefix}/skill` },
      { kind: 'exact', path: `${prefix}/history` },
      { kind: 'exact', path: `${prefix}/diff` },
      { kind: 'exact', path: `${prefix}/safety` },
      { kind: 'exact', path: `${prefix}/diagnostics` },
      { kind: 'exact', path: `${prefix}/quality` },
      { kind: 'exact', path: `${prefix}/projects` },
      { kind: 'exact', path: `${prefix}/projects/summary` },
      { kind: 'exact', path: `${prefix}/snippets` },
      { kind: 'exact', path: `${prefix}/ui` },
      { kind: 'exact', path: `${prefix}/action` },
    ]) {
      try { disposers.push(webCtx.webServer.register({ ...route, handler })) } catch { /* headless hosts */ }
    }
    return () => { for (const dispose of disposers) { try { dispose() } catch { /* already gone */ } } }
  })

  // Scheduled daily run.
  let timer = null
  const tick = async () => {
    try {
      await deliverReminder({})
      // Opt-in auto update: only skills flagged updatable and not pinned.
      if (autoUpdateEnabled(state)) {
        for (const name of autoUpdateCandidates(state).slice(0, 10)) {
          try { await updateSkill(name, { by: 'agent' }) } catch { /* one failure never blocks the rest */ }
        }
      }
    } catch (error) {
      log(`daily tick failed: ${String(error?.message ?? error)}`)
    }
  }
  const schedule = () => {
    timer = ctx.setTimeout(() => { void tick().finally(() => schedule()) }, msUntilNextRun(config.reminderTime))
  }
  ctx.effect(() => {
    const boot = ctx.setTimeout(async () => {
      // Keep the inventory warm on boot, but never publish a reminder before
      // its scheduled time: only a missed today's run is caught up.
      try {
        await ensureLocal(true)
        await ensureGithub(false)
      } catch (error) {
        log(`boot refresh failed: ${String(error?.message ?? error)}`)
      }
      if (config.remindOnBoot && pastReminderTime(config.reminderTime) && state.meta.lastReminderDate !== dayKey()) {
        await tick()
      }
    }, 5000)
    schedule()
    return () => { try { boot() } catch { /* gone */ }; try { timer?.() } catch { /* gone */ } }
  })

  try {
    ensureDefaultSnippets(state)
    ensureUi()
    settings()
    persist()
  } catch (error) {
    log(`state bootstrap failed: ${String(error?.message ?? error)}`)
  }

  log(`mounted · skills root ${skillsRoot()} · reminder ${config.reminderTime}`)
}
