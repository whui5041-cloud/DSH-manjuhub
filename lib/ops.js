/**
 * Operations layer for the Manju Skill Hub: diagnostics, quiet-hours (mute),
 * persisted UI preferences (favorites / groups / order) and the recent-error
 * log that the diagnostics panel shows.
 *
 * Read paths never throw; writers mutate the in-memory `state` document and the
 * caller persists it (state.js saveState), matching the rest of the hub.
 */
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { backupStats } from './safety.js'

const MAX_RECENT_ERRORS = 20

function safeStr(value) {
  return typeof value === 'string' ? value : ''
}

function stateArg(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if ('skills' in value || 'discoveries' in value || 'meta' in value) return value
    if (value.state !== null && typeof value.state === 'object') return value.state
  }
  return {}
}

function settingsOf(state) {
  const raw = state.settings !== null && typeof state.settings === 'object' && !Array.isArray(state.settings)
    ? state.settings
    : {}
  const muteUntil = Number(raw.muteUntil)
  return {
    autoUpdate: raw.autoUpdate === true,
    autoUpdateExclude: Array.isArray(raw.autoUpdateExclude)
      ? raw.autoUpdateExclude.filter(item => typeof item === 'string' && item.length > 0)
      : [],
    muteUntil: Number.isFinite(muteUntil) && muteUntil > 0 ? muteUntil : 0,
  }
}

/** True when a discovery still has an uninstalled SKILL.md path. */
function pendingDiscovery(item, installed) {
  if (item === null || typeof item !== 'object') return false
  if (item.status !== 'pending') return false
  const paths = Array.isArray(item.skillPaths) ? item.skillPaths : []
  return paths.some(path => {
    const folder = basename(safeStr(path).replace(/\/SKILL\.md$/i, ''))
    return folder.length > 0 && !installed.has(folder)
  })
}

/**
 * Snapshot of everything the diagnostics panel needs, without mutating state.
 * @param {{state: object, hubDir: string, skillsRoot: string}} options
 * @returns {Promise<object>}
 */
export async function diagnostics({ state, hubDir, skillsRoot } = {}) {
  const doc = state !== null && typeof state === 'object' ? state : {}
  const skills = Object.values(doc.skills !== null && typeof doc.skills === 'object' ? doc.skills : {})
    .filter(skill => skill !== null && typeof skill === 'object')
  const installed = new Set(skills.map(skill => safeStr(skill.name)).filter(name => name.length > 0))
  const discoveries = Array.isArray(doc.discoveries) ? doc.discoveries : []
  const pending = discoveries.filter(item => pendingDiscovery(item, installed)).length
  const updates = skills.filter(skill => skill.update?.available === true).length
  const pins = doc.pins !== null && typeof doc.pins === 'object' ? Object.keys(doc.pins).length : 0
  const edits = doc.edits !== null && typeof doc.edits === 'object' ? Object.keys(doc.edits).length : 0
  const history = Array.isArray(doc.history) ? doc.history.length : 0

  let backups = { count: 0, bytes: 0 }
  try {
    const stats = await backupStats({ hubDir })
    backups = { count: stats.count, bytes: stats.totalBytes }
  } catch {
    // A missing or unreadable backup root is not a diagnostics failure.
  }

  const statePath = join(safeStr(hubDir), 'state.json')
  let stateFile = { path: statePath, bytes: 0, exists: false }
  try {
    const info = await stat(statePath)
    stateFile = { path: statePath, bytes: Number(info.size) || 0, exists: info.isFile() }
  } catch {
    // No state file yet.
  }

  const rootPath = safeStr(skillsRoot)
  let rootExists = false
  try {
    rootExists = (await stat(rootPath)).isDirectory()
  } catch {
    rootExists = false
  }

  return {
    ok: true,
    at: Date.now(),
    skills: {
      total: skills.length,
      domain: skills.filter(skill => skill.isDomain === true).length,
    },
    installs: { pending },
    updates: { available: updates },
    pins: { count: pins },
    history: { count: history },
    edits: { count: edits },
    backups,
    stateFile,
    skillsRoot: { path: rootPath, exists: rootExists },
    mute: muteStatus(doc),
  }
}

/**
 * Quiet-hours state.
 * @returns {{muted: boolean, until: number, remainingMs: number}}
 */
export function muteStatus(state) {
  const { muteUntil } = settingsOf(stateArg(state))
  const now = Date.now()
  const muted = muteUntil > now
  return { muted, until: muteUntil, remainingMs: muted ? muteUntil - now : 0 }
}

/**
 * Mute reminders until an absolute timestamp; 0 or a past time unmutes.
 * @param {object} state
 * @param {number|string|Date} untilMs
 * @returns {{ok: true, muteUntil: number}}
 */
export function setMute(state, untilMs) {
  const doc = stateArg(state)
  let value = Number(untilMs instanceof Date ? untilMs.getTime() : untilMs)
  if (!Number.isFinite(value) || value <= Date.now()) value = 0
  doc.settings = { ...settingsOf(doc), muteUntil: value }
  return { ok: true, muteUntil: value }
}

function uniqueStrings(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const value = safeStr(item).trim()
    if (value.length === 0 || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function groupsOf(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [key, members] of Object.entries(value)) {
    const name = safeStr(key).trim()
    if (name.length === 0) continue
    out[name] = uniqueStrings(members)
  }
  return out
}

/**
 * Normalized UI preferences: state.ui = {favorites, groups, order}.
 * @returns {{favorites: string[], groups: Record<string, string[]>, order: string[]}}
 */
export function uiState(state) {
  const doc = stateArg(state)
  const raw = doc.ui !== null && typeof doc.ui === 'object' && !Array.isArray(doc.ui) ? doc.ui : {}
  return {
    favorites: uniqueStrings(raw.favorites),
    groups: groupsOf(raw.groups),
    order: uniqueStrings(raw.order),
  }
}

/**
 * Shallow-merge a UI preference patch (favorites/order replace, groups merge).
 * @returns {{favorites: string[], groups: Record<string, string[]>, order: string[]}}
 */
export function setUiState(state, patch) {
  const doc = stateArg(state)
  const current = uiState(doc)
  const next = { favorites: current.favorites, groups: { ...current.groups }, order: current.order }
  if (patch !== null && typeof patch === 'object' && !Array.isArray(patch)) {
    if (Array.isArray(patch.favorites)) next.favorites = uniqueStrings(patch.favorites)
    if (patch.groups !== undefined) next.groups = { ...current.groups, ...groupsOf(patch.groups) }
    if (Array.isArray(patch.order)) next.order = uniqueStrings(patch.order)
  }
  doc.ui = next
  return { favorites: [...next.favorites], groups: { ...next.groups }, order: [...next.order] }
}

function pushError(out, message, at, source) {
  const text = safeStr(message).trim()
  if (text.length === 0) return
  const when = Number(at)
  out.push({
    at: Number.isFinite(when) && when > 0 ? when : null,
    message: text,
    source: safeStr(source).length > 0 ? source : 'unknown',
  })
}

/**
 * Recent errors recorded in state.meta, newest first (bounded).
 * Recognized fields: meta.errors[] (string or {message, at, source}),
 * lastGithubScanError, lastError, lastUpdateCheckError, lastReminderError.
 * @param {object} state
 * @param {number} [limit=20]
 * @returns {{at: number|null, message: string, source: string}[]}
 */
export function recentErrors(state, limit = MAX_RECENT_ERRORS) {
  const doc = stateArg(state)
  const meta = doc.meta !== null && typeof doc.meta === 'object' && !Array.isArray(doc.meta) ? doc.meta : {}
  const out = []
  for (const item of Array.isArray(meta.errors) ? meta.errors : []) {
    if (typeof item === 'string') pushError(out, item, null, 'meta.errors')
    else if (item !== null && typeof item === 'object') {
      pushError(out, item.message ?? item.error ?? '', item.at ?? item.time, item.source ?? 'meta.errors')
    }
  }
  pushError(out, meta.lastGithubScanError, meta.lastGithubScanErrorAt ?? meta.lastGithubScanAt, 'github-scan')
  pushError(out, meta.lastError, meta.lastErrorAt, 'last-error')
  pushError(out, meta.lastUpdateCheckError, meta.lastUpdateCheckAt, 'update-check')
  pushError(out, meta.lastReminderError, meta.lastReminderAt, 'reminder')
  out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
  const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : MAX_RECENT_ERRORS
  return out.slice(0, cap)
}

/**
 * Append one error to state.meta.errors (bounded ring). Callers persist state.
 * @returns {{at: number, message: string, source: string}}
 */
export function recordError(state, message, source = 'hub', limit = MAX_RECENT_ERRORS) {
  const doc = stateArg(state)
  const text = safeStr(message).trim()
  const entry = { at: Date.now(), message: text, source: safeStr(source) || 'hub' }
  if (text.length === 0) return entry
  if (doc.meta === null || typeof doc.meta !== 'object' || Array.isArray(doc.meta)) doc.meta = {}
  const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : MAX_RECENT_ERRORS
  const list = Array.isArray(doc.meta.errors) ? doc.meta.errors : []
  list.unshift(entry)
  doc.meta.errors = list.slice(0, cap)
  return entry
}
