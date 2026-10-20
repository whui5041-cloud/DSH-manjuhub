/**
 * Roadmap checks for the newer hub modules.
 *
 * Runs entirely in a temporary directory (os.tmpdir) with its own skillsRoot /
 * hubDir, so it never touches the real skill library, and never uses network.
 * Run: node test/roadmap.mjs
 */
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  backupStats, createSnapshot, exportLibrary, importLibrary, pruneBackups, verifyBackupDir,
} from '../lib/safety.js'
import {
  autoUpdateCandidates, autoUpdateEnabled, compareVersions, isPinned, pinSkill, setAutoUpdate, unpinSkill,
} from '../lib/policy.js'
import { dedupeGroups, healthScore, referenceCheck, stageOf } from '../lib/quality-check.js'
import { addProject, bindSkill, listProjects, projectSummary } from '../lib/projects.js'
import { ensureDefaultSnippets, listSnippets, removeSnippet, saveSnippet } from '../lib/snippets.js'
import { previewEdit } from '../lib/preview.js'
import { parseSource } from '../lib/sources.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const exists = async path => {
  try { await stat(path); return true } catch { return false }
}
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

const temp = await mkdtemp(join(tmpdir(), 'msh-roadmap-'))
const skillsRoot = join(temp, 'skills')
const hubDir = join(temp, 'manju-skill-hub')
const backupRoot = join(hubDir, 'backups')

try {
  /* ── fixtures ─────────────────────────────────────────────────────── */
  const makeSkill = async (name, frontmatter, body = '') => {
    const dir = join(skillsRoot, name)
    await mkdir(join(dir, 'references'), { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8')
    return dir
  }
  const scriptDir = await makeSkill(
    'demo-script',
    'name: demo-script\ndescription: 剧本阶段测试技能\nversion: 1.2.0',
    '# 剧本\n\n参考：[指南](references/guide.md)\n',
  )
  await writeFile(join(scriptDir, 'references', 'guide.md'), '# 指南\n', 'utf8')
  const brokenDir = await makeSkill(
    'demo-broken',
    'name: demo-broken\ndescription: 分镜测试技能',
    '# 分镜\n\n[缺失文件](references/missing.md)\n',
  )
  const bDir = await makeSkill('demo-b', 'name: demo-b\ndescription: 资产测试技能\nversion: 0.9.0', '# B\n')
  const cDir = await makeSkill('demo-c', 'name: demo-c\ndescription: 质检测试技能', '# C\n')

  const writeBackup = async (dirName, stampTime) => {
    const dir = join(backupRoot, dirName)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), `# ${dirName}\n`, 'utf8')
    await utimes(dir, stampTime, stampTime)
    return dir
  }
  const oldBackup = await writeBackup('demo-script-custom-20260101-000000-000', new Date('2026-01-01T00:00:00Z'))
  const midBackup = await writeBackup('demo-script-update-20260102-000000-000', new Date('2026-01-02T00:00:00Z'))
  const newBackup = await writeBackup('demo-script-update-20260103-000000-000', new Date('2026-01-03T00:00:00Z'))
  const brokenBackup = await writeBackup('demo-broken-rollback-20260101-000000-000', new Date('2026-01-04T00:00:00Z'))

  /* ── safety: backup inventory ─────────────────────────────────────── */
  const stats = await backupStats({ hubDir })
  const byName = Object.fromEntries(stats.bySkill.map(item => [item.name, item]))
  check('backupStats counts every backup', stats.ok === true && stats.count === 4, JSON.stringify({ count: stats.count }))
  check('backupStats groups by parsed skill name',
    byName['demo-script']?.count === 3 && byName['demo-broken']?.count === 1,
    JSON.stringify(stats.bySkill))
  check('backupStats reports non-zero bytes', stats.totalBytes > 0, String(stats.totalBytes))

  /* ── safety: verify / prune ───────────────────────────────────────── */
  const verified = await verifyBackupDir(newBackup)
  check('verifyBackupDir accepts a complete backup',
    verified.ok === true && verified.hasSkillMd === true && verified.files >= 1 && verified.bytes > 0,
    JSON.stringify(verified))
  const missingVerify = await verifyBackupDir(join(backupRoot, 'does-not-exist'))
  check('verifyBackupDir rejects a missing directory',
    missingVerify.ok === false && missingVerify.hasSkillMd === false && missingVerify.files === 0)

  const dry = await pruneBackups({ hubDir, keepPerSkill: 2, dryRun: true })
  check('pruneBackups dry run reports one removal', dry.ok === true && dry.removed.length === 1 && dry.kept === 3,
    JSON.stringify({ removed: dry.removed.length, kept: dry.kept }))
  check('pruneBackups dry run keeps every directory', await exists(oldBackup))

  const pruned = await pruneBackups({ hubDir, keepPerSkill: 2 })
  check('pruneBackups keeps the newest N per skill',
    pruned.ok === true && pruned.removed.length === 1 && pruned.freedBytes > 0,
    JSON.stringify({ removed: pruned.removed.length, kept: pruned.kept, freed: pruned.freedBytes }))
  check('pruneBackups removes the oldest backup only',
    !(await exists(oldBackup)) && (await exists(midBackup)) && (await exists(newBackup)) && (await exists(brokenBackup)))

  /* ── safety: snapshot ─────────────────────────────────────────────── */
  const snapState = { skills: { 'demo-script': { name: 'demo-script', path: scriptDir } } }
  const snapshot = await createSnapshot({ state: snapState, hubDir, skillsRoot, names: ['demo-script', 'ghost'] })
  check('createSnapshot copies a skill', snapshot.ok === true && snapshot.backups.length === 1,
    JSON.stringify({ backups: snapshot.backups.map(item => item.name), skipped: snapshot.skipped.length }))
  check('createSnapshot reports missing skills as skipped',
    snapshot.skipped.some(item => item.name === 'ghost'))
  const snapshotDir = snapshot.backups[0]?.dir ?? ''
  const snapshotCheck = await verifyBackupDir(snapshotDir)
  check('snapshot directory is a valid backup', snapshotCheck.ok === true && snapshotCheck.hasSkillMd === true)
  const afterSnapshot = await backupStats({ hubDir })
  check('snapshot shows up in backupStats', afterSnapshot.count === 4 && afterSnapshot.bySkill.some(item => item.name === 'demo-script' && item.count === 3),
    JSON.stringify(afterSnapshot.bySkill))

  /* ── safety: export / import ──────────────────────────────────────── */
  const exportDir = join(temp, 'export-out')
  const exportState = {
    skills: {
      'demo-script': {
        name: 'demo-script',
        path: scriptDir,
        version: '1.2.0',
        description: '剧本阶段测试技能',
        install: { repo: 'example/demo' },
      },
    },
  }
  const exported = await exportLibrary({ state: exportState, hubDir, skillsRoot, targetDir: exportDir })
  check('exportLibrary copies the library', exported.ok === true && exported.skills === 1 && exported.bytes > 0,
    JSON.stringify({ skills: exported.skills, bytes: exported.bytes }))
  const manifest = await readJson(join(exportDir, 'manifest.json')).catch(() => null)
  check('export writes a manifest with provenance',
    manifest?.count === 1 && manifest.skills?.[0]?.name === 'demo-script' && manifest.skills?.[0]?.repo === 'example/demo',
    JSON.stringify(manifest?.skills?.[0] ?? null))
  check('export copies SKILL.md into skills/',
    await exists(join(exportDir, 'skills', 'demo-script', 'SKILL.md')))

  const firstImport = await importLibrary({ sourceDir: exportDir, skillsRoot, hubDir })
  check('import skips existing names without overwriting',
    firstImport.ok === true && firstImport.imported === 0 && firstImport.skipped === 1,
    JSON.stringify({ imported: firstImport.imported, skipped: firstImport.skipped }))
  const freshSource = join(exportDir, 'skills', 'fresh-skill')
  await mkdir(freshSource, { recursive: true })
  await writeFile(join(freshSource, 'SKILL.md'), '---\nname: fresh-skill\ndescription: 导入测试\n---\n\n# Fresh\n', 'utf8')
  const secondImport = await importLibrary({ sourceDir: exportDir, skillsRoot, hubDir })
  check('import copies a new skill directory',
    secondImport.ok === true && secondImport.imported === 1 && secondImport.importedNames.includes('fresh-skill'),
    JSON.stringify(secondImport))
  check('imported SKILL.md exists', await exists(join(skillsRoot, 'fresh-skill', 'SKILL.md')))

  /* ── policy: pins ─────────────────────────────────────────────────── */
  const pstate = {
    skills: {
      alpha: { update: { available: true } },
      beta: { update: { available: true } },
      gamma: { update: { available: false } },
    },
    settings: { autoUpdate: false, autoUpdateExclude: [] },
    pins: {},
  }
  const pinned = pinSkill(pstate, 'alpha', { repo: 'owner/alpha', version: '1.0.0' })
  check('pinSkill records a pin', pinned.ok === true && pinned.pin.version === '1.0.0' && isPinned(pstate, 'alpha'))
  const objectPin = pinSkill({ state: pstate, name: 'beta', version: '2.0.0' })
  check('pinSkill accepts the object form', objectPin.ok === true && isPinned(pstate, 'beta'))

  /* ── policy: auto update ──────────────────────────────────────────── */
  const initialCandidates = autoUpdateCandidates(pstate)
  check('autoUpdateCandidates excludes pinned skills',
    initialCandidates.length === 0, JSON.stringify(initialCandidates))
  check('autoUpdate is off by default', autoUpdateEnabled(pstate) === false)
  const auto = setAutoUpdate(pstate, true, { exclude: [] })
  check('setAutoUpdate enables unattended updates', auto.ok === true && autoUpdateEnabled(pstate) === true)
  unpinSkill(pstate, 'beta')
  unpinSkill(pstate, 'alpha')
  setAutoUpdate(pstate, true, { autoUpdateExclude: ['alpha'] })
  const excludedCandidates = autoUpdateCandidates(pstate)
  check('autoUpdateCandidates excludes the exclusion list',
    excludedCandidates.join(',') === 'beta', JSON.stringify(excludedCandidates))
  setAutoUpdate(pstate, true, { autoUpdateExclude: [] })
  const finalCandidates = autoUpdateCandidates(pstate)
  check('autoUpdateCandidates keeps updatable unpinned skills',
    finalCandidates.join(',') === 'alpha,beta', JSON.stringify(finalCandidates))
  check('unpinSkill removes the pin', isPinned(pstate, 'alpha') === false)

  /* ── policy: version compare ──────────────────────────────────────── */
  check('compareVersions older', compareVersions('1.0.0', '1.0.1') === -1)
  check('compareVersions newer', compareVersions('2.0.0', '1.9.9') === 1)
  check('compareVersions equal with v prefix', compareVersions('v1.2.3', '1.2.3') === 0)
  check('compareVersions release beats prerelease', compareVersions('1.0.0', '1.0.0-beta') === 1)
  check('compareVersions prerelease is older', compareVersions('1.0.0-beta', '1.0.0') === -1)

  /* ── quality: reference check ─────────────────────────────────────── */
  const goodRefs = await referenceCheck({ name: 'demo-script', path: scriptDir, skillFile: join(scriptDir, 'SKILL.md') })
  check('referenceCheck passes when every reference exists',
    goodRefs.ok === true && goodRefs.checked >= 1 && goodRefs.missing.length === 0,
    JSON.stringify(goodRefs))
  const badRefs = await referenceCheck({ name: 'demo-broken', path: brokenDir, skillFile: join(brokenDir, 'SKILL.md') })
  check('referenceCheck reports a missing file',
    badRefs.ok === false && badRefs.missing.includes('references/missing.md'),
    JSON.stringify(badRefs))
  const noFileRefs = await referenceCheck({ name: 'ghost' })
  check('referenceCheck handles a skill without files',
    noFileRefs.ok === false && noFileRefs.warnings.length > 0)

  /* ── quality: health score ────────────────────────────────────────── */
  const healthA = await healthScore({
    name: 'demo-script',
    path: scriptDir,
    version: '1.2.0',
    updatedAt: Date.now(),
    install: { repo: 'example/demo' },
  }, { discoveries: [] })
  check('healthScore grade A for a fully healthy skill',
    healthA.grade === 'A' && healthA.score === 100 && healthA.signals.length === 7,
    JSON.stringify({ score: healthA.score, grade: healthA.grade }))
  const healthB = await healthScore({ name: 'demo-b', path: bDir, version: '0.9.0' }, {})
  check('healthScore grade B for a versioned skill without upstream',
    healthB.grade === 'B' && healthB.score === 80, JSON.stringify({ score: healthB.score, grade: healthB.grade }))
  const healthC = await healthScore({ name: 'demo-c', path: cDir }, {})
  check('healthScore grade C for a skill without version',
    healthC.grade === 'C' && healthC.score === 70, JSON.stringify({ score: healthC.score, grade: healthC.grade }))
  const healthD = await healthScore({ name: 'ghost' }, {})
  check('healthScore grade D when SKILL.md is missing',
    healthD.grade === 'D' && healthD.score < 60, JSON.stringify({ score: healthD.score, grade: healthD.grade }))

  /* ── quality: stage / dedupe ──────────────────────────────────────── */
  check('stageOf detects script', stageOf({ name: 'writer', description: '剧本 分集 钩子' }).stage === 'script')
  check('stageOf detects storyboard', stageOf({ name: 'board', description: '分镜 运镜 故事板' }).stage === 'storyboard')
  const otherStage = stageOf({ name: 'plain', description: '' })
  check('stageOf falls back to other', otherStage.stage === 'other' && otherStage.label === '其他')

  const groups = dedupeGroups([
    { name: 'sd-script-engine', description: '甲' },
    { name: 'script', description: '乙' },
    { name: 'alpha-skill', description: '分镜 提示词 资产 一致性' },
    { name: 'beta-skill', description: '分镜 提示词 资产 一致性' },
    { name: 'solo-skill', description: '完全无关的另一套能力' },
  ])
  check('dedupeGroups finds normalized duplicate names',
    groups.some(group => group.key === 'script' && group.names.includes('sd-script-engine') && group.names.includes('script')),
    JSON.stringify(groups))
  check('dedupeGroups finds similar descriptions',
    groups.some(group => group.names.includes('alpha-skill') && group.names.includes('beta-skill') && /描述相似度/.test(group.reason)),
    JSON.stringify(groups))

  /* ── projects: add / bind / summary ───────────────────────────────── */
  const projectDir = join(temp, 'project-demo')
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, 'script-ep01.md'), '# 剧本\n', 'utf8')
  await writeFile(join(projectDir, 'storyboard-ep01.md'), '# 分镜\n', 'utf8')
  await writeFile(join(projectDir, 'todo.txt'), 'notes\n', 'utf8')
  const prjState = {
    skills: {
      'demo-script': { name: 'demo-script', path: scriptDir, version: '1.2.0', updatedAt: Date.now() },
    },
    projects: [],
  }
  const added = addProject(prjState, { name: '测试项目', path: projectDir })
  check('addProject records a project',
    added.ok === true && added.project.name === '测试项目' && added.project.path === resolve(projectDir),
    JSON.stringify(added))
  check('addProject rejects a duplicate path',
    addProject(prjState, { name: '重复项目', path: projectDir }).ok === false)
  check('addProject rejects an empty name', addProject(prjState, { name: '  ', path: projectDir }).ok === false)
  check('listProjects returns the project', listProjects(prjState).length === 1)

  const projectId = added.project.id
  check('bindSkill attaches a skill', bindSkill(prjState, projectId, 'demo-script').ok === true)
  check('bindSkill attaches an unknown skill name', bindSkill(prjState, projectId, 'ghost-skill').ok === true)
  check('bindSkill rejects a double bind', bindSkill(prjState, projectId, 'demo-script').ok === false)

  const summary = await projectSummary({ state: prjState, project: projectId, hubDir })
  check('projectSummary reads the project directory',
    summary.ok === true && summary.exists === true && summary.fileCount === 3,
    JSON.stringify({ ok: summary.ok, exists: summary.exists, fileCount: summary.fileCount }))
  const fileNames = summary.files.map(file => file.name)
  check('projectSummary lists top-level deliverables',
    fileNames.includes('script-ep01.md') && fileNames.includes('storyboard-ep01.md') && fileNames.includes('todo.txt'),
    fileNames.join(','))
  const found = Object.fromEntries(summary.skills.map(skill => [skill.name, skill]))
  check('projectSummary resolves bound skills',
    found['demo-script']?.found === true && found['demo-script']?.stage === 'script' && found['ghost-skill']?.found === false,
    JSON.stringify(summary.skills))
  check('projectSummary warns about missing skills and deliverables',
    summary.warnings.some(text => text.includes('技能未在本机找到')),
    JSON.stringify(summary.warnings))

  const missingProject = addProject(prjState, { name: '不存在项目', path: join(temp, 'no-such-dir') })
  const missingSummary = await projectSummary({ state: prjState, project: missingProject.project.id, hubDir })
  check('projectSummary flags a missing directory',
    missingSummary.ok === false && missingSummary.exists === false
      && missingSummary.warnings.some(text => text.includes('项目目录不存在')),
    JSON.stringify(missingSummary.warnings))

  /* ── snippets ─────────────────────────────────────────────────────── */
  const snipState = {}
  const seeded = ensureDefaultSnippets(snipState)
  check('ensureDefaultSnippets seeds the default snippets',
    seeded.ok === true && seeded.added === 3 && listSnippets(snipState).length === 3,
    JSON.stringify({ added: seeded.added }))
  const reseeded = ensureDefaultSnippets(snipState)
  check('ensureDefaultSnippets is idempotent', reseeded.added === 0 && listSnippets(snipState).length === 3)

  const saved = saveSnippet(snipState, { title: '测试片段', text: '- 规则一：先定锁', tags: '测试, 片段' })
  check('saveSnippet creates a snippet',
    saved.ok === true && saved.created === true && saved.snippet.tags.join(',') === '测试,片段',
    JSON.stringify(saved.snippet))
  const filtered = listSnippets(snipState, '先定锁')
  check('listSnippets filters by text', filtered.length === 1 && filtered[0].id === saved.snippet.id)
  const updated = saveSnippet(snipState, { id: saved.snippet.id, title: '测试片段 2', text: '- 规则二：再出图', tags: ['测试'] })
  check('saveSnippet updates an existing snippet',
    updated.ok === true && updated.created === false && updated.snippet.title === '测试片段 2'
      && listSnippets(snipState).some(item => item.id === saved.snippet.id && item.text.includes('规则二')))
  check('saveSnippet rejects an empty title', saveSnippet(snipState, { title: '', text: 'x' }).ok === false)
  check('saveSnippet rejects an empty body', saveSnippet(snipState, { title: 'x', text: '   ' }).ok === false)
  const removed = removeSnippet(snipState, saved.snippet.id)
  check('removeSnippet deletes the snippet',
    removed.ok === true && listSnippets(snipState).every(item => item.id !== saved.snippet.id)
      && listSnippets(snipState).length === 3)
  check('removeSnippet rejects an unknown id', removeSnippet(snipState, 'sn-missing').ok === false)

  /* ── preview: append / replace ────────────────────────────────────── */
  const original = '---\nname: demo\ndescription: 预览测试\n---\n\n# 原有正文\n'
  const appended = previewEdit({ original, text: '- 新规则：每段 15 秒', mode: 'append', position: 'end' })
  check('previewEdit append produces a diff',
    appended.ok === true && appended.afterChars > appended.beforeChars
      && appended.diff.added >= 1 && appended.diff.text.includes('+ - 新规则：每段 15 秒'),
    JSON.stringify({ before: appended.beforeChars, after: appended.afterChars, added: appended.diff?.added }))
  const topPreview = previewEdit({ original, text: '- 顶部规则', mode: 'append', position: 'top' })
  check('previewEdit append top keeps frontmatter first',
    topPreview.ok === true && topPreview.diff.text.includes('- 顶部规则'))
  const replaced = previewEdit({
    original,
    mode: 'replace',
    text: '---\nname: demo\ndescription: 预览测试\n---\n\n# 重写后的技能\n',
  })
  check('previewEdit replace accepts a valid full file',
    replaced.ok === true && replaced.validation === null && replaced.diff.added >= 1)
  const invalidReplace = previewEdit({ original, mode: 'replace', text: 'no frontmatter' })
  check('previewEdit replace rejects a missing frontmatter',
    invalidReplace.ok === false && typeof invalidReplace.validation === 'string' && invalidReplace.diff === null,
    invalidReplace.validation ?? '')
  const emptyPreview = previewEdit({ original, text: '   ' })
  check('previewEdit rejects empty content', emptyPreview.ok === false && emptyPreview.diff === null)
  const forged = previewEdit({
    original,
    mode: 'append',
    text: '<!-- manju-skill-hub:custom:begin -->\n<!-- manju-skill-hub:custom:end -->',
  })
  check('previewEdit rejects forged managed-block markers', forged.ok === false)

  /* ── sources: three URL families ──────────────────────────────────── */
  const github = parseSource('https://github.com/owner/repo')
  check('parseSource parses a GitHub URL',
    github?.host === 'github' && github.repo === 'owner/repo' && github.slug === 'owner-repo',
    JSON.stringify(github))
  const gitee = parseSource('https://gitee.com/owner/repo.git')
  check('parseSource parses a Gitee URL',
    gitee?.host === 'gitee' && gitee.repo === 'owner/repo', JSON.stringify(gitee))
  const gitlab = parseSource('https://gitlab.com/group/sub/repo/-/tree/main')
  check('parseSource parses a nested GitLab URL',
    gitlab?.host === 'gitlab' && gitlab.repo === 'group/sub/repo', JSON.stringify(gitlab))
  const prefixed = parseSource('gh:owner/repo')
  check('parseSource accepts the gh: prefix',
    prefixed?.host === 'github' && prefixed.repo === 'owner/repo', JSON.stringify(prefixed))
  check('parseSource rejects junk', parseSource('not a repo') === null && parseSource('') === null)
} catch (error) {
  failures += 1
  console.error(`FAIL unexpected error — ${String(error?.stack ?? error)}`)
} finally {
  await rm(temp, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL ROADMAP CHECKS PASSED' : `\n${failures} ROADMAP CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
