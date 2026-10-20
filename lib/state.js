/**
 * Durable state for the Manju Skill Hub.
 *
 * Lives under $DSH_HOME/manju-skill-hub/state.json (same convention as other
 * profile plugins). Everything is plain JSON so a future version can read it;
 * writes go through a temp file + rename so a crash never leaves a half file.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Harness home. DSH_HOME is set in every profile-launched process. */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

export function hubDir() {
  return join(dshHome(), 'manju-skill-hub')
}

export function stateFile() {
  return join(hubDir(), 'state.json')
}

export function skillsRoot() {
  return join(dshHome(), 'skills')
}

/** A fresh state document. */
export function emptyState() {
  return {
    version: 1,
    skills: {},
    discoveries: [],
    installs: {},
    meta: {
      lastLocalScanAt: 0,
      lastGithubScanAt: 0,
      lastGithubScanError: null,
      lastGithubScanCount: 0,
      lastReminderAt: 0,
      lastReminderDate: null,
    },
    reminder: null,
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

/** Load and repair: unknown/older fields are filled with defaults. */
export function loadState() {
  const base = emptyState()
  let raw
  try {
    raw = JSON.parse(readFileSync(stateFile(), 'utf8'))
  } catch {
    return base
  }
  if (raw === null || typeof raw !== 'object') return base
  const state = { ...base, ...raw }
  state.skills = raw.skills !== null && typeof raw.skills === 'object' ? raw.skills : {}
  state.installs = raw.installs !== null && typeof raw.installs === 'object' ? raw.installs : {}
  state.discoveries = asArray(raw.discoveries).filter(item => item !== null && typeof item === 'object' && typeof item.id === 'string')
  state.meta = { ...base.meta, ...(raw.meta !== null && typeof raw.meta === 'object' ? raw.meta : {}) }
  state.reminder = raw.reminder !== null && typeof raw.reminder === 'object' ? raw.reminder : null
  return state
}

/** Persist atomically. Returns an error string instead of throwing so a save
 * failure never breaks a UI read or a scheduled tick. */
export function saveState(state) {
  try {
    const file = stateFile()
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, file)
    return null
  } catch (error) {
    return String(error?.message ?? error)
  }
}
