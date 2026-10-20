/**
 * Smoke checks for the pure parts of the hub (no Host context needed).
 * Run: node test/smoke.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parseFrontmatter, domainInfo, isDomainSkill } from '../lib/catalog.js'
import { discover, checkUpdates, parseTar, relevance, installSkill } from '../lib/github-scout.js'
import { updateSkillCore, updateAllCore, upstreamOf } from '../lib/upgrade.js'
import { applyCustom, readSkill, mergeCustomBlock, validateReplacement, existingCustomBlock } from '../lib/skill-write.js'
import { lineDiff, recordChange, listHistory, readDiff, restoreBackup } from '../lib/history.js'
import { emptyState } from '../lib/state.js'

const skillsRoot = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skills')
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. frontmatter
const zdy = await readFile(join(skillsRoot, 'zongdaoyan', 'SKILL.md'), 'utf8')
const fm = parseFrontmatter(zdy)
check('frontmatter name', fm.name === 'zongdaoyan', JSON.stringify(fm.name))
check('frontmatter version', fm.version === '1.3.0', String(fm.version))
check('frontmatter agent_created', fm.agent_created === true, String(fm.agent_created))
check('frontmatter description is long', typeof fm.description === 'string' && fm.description.length > 100)

// 2. domain classification over every installed skill
const dirs = (await readdir(skillsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory())
let domain = 0
for (const entry of dirs) {
  const text = await readFile(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8').catch(() => '')
  const meta = parseFrontmatter(text)
  const info = domainInfo({
    name: entry.name,
    description: String(meta.description ?? ''),
    whenToUse: String(meta.when_to_use ?? ''),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
  })
  const accepted = isDomainSkill(info, 'user-dsh')
  if (accepted) domain += 1
  else console.log(`  (not domain) ${entry.name} score=${info.score} hits=${info.hits.join(',')}`)
}
check('all local skills classified as manju', domain === dirs.length, `${domain}/${dirs.length}`)

// 3. relevance
const zs = relevance({ full_name: 'zenstory-ai/drama-skills', description: '开源 AI 短剧/漫剧创作 skill 合集：剧本、分镜', topics: [] })
check('relevance accepts drama-skills', zs.accepted === true, JSON.stringify(zs.hits))
const deck = relevance({ full_name: 'appautomaton/presentation', description: 'consulting-grade deck, strategy storyboarding', topics: [] })
check('relevance rejects generic storyboard deck', deck.accepted === false, JSON.stringify(deck.hits))

// 4. tar parser (build a tar with the system tar, then parse)
const { execFileSync } = await import('node:child_process')
const { mkdtemp, writeFile, rm, mkdir } = await import('node:fs/promises')
const { tmpdir } = await import('node:os')
const temp = await mkdtemp(join(tmpdir(), 'msh-test-'))
try {
  await mkdir(join(temp, 'repo-abc', 'skills', 'demo'), { recursive: true })
  await writeFile(join(temp, 'repo-abc', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\nhello\n')
  await writeFile(join(temp, 'repo-abc', 'skills', 'demo', 'ref.txt'), 'ref\n')
  execFileSync('C:/Windows/System32/tar.exe', ['-czf', join(temp, 'bundle.tgz'), '-C', temp, 'repo-abc'])
  const { gunzipSync } = await import('node:zlib')
  const archive = gunzipSync(await readFile(join(temp, 'bundle.tgz')))
  const entries = parseTar(archive)
  const md = entries.find(entry => entry.type === 'file' && /skills\/demo\/SKILL\.md$/.test(entry.name))
  check('tar finds SKILL.md', md !== undefined, entries.map(entry => entry.name).join(' | '))
  check('tar keeps file content', md !== undefined && md.data.toString('utf8').includes('hello'))
} finally {
  await rm(temp, { recursive: true, force: true })
}

// 5. live GitHub discovery (small budget; skipped with MSH_SKIP_NETWORK=1)
if (process.env.MSH_SKIP_NETWORK !== '1') {
  const state = emptyState()
  const result = await discover(state, {
    githubMinIntervalHours: 0,
    verifyReposPerRun: 3,
    queries: ['topic:claude-skills storyboard'],
  }, { force: true })
  check('live discover runs', typeof result.searches === 'number', JSON.stringify({ searches: result.searches, verified: result.verified, pending: result.pending, error: result.error }))
  check('live discover found a skill repo', result.verified >= 1, `verified=${result.verified} candidates=${result.candidates}`)
  if (state.discoveries.length > 0) {
    const first = state.discoveries[0]
    console.log(`  sample: ${first.repo} ★${first.stars} paths=${first.skillPaths.slice(0, 3).join(',')}`)
    check('sample has SKILL.md path', first.skillPaths.length > 0)
  }
  const updates = await checkUpdates(state, { updateCheckPerRun: 2 })
  check('live update check runs', typeof updates.checked === 'number', JSON.stringify(updates.notes ?? []))

  // 6. install into an isolated DSH_HOME (never touches the real skills dir)
  const { mkdtemp, rm, readFile: readFile2 } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const isolated = await mkdtemp(join(tmpdir(), 'msh-home-'))
  const previousHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = isolated
    const fresh = emptyState()
    const found = await discover(fresh, {
      githubMinIntervalHours: 0,
      verifyReposPerRun: 3,
      queries: ['topic:claude-skills storyboard'],
    }, { force: true })
    const candidate = fresh.discoveries.find(item => item.skillPaths.length > 0)
    check('install candidate discovered', candidate !== undefined, `verified=${found.verified}`)
    if (candidate !== undefined) {
      const result = await installSkill(fresh, {}, { id: candidate.id, skillPath: candidate.skillPaths[0], by: 'agent' })
      check('install writes a skill folder', result.ok === true, JSON.stringify(result))
      if (result.ok === true) {
        const md = await readFile2(join(result.target, 'SKILL.md'), 'utf8').catch(() => null)
        check('installed SKILL.md readable', typeof md === 'string' && md.length > 0)
        check('install records provenance', fresh.installs[result.name]?.by === 'agent')
        const second = await installSkill(fresh, {}, { id: candidate.id, skillPath: candidate.skillPaths[0], by: 'agent' })
        check('install refuses to overwrite', second.ok === false, String(second.error))

        // 7. one-click update: local edit is replaced by upstream head, backup kept
        const original = await readFile2(join(result.target, 'SKILL.md'), 'utf8')
        const { writeFile: writeFile2 } = await import('node:fs/promises')
        await writeFile2(join(result.target, 'SKILL.md'), `${original}\n<!-- local edit that must disappear -->\n`)
        fresh.skills[result.name] = {
          name: result.name,
          path: result.target,
          skillFile: join(result.target, 'SKILL.md'),
          version: '0.0.1-local',
          installedAt: Date.now(),
          hasSkillFile: true,
        }
        const upstream = upstreamOf(fresh, fresh.skills[result.name])
        check('upstream resolved for installed skill', upstream !== null, JSON.stringify(upstream))
        const updated = await updateSkillCore({
          state: fresh,
          name: result.name,
          skillsRoot: join(isolated, 'skills'),
          hubDir: join(isolated, 'manju-skill-hub'),
          by: 'agent',
        })
        check('update succeeds', updated.ok === true, JSON.stringify(updated))
        if (updated.ok === true) {
          const after = await readFile2(join(result.target, 'SKILL.md'), 'utf8')
          check('update replaces local edits', !after.includes('local edit that must disappear'))
          const backupMd = await readFile2(join(updated.backupDir, 'SKILL.md'), 'utf8').catch(() => null)
          check('update keeps a full backup', typeof backupMd === 'string' && backupMd.includes('local edit that must disappear'))
          check('update records provenance', fresh.installs[result.name]?.lastUpdateBy === 'agent')
          check('update clears the update flag', fresh.skills[result.name]?.update?.available === false)
        }

        // 8. batch update path is a no-op when nothing is flagged
        fresh.skills[result.name].update = { available: true, repo: upstream?.repo ?? null }
        const batch = await updateAllCore({
          state: fresh,
          skillsRoot: join(isolated, 'skills'),
          hubDir: join(isolated, 'manju-skill-hub'),
          by: 'agent',
        })
        check('updateAll runs and succeeds', batch.ok === true && batch.updated === 1, JSON.stringify({ attempted: batch.attempted, updated: batch.updated }))

        // 9. custom update: managed block, idempotent re-apply, replace guard
        const customContext = {
          state: fresh,
          name: result.name,
          skillsRoot: join(isolated, 'skills'),
          hubDir: join(isolated, 'manju-skill-hub'),
          by: 'agent',
        }
        const first = await applyCustom({ ...customContext, mode: 'append', text: '## 新规则\n- 15 秒分段' })
        check('custom append writes', first.ok === true, JSON.stringify(first))
        const afterAppend = await readFile2(join(result.target, 'SKILL.md'), 'utf8')
        check('custom block present', afterAppend.includes('manju-skill-hub:custom:begin') && afterAppend.includes('15 秒分段'))
        check('custom block readable', existingCustomBlock(afterAppend)?.includes('15 秒分段') === true)
        const secondCustom = await applyCustom({ ...customContext, mode: 'append', text: '- 改成 30 秒分段' })
        const afterAgain = await readFile2(join(result.target, 'SKILL.md'), 'utf8')
        check('custom append is idempotent', secondCustom.ok === true && (afterAgain.match(/manju-skill-hub:custom:begin/g) ?? []).length === 1 && afterAgain.includes('30 秒分段') && !afterAgain.includes('15 秒分段'))
        check('custom records provenance', fresh.edits[result.name]?.by === 'agent')
        const invalidReplace = await applyCustom({ ...customContext, mode: 'replace', text: 'no frontmatter' })
        check('replace rejects missing frontmatter', invalidReplace.ok === false && validateReplacement('no frontmatter') !== null)
        const validReplace = await applyCustom({
          ...customContext,
          mode: 'replace',
          text: `---\nname: ${result.name}\ndescription: test fixture\n---\n\n# 重写后的技能\n- 规则 A\n`,
        })
        check('replace writes valid full file', validReplace.ok === true && (await readFile2(join(result.target, 'SKILL.md'), 'utf8')).includes('重写后的技能'))
        const readBack = await readSkill({ state: fresh, name: result.name, skillsRoot: join(isolated, 'skills') })
        check('readSkill returns content', readBack.ok === true && readBack.content.includes('规则 A'))
        const mergeCheck = mergeCustomBlock('---\nname: x\n---\n\n# body\n', '补充', 'top')
        check('merge top keeps frontmatter first', mergeCheck.startsWith('---\nname: x\n---') && mergeCheck.includes('补充'))

        // 10. history + rollback
        const diff = lineDiff('a\nb\nc', 'a\nc\nd')
        check('line diff marks changes', diff.text.includes('- b') && diff.text.includes('+ d'), JSON.stringify({ added: diff.added, removed: diff.removed }))
        const historyEntry = await recordChange({
          state: fresh,
          hubDir: join(isolated, 'manju-skill-hub'),
          name: result.name,
          kind: 'custom',
          by: 'agent',
          backupDir: secondCustom.backupDir,
          before: 'old body',
          after: 'new body',
          summary: 'fixture change',
        })
        check('history entry recorded', historyEntry.id.startsWith('h-') && listHistory(fresh, result.name).length >= 1)
        const diffFile = await readDiff(join(isolated, 'manju-skill-hub'), historyEntry.id)
        check('history diff readable', diffFile.ok === true && diffFile.text.includes('+ new body'))
        const restored = await restoreBackup({
          state: fresh,
          id: historyEntry.id,
          skillsRoot: join(isolated, 'skills'),
          hubDir: join(isolated, 'manju-skill-hub'),
          by: 'agent',
        })
        check('rollback restores backup', restored.ok === true, JSON.stringify(restored))
        const restoredBody = await readFile2(join(result.target, 'SKILL.md'), 'utf8')
        check('rollback brings old content back', restoredBody.includes('15 秒分段'))
        check('rollback records a history entry', listHistory(fresh, result.name)[0]?.kind === 'rollback')
        const missing = await restoreBackup({
          state: fresh,
          id: 'h-missing-0000',
          skillsRoot: join(isolated, 'skills'),
          hubDir: join(isolated, 'manju-skill-hub'),
        })
        check('rollback rejects unknown id', missing.ok === false)
      }
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(isolated, { recursive: true, force: true })
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
