/**
 * 漫剧技能中枢 — Client half (plain JS, React from the browser module table).
 *
 * Registers a sidebar panel icon and its `main` page. All data comes from the
 * host routes under /api/manju-skill-hub; the page never derives skill state
 * on its own.
 */
window.__ModuleLoader__.load({
  id: 'manju-skill-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useSyncExternalStore, useRef } = React

    const NS = 'manju-skill-hub'
    const PANEL_ID = 'manju-skill-hub'
    const API_BASE = '/api/manju-skill-hub'

    const zh = {
      nav: '漫剧技能中枢',
      title: '漫剧技能中枢',
      subtitle: '本机漫剧技能全览 · GitHub 开源技能探员 · 每日安装提醒',
      refresh: '刷新本机',
      scan: '扫描 GitHub',
      checkUpdates: '检查更新',
      scanning: '探员正在检索 GitHub…',
      tabSkills: '本机技能',
      tabDiscover: 'GitHub 发现',
      tabAbout: '探员设置',
      searchPlaceholder: '按名称或介绍筛选…',
      showAll: '显示全部技能',
      domainOnly: '只看漫剧相关',
      statDomain: '漫剧技能',
      statPending: '待确认安装',
      statUpdates: '可更新',
      statAgent: '智能体参与更新',
      agentCreated: '智能体创建',
      reminderTitle: '今日提醒',
      reminderBody: '待确认安装 {pending} 个开源技能，可更新 {updates} 个本机技能。',
      reminderNone: '今日暂无新发现；探员会按计划继续巡检。',
      emptySkills: '没有匹配的技能。',
      emptyDiscover: '还没有发现记录，点「扫描 GitHub」让探员出发。',
      version: '版本',
      noVersion: '无版本',
      updatedAt: '最近更新',
      updatedBy: '更新者',
      ownerAgent: '智能体',
      ownerUser: '本人',
      ownerUnknown: '未知',
      source: '来源',
      installedAt: '安装于',
      path: '路径',
      updateAvailable: '上游有更新',
      updateLatest: '已是最新',
      updateUnchecked: '未检查更新',
      updateUnknown: '未关联仓库',
      install: '安装',
      confirmInstall: '确认安装',
      installing: '安装中…',
      ignore: '忽略',
      ignored: '已忽略',
      restore: '恢复',
      openRepo: '打开仓库',
      stars: '星',
      pushedAt: '上游最近提交',
      hits: '命中',
      skillPaths: '可安装技能',
      pendingBadge: '待确认',
      installedHere: '已安装',
      installedCount: '已装 {done}/{total}',
      allInstalled: '全部已安装',
      openDir: '打开目录',
      openMd: '打开 SKILL.md',
      copyPath: '复制路径',
      copied: '已复制',
      openFailed: '打开失败',
      openSkillsRoot: '打开技能目录',
      installedOpen: '打开已装目录',
      updateNow: '更新到最新',
      confirmUpdate: '确认更新（先备份）',
      updating: '更新中…',
      updateDone: '已更新 {name}',
      updateFailed: '更新失败',
      updateAll: '全部更新（{count}）',
      confirmUpdateAll: '确认全部更新（逐个备份）',
      openBackups: '打开备份目录',
      onlyUpdatable: '只看可更新',
      customize: '自定义更新',
      think: '思考模式',
      editorTitle: '自定义更新',
      editorSubtitle: '补充规则或文案后应用；写入前会自动备份整个技能目录。',
      modeAppend: '追加受管小节（推荐）',
      modeReplace: '整篇替换 SKILL.md',
      positionEnd: '放在末尾',
      positionTop: '放在正文开头',
      thinkHintPlaceholder: '可选：告诉模型这次重点想改什么，例如「补上 15 秒分段硬规则」',
      thinkRun: '让模型思考',
      thinking: '模型思考中…',
      thinkDigest: '模型判断',
      apply: '应用（先备份）',
      applying: '写入中…',
      cancel: '取消',
      editDone: '已更新 {name}',
      editFailed: '写入失败',
      thinkFailed: '思考失败',
      replaceWarning: '整篇替换会覆盖 SKILL.md，必须保留 frontmatter 与 name；应用前会先备份。',
      appendHint: '内容会放进「自定义补充（漫剧技能中枢维护）」小节；重复应用会替换该小节，不会越堆越多。',
      tabHistory: '变更历史',
      historyHint: '每次安装 / 更新 / 自定义写入都会留下完整目录备份，可随时回滚。',
      historyEmpty: '还没有变更记录。安装、更新或自定义更新后会出现在这里。',
      historyAll: '全部技能',
      clearFilter: '清除筛选',
      viewDiff: '查看差异',
      rollback: '回滚',
      confirmRollback: '确认回滚（当前版本先备份）',
      rollingBack: '回滚中…',
      rollbackDone: '已回滚 {name}',
      rollbackFailed: '回滚失败',
      diffTitle: '变更差异',
      diffLoading: '读取差异…',
      diffEmpty: '这次变更没有 diff 文件（可能文件过大）。',
      kindInstall: '安装',
      kindUpstream: '上游更新',
      kindCustom: '自定义',
      kindRollback: '回滚',
      byAgent: '智能体',
      byUser: '本人',
      noBackup: '无备份',
      scanDone: '扫描完成',
      updatesDone: '更新检查完成',
      refreshDone: '本机清单已刷新',
      installDone: '已安装 {name}，新会话生效',
      installFailed: '安装失败',
      actionFailed: '操作失败',
      noToken: '未配置 GITHUB_TOKEN，GitHub 每小时限额 60 次；探员会自动限速。',
      tokenOk: '已检测到 GitHub 令牌，探员额度充足。',
      schedule: '探员每天 {time} 自动巡检 GitHub；也可手动触发。',
      lastScan: '上次巡检',
      never: '从未',
      aboutIntro: '「漫剧技能中枢」把所有本机漫剧 skill 收在一页：介绍、版本、最近更新时间、是否可更新，以及由智能体还是本人更新。内置探员会定时去 GitHub 搜索开源短剧 / 漫剧 skill，校验仓库里确实有 SKILL.md 后才列入待安装，并在每天固定时间提醒你确认。',
      aboutHow: '判定规则：仓库名称/简介/话题命中漫剧或制作环节关键词（分镜、剧本、Seedance、提示词…），且仓库内存在 SKILL.md，才会成为候选。安装会下载 GitHub 源码包到本机 skills 目录，同名目录不会被覆盖。',
      aboutAgent: '智能体接入：对话里说「看看漫剧技能中枢」，智能体会调用 manju_skill_hub 读取清单；安装必须由你明确确认后执行。',
      loading: '读取中…',
      loadFailed: '读取失败',
      retry: '重试',
      githubError: 'GitHub 巡检异常',
      selectSkill: '选择要安装的技能',
      noSkillPaths: '该仓库未校验到 SKILL.md',
      // 备份与诊断
      tabSafety: '备份与诊断',
      safetyHint: '备份会在安装、更新、自定义写入、回滚和回收前自动创建；这里可以统计占用、预演清理、立即快照与整库导出/导入。',
      backupCount: '备份数量',
      backupBytes: '备份占用',
      backupBySkill: '按技能分布',
      backupNone: '还没有备份记录。',
      pruneKeep: '每个技能保留',
      pruneDryRun: '预演清理',
      pruneRun: '确认清理',
      pruneConfirm: '确认清理旧备份（保留最近 N 份）？',
      prunePreview: '预演结果',
      pruneResult: '已删除 {removed} 份，释放 {freed}，保留 {kept} 份',
      pruneWould: '将删除 {removed} 份，释放 {freed}，保留 {kept} 份',
      pruneNothing: '没有需要清理的备份。',
      snapshot: '立即快照',
      snapshotDone: '已创建 {count} 份快照',
      exportLib: '导出技能库',
      importLib: '导入技能库',
      dirPlaceholder: '输入目录绝对路径，例如 D:\\backup\\manju',
      confirmExport: '确认把技能库导出到该目录？',
      confirmImport: '确认从该目录导入？（同名技能会跳过，不覆盖）',
      exportDone: '已导出 {skills} 个技能（{bytes}）到 {dir}',
      importDone: '导入 {imported} 个，跳过 {skipped} 个',
      diagnostics: '运行诊断',
      diagTitle: '运行诊断',
      diagnosticsHint: '诊断是只读的，不会修改任何文件。',
      diagSkills: '技能数',
      diagPending: '待装',
      diagUpdates: '可更新',
      diagHistory: '历史',
      diagBackups: '备份',
      diagStateSize: 'state 大小',
      diagScan: '最近扫描',
      diagErrors: '最近错误',
      diagNoErrors: '没有记录错误。',
      diagSkillsRoot: '技能目录',
      exists: '存在',
      missingDir: '缺失',
      mute: '免打扰',
      muteHours: '免打扰小时数',
      muteUntil: '免打扰至',
      muteNone: '未开启',
      muteSet: '已设置免打扰 {hours} 小时',
      muteOff: '已关闭免打扰',
      muteNow: '关闭免打扰',
      refreshPanel: '刷新',
      // 质量 / 阶段
      quality: '健康度',
      qualityTitle: '{grade} · {score} 分',
      stage: '阶段',
      stageScript: '剧本',
      stageStoryboard: '分镜',
      stageAsset: '资产',
      stageFeed: '投喂',
      stageQc: '质检',
      stagePublish: '发布',
      stageOther: '其他',
      missingRefs: '引用缺失 {count}',
      missingRefsTitle: 'SKILL.md 里引用的文件不存在：',
      // pin / 回收
      pin: '置顶',
      unpin: '取消置顶',
      pinnedNote: '已置顶',
      recycle: '回收',
      confirmRecycle: '确认回收（先备份再删除目录）',
      recycling: '回收中…',
      recycled: '已回收 {name}',
      recycleFailed: '回收失败',
      // 收藏与筛选
      favorites: '收藏',
      onlyFavorites: '只看收藏',
      favAdded: '已收藏 {name}',
      favRemoved: '已取消收藏 {name}',
      filterStage: '阶段',
      filterSource: '来源',
      filterUpdate: '更新',
      filterAll: '全部',
      filterAllStage: '全部阶段',
      filterAllSource: '全部来源',
      filterAllUpdate: '全部更新状态',
      updateHas: '有更新',
      updateUpToDate: '已是最新',
      updateNoRepo: '未关联仓库',
      // 编辑器增强
      snippets: '片段',
      snippetInsert: '插入片段',
      snippetNone: '暂无片段',
      snippetPick: '选择片段插入到光标处',
      previewDiff: '预览差异',
      previewing: '生成预览…',
      previewTitle: '变更预览',
      previewFailed: '预览失败',
      validation: '校验',
      validationOk: '校验通过',
      validationFailed: '校验未通过',
      diagnose: '诊断',
      diagnosing: '诊断中…',
      diagnoseHint: '先诊断 → 勾选要修的问题 → 生成；也可跳过诊断直接生成。',
      diagnosisTitle: '问题清单',
      diagnosisEmpty: '模型没有给出问题清单',
      diagnoseFailed: '诊断失败',
      generate: '生成',
      generating: '生成中…',
      selectAll: '全选',
      selectNone: '清空',
      // 项目
      tabProjects: '项目',
      projectTitle: '项目工作台',
      projectHint: '把本机技能绑定到项目目录，随时检查交付物与缺失。',
      projectName: '项目名',
      projectPath: '项目目录',
      projectAdd: '新建项目',
      projectAdded: '已新建项目 {name}',
      projectRemove: '删除项目',
      confirmProjectRemove: '确认删除该项目？（只移除绑定，不删除目录）',
      projectRemoved: '已删除项目 {name}',
      projectOpen: '打开目录',
      projectSummary: '项目体检',
      projectSummaryLoading: '读取项目…',
      projectFiles: '交付物',
      projectWarnings: '警告',
      projectNoFiles: '目录里没有文件',
      projectBind: '绑定技能',
      projectUnbind: '解绑',
      projectBindHint: '选择要绑定到此项目的技能',
      projectEmpty: '还没有项目，先新建一个。',
      projectBadName: '项目名不能为空',
      projectBadPath: '目录路径不能为空',
      projectMissing: '目录不存在',
      projectMissingSkill: '技能未安装',
      projectSkills: '绑定技能',
      // 命令面板
      commandPalette: '命令面板',
      commandPlaceholder: '搜索技能，Enter 打开编辑器',
      commandEmpty: '没有匹配的技能',
      openEditor: '打开编辑器',
      commandHint: 'Ctrl / Cmd + K 打开命令面板',
      close: '关闭',
      optional: '可选',
    }

    const en = {
      nav: 'Manju Skill Hub',
      title: 'Manju Skill Hub',
      subtitle: 'Local manju skills · GitHub scout · daily install reminder',
      refresh: 'Refresh local',
      scan: 'Scan GitHub',
      checkUpdates: 'Check updates',
      scanning: 'Scout is searching GitHub…',
      tabSkills: 'Local skills',
      tabDiscover: 'GitHub discoveries',
      tabAbout: 'Scout settings',
      searchPlaceholder: 'Filter by name or description…',
      showAll: 'Show all skills',
      domainOnly: 'Manju only',
      statDomain: 'Manju skills',
      statPending: 'Pending install',
      statUpdates: 'Updatable',
      statAgent: 'Agent-touched',
      agentCreated: 'Agent-created',
      reminderTitle: 'Today',
      reminderBody: '{pending} open-source skills await your decision; {updates} local skills can be updated.',
      reminderNone: 'No new findings today; the scout keeps its schedule.',
      emptySkills: 'No matching skills.',
      emptyDiscover: 'Nothing discovered yet — run “Scan GitHub”.',
      version: 'Version',
      noVersion: 'no version',
      updatedAt: 'Updated',
      updatedBy: 'Updated by',
      ownerAgent: 'Agent',
      ownerUser: 'You',
      ownerUnknown: 'Unknown',
      source: 'Source',
      installedAt: 'Installed',
      path: 'Path',
      updateAvailable: 'Upstream has updates',
      updateLatest: 'Up to date',
      updateUnchecked: 'Not checked',
      updateUnknown: 'No repo linked',
      install: 'Install',
      confirmInstall: 'Confirm install',
      installing: 'Installing…',
      ignore: 'Ignore',
      ignored: 'Ignored',
      restore: 'Restore',
      openRepo: 'Open repo',
      stars: 'stars',
      pushedAt: 'Last upstream push',
      hits: 'Matched',
      skillPaths: 'Installable skills',
      pendingBadge: 'pending',
      installedHere: 'Installed',
      installedCount: '{done}/{total} installed',
      allInstalled: 'All installed',
      openDir: 'Open folder',
      openMd: 'Open SKILL.md',
      copyPath: 'Copy path',
      copied: 'Copied',
      openFailed: 'Could not open',
      openSkillsRoot: 'Open skills folder',
      installedOpen: 'Open installed folder',
      updateNow: 'Update to latest',
      confirmUpdate: 'Confirm update (backup first)',
      updating: 'Updating…',
      updateDone: 'Updated {name}',
      updateFailed: 'Update failed',
      updateAll: 'Update all ({count})',
      confirmUpdateAll: 'Confirm update all (backup each)',
      openBackups: 'Open backups',
      onlyUpdatable: 'Updatable only',
      customize: 'Custom update',
      think: 'Think mode',
      editorTitle: 'Custom update',
      editorSubtitle: 'Add rules or copy, then apply; the whole skill folder is backed up first.',
      modeAppend: 'Append a managed section (recommended)',
      modeReplace: 'Replace SKILL.md entirely',
      positionEnd: 'At the end',
      positionTop: 'At the top of the body',
      thinkHintPlaceholder: 'Optional: what should the model focus on, e.g. “add hard 15s segment rules”',
      thinkRun: 'Ask the model',
      thinking: 'Model is thinking…',
      thinkDigest: 'Model rationale',
      apply: 'Apply (backup first)',
      applying: 'Writing…',
      cancel: 'Cancel',
      editDone: 'Updated {name}',
      editFailed: 'Write failed',
      thinkFailed: 'Think failed',
      replaceWarning: 'Replacing overwrites SKILL.md — frontmatter and name must stay; a backup is taken first.',
      appendHint: 'Content goes into one managed “自定义补充” section; re-applying replaces it instead of stacking.',
      tabHistory: 'History',
      historyHint: 'Every install / update / custom write keeps a full folder backup you can roll back to.',
      historyEmpty: 'No changes yet. Installs, updates and custom edits appear here.',
      historyAll: 'All skills',
      clearFilter: 'Clear filter',
      viewDiff: 'View diff',
      rollback: 'Roll back',
      confirmRollback: 'Confirm rollback (backup current)',
      rollingBack: 'Rolling back…',
      rollbackDone: 'Rolled back {name}',
      rollbackFailed: 'Rollback failed',
      diffTitle: 'Change diff',
      diffLoading: 'Loading diff…',
      diffEmpty: 'No diff file for this change (file may be too large).',
      kindInstall: 'Install',
      kindUpstream: 'Upstream update',
      kindCustom: 'Custom',
      kindRollback: 'Rollback',
      byAgent: 'Agent',
      byUser: 'You',
      noBackup: 'No backup',
      scanDone: 'Scan complete',
      updatesDone: 'Update check complete',
      refreshDone: 'Local inventory refreshed',
      installDone: 'Installed {name} — takes effect in a new session',
      installFailed: 'Install failed',
      actionFailed: 'Action failed',
      noToken: 'No GITHUB_TOKEN: GitHub allows 60 requests/hour; the scout throttles itself.',
      tokenOk: 'GitHub token detected; the scout has a comfortable quota.',
      schedule: 'The scout checks GitHub daily at {time}; you can also run it manually.',
      lastScan: 'Last scan',
      never: 'never',
      aboutIntro: 'Manju Skill Hub puts every local manju skill on one page: description, version, last update, whether an update is available, and whether an agent or you updated it. A built-in scout searches GitHub for open-source short-drama / manju skills on a schedule, verifies a real SKILL.md, and reminds you daily to decide on installation.',
      aboutHow: 'Admission rule: the repository name/description/topics must match manju or production-stage keywords (storyboard, screenplay, Seedance, prompts…) and the repository must contain a SKILL.md. Installing downloads the GitHub source archive into the local skills directory; an existing directory is never overwritten.',
      aboutAgent: 'Agent access: ask “check the Manju Skill Hub” in chat; the agent calls manju_skill_hub. Installation only runs after you explicitly confirm.',
      loading: 'Loading…',
      loadFailed: 'Load failed',
      retry: 'Retry',
      githubError: 'GitHub scan issue',
      selectSkill: 'Pick the skill to install',
      noSkillPaths: 'No SKILL.md verified in this repo',
      // Backups & diagnostics
      tabSafety: 'Backups & safety',
      safetyHint: 'Backups are created before every install, update, custom write, rollback and recycle. Here you can inspect usage, dry-run a prune, snapshot now, and export/import the whole library.',
      backupCount: 'Backups',
      backupBytes: 'Backup size',
      backupBySkill: 'By skill',
      backupNone: 'No backups yet.',
      pruneKeep: 'Keep per skill',
      pruneDryRun: 'Dry run',
      pruneRun: 'Prune now',
      pruneConfirm: 'Prune old backups (keep the newest N per skill)?',
      prunePreview: 'Dry-run result',
      pruneResult: 'Removed {removed} backups, freed {freed}, kept {kept}',
      pruneWould: 'Would remove {removed} backups, free {freed}, keep {kept}',
      pruneNothing: 'Nothing to prune.',
      snapshot: 'Snapshot now',
      snapshotDone: 'Created {count} snapshots',
      exportLib: 'Export library',
      importLib: 'Import library',
      dirPlaceholder: 'Absolute folder path, e.g. D:\\backup\\manju',
      confirmExport: 'Export the skill library into that folder?',
      confirmImport: 'Import from that folder? (existing skills are skipped, never overwritten)',
      exportDone: 'Exported {skills} skills ({bytes}) to {dir}',
      importDone: 'Imported {imported}, skipped {skipped}',
      diagnostics: 'Run diagnostics',
      diagTitle: 'Diagnostics',
      diagnosticsHint: 'Diagnostics are read-only and never modify files.',
      diagSkills: 'Skills',
      diagPending: 'Pending',
      diagUpdates: 'Updatable',
      diagHistory: 'History',
      diagBackups: 'Backups',
      diagStateSize: 'State size',
      diagScan: 'Last scan',
      diagErrors: 'Recent errors',
      diagNoErrors: 'No recorded errors.',
      diagSkillsRoot: 'Skills folder',
      exists: 'present',
      missingDir: 'missing',
      mute: 'Mute',
      muteHours: 'Mute hours',
      muteUntil: 'Muted until',
      muteNone: 'not muted',
      muteSet: 'Muted for {hours} hours',
      muteOff: 'Mute cleared',
      muteNow: 'Clear mute',
      refreshPanel: 'Refresh',
      quality: 'Health',
      qualityTitle: '{grade} · {score} pts',
      stage: 'Stage',
      stageScript: 'Script',
      stageStoryboard: 'Storyboard',
      stageAsset: 'Assets',
      stageFeed: 'Feed',
      stageQc: 'QC',
      stagePublish: 'Publish',
      stageOther: 'Other',
      missingRefs: '{count} missing refs',
      missingRefsTitle: 'Files referenced by SKILL.md are missing:',
      pin: 'Pin',
      unpin: 'Unpin',
      pinnedNote: 'Pinned',
      recycle: 'Recycle',
      confirmRecycle: 'Confirm recycle (backup, then delete the folder)',
      recycling: 'Recycling…',
      recycled: 'Recycled {name}',
      recycleFailed: 'Recycle failed',
      favorites: 'Favorite',
      onlyFavorites: 'Favorites only',
      favAdded: 'Favorited {name}',
      favRemoved: 'Unfavorited {name}',
      filterStage: 'Stage',
      filterSource: 'Source',
      filterUpdate: 'Update',
      filterAll: 'All',
      filterAllStage: 'All stages',
      filterAllSource: 'All sources',
      filterAllUpdate: 'Any update state',
      updateHas: 'Has update',
      updateUpToDate: 'Up to date',
      updateNoRepo: 'No repo linked',
      snippets: 'Snippets',
      snippetInsert: 'Insert snippet',
      snippetNone: 'No snippets',
      snippetPick: 'Insert a snippet at the caret',
      previewDiff: 'Preview diff',
      previewing: 'Building preview…',
      previewTitle: 'Change preview',
      previewFailed: 'Preview failed',
      validation: 'Validation',
      validationOk: 'Validation passed',
      validationFailed: 'Validation failed',
      diagnose: 'Diagnose',
      diagnosing: 'Diagnosing…',
      diagnoseHint: 'Diagnose → tick the issues to fix → generate. You can still generate directly.',
      diagnosisTitle: 'Issue list',
      diagnosisEmpty: 'The model returned no issues',
      diagnoseFailed: 'Diagnose failed',
      generate: 'Generate',
      generating: 'Generating…',
      selectAll: 'All',
      selectNone: 'None',
      tabProjects: 'Projects',
      projectTitle: 'Project workbench',
      projectHint: 'Bind local skills to project folders and check deliverables at a glance.',
      projectName: 'Project name',
      projectPath: 'Project folder',
      projectAdd: 'New project',
      projectAdded: 'Created project {name}',
      projectRemove: 'Remove project',
      confirmProjectRemove: 'Remove this project? (bindings only, the folder stays)',
      projectRemoved: 'Removed project {name}',
      projectOpen: 'Open folder',
      projectSummary: 'Check project',
      projectSummaryLoading: 'Reading project…',
      projectFiles: 'Deliverables',
      projectWarnings: 'Warnings',
      projectNoFiles: 'No files in this folder',
      projectBind: 'Bind skill',
      projectUnbind: 'Unbind',
      projectBindHint: 'Pick a skill to bind to this project',
      projectEmpty: 'No projects yet — create one first.',
      projectBadName: 'Project name is required',
      projectBadPath: 'Folder path is required',
      projectMissing: 'Folder missing',
      projectMissingSkill: 'Skill not installed',
      projectSkills: 'Bound skills',
      commandPalette: 'Command palette',
      commandPlaceholder: 'Search skills, Enter opens the editor',
      commandEmpty: 'No matching skills',
      openEditor: 'Open editor',
      commandHint: 'Ctrl / Cmd + K opens the command palette',
      close: 'Close',
      optional: 'optional',
    }

    const inject = ['slots', 'locale']

    function apiUrl(path) {
      const relative = path.replace(/^\/+/, '')
      if (typeof document === 'undefined') return `/${relative}`
      return new URL(relative, document.baseURI).pathname
    }

    function createStore() {
      let snapshot = { data: null, error: null, loading: false, loadedAt: 0 }
      let inflight = null
      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }
      const set = next => { snapshot = { ...snapshot, ...next }; emit() }

      const load = async (force = false) => {
        if (inflight !== null) return inflight
        if (!force && snapshot.data !== null && Date.now() - snapshot.loadedAt < 12_000) return snapshot
        inflight = (async () => {
          set({ loading: true })
          try {
            const response = await fetch(apiUrl(`${API_BASE}/overview`), { cache: 'no-store' })
            const data = await response.json()
            set({
              data: response.ok && data?.ok === true ? data : null,
              error: response.ok ? null : (data?.error ?? `HTTP ${response.status}`),
              loading: false,
              loadedAt: Date.now(),
            })
          } catch (error) {
            set({ loading: false, error: String(error?.message ?? error) })
          } finally {
            inflight = null
          }
          return snapshot
        })()
        return inflight
      }

      const action = async (name, payload = {}) => {
        set({ loading: true })
        try {
          const response = await fetch(apiUrl(`${API_BASE}/action`), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: name, ...payload }),
          })
          const body = await response.json()
          if (body?.overview !== undefined) {
            set({ data: body.overview, error: null, loading: false, loadedAt: Date.now() })
          } else {
            await load(true)
          }
          return body
        } catch (error) {
          set({ loading: false, error: String(error?.message ?? error) })
          return { ok: false, error: String(error?.message ?? error) }
        }
      }

      const api = {
        get: () => snapshot,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
        load,
        action,
        fire: async (name, payload = {}) => {
          try {
            const response = await fetch(apiUrl(`${API_BASE}/action`), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: name, ...payload }),
            })
            return await response.json()
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
          }
        },
        getSkill: async name => {
          try {
            const response = await fetch(apiUrl(`${API_BASE}/skill?name=${encodeURIComponent(name)}`), { cache: 'no-store' })
            return await response.json()
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
          }
        },
        getHistory: async name => {
          try {
            const query = name ? `?name=${encodeURIComponent(name)}` : ''
            const response = await fetch(apiUrl(`${API_BASE}/history${query}`), { cache: 'no-store' })
            return await response.json()
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
          }
        },
        getDiff: async id => {
          try {
            const response = await fetch(apiUrl(`${API_BASE}/diff?id=${encodeURIComponent(id)}`), { cache: 'no-store' })
            return await response.json()
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
          }
        },
        /**
         * Generic read-only GET. A route the host does not serve yet (404, HTML
         * error page, network failure) resolves to {ok:false} so the page can
         * degrade instead of crashing.
         */
        getJson: async path => {
          try {
            const response = await fetch(apiUrl(`${API_BASE}${path}`), { cache: 'no-store' })
            let body = null
            try { body = await response.json() } catch { body = null }
            if (body === null || typeof body !== 'object') return { ok: false, error: `HTTP ${response.status}` }
            return body
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
          }
        },
        getSafety: () => api.getJson('/safety'),
        getDiagnostics: () => api.getJson('/diagnostics'),
        getQuality: () => api.getJson('/quality'),
        getSnippets: () => api.getJson('/snippets'),
        getProjects: () => api.getJson('/projects'),
        getProjectSummary: name => api.getJson(`/projects/summary?name=${encodeURIComponent(name)}`),
        getUi: () => api.getJson('/ui'),
        patch: set,
      }
      return api
    }

    const store = createStore()

    function useStore() {
      return useSyncExternalStore(store.subscribe, store.get)
    }

    function useLocaleTick(locale) {
      const [, force] = useState(0)
      useEffect(() => {
        if (locale === undefined || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => force(value => value + 1))
      }, [locale])
    }

    function fmtTime(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
      return new Date(ms).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    function fmtRelative(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
      const diff = Date.now() - ms
      if (diff < 60_000) return '刚刚'
      if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
      if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`
      return `${Math.floor(diff / 86_400_000)} 天前`
    }

    function skillNameFromPath(path) {
      const clean = String(path ?? '').replace(/\/SKILL\.md$/i, '')
      return clean.split('/').pop() ?? ''
    }

    function shortPath(path) {
      if (typeof path !== 'string' || path.length === 0) return ''
      return path.replace(/\\/g, '/')
    }

    function fmtBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${Math.round(value)} B`
      const units = ['KB', 'MB', 'GB', 'TB']
      let size = value / 1024
      let index = 0
      while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
      return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
    }

    const STAGE_KEYS = {
      script: 'stageScript',
      storyboard: 'stageStoryboard',
      asset: 'stageAsset',
      feed: 'stageFeed',
      qc: 'stageQc',
      publish: 'stagePublish',
      other: 'stageOther',
    }

    function stageLabel(t, stage) {
      const key = STAGE_KEYS[stage]
      return key ? t(key) : (typeof stage === 'string' && stage.length > 0 ? stage : t('stageOther'))
    }

    /** Response envelopes are tolerated: `{items}` / `{skills}` / map / bare array. */
    function firstArray(source, keys) {
      if (Array.isArray(source)) return source
      if (source === null || typeof source !== 'object') return []
      for (const key of keys) {
        if (Array.isArray(source[key])) return source[key]
      }
      return []
    }

    function unwrapSection(body, key) {
      if (body === null || typeof body !== 'object') return null
      const section = body[key]
      if (section !== null && typeof section === 'object' && Array.isArray(section) === false) return section
      return body
    }

    /** Normalize GET /quality into a name → {score,grade,stage,missing,signals} map. */
    function normalizeQuality(body) {
      const map = new Map()
      const section = unwrapSection(body, 'quality')
      const list = firstArray(section ?? {}, ['items', 'skills', 'quality'])
      if (list.length > 0) {
        for (const entry of list) {
          if (entry === null || typeof entry !== 'object') continue
          const name = typeof entry.name === 'string' ? entry.name : entry.skill
          if (typeof name !== 'string' || name.length === 0) continue
          map.set(name, entry)
        }
        return map
      }
      const source = (section?.quality !== null && typeof section?.quality === 'object' && Array.isArray(section.quality) === false)
        ? section.quality
        : (body?.quality !== null && typeof body?.quality === 'object' && Array.isArray(body.quality) === false ? body.quality : null)
      if (source !== null) {
        for (const [name, entry] of Object.entries(source)) {
          if (entry !== null && typeof entry === 'object') map.set(name, { name, ...entry })
        }
      }
      return map
    }

    /** Normalize GET /safety. */
    function normalizeSafety(body) {
      const section = unwrapSection(body, 'safety') ?? unwrapSection(body, 'backups') ?? body ?? {}
      return {
        count: Number(section.count ?? section.backups ?? 0) || 0,
        totalBytes: Number(section.totalBytes ?? section.bytes ?? 0) || 0,
        bySkill: firstArray(section.bySkill ?? section.items ?? section, ['bySkill', 'items', 'skills']).filter(item => item !== null && typeof item === 'object'),
      }
    }

    /** Normalize GET /diagnostics. */
    function normalizeDiagnostics(body) {
      const section = unwrapSection(body, 'diagnostics') ?? body ?? {}
      const ui = (body?.ui !== null && typeof body?.ui === 'object')
        ? body.ui
        : (section.ui !== null && typeof section.ui === 'object' ? section.ui : null)
      return {
        skills: Number(section.skills ?? section.skillCount ?? section.total ?? 0) || 0,
        domain: Number(section.domain ?? 0) || 0,
        pending: Number(section.pending ?? 0) || 0,
        updates: Number(section.updates ?? 0) || 0,
        history: Number(section.history ?? section.historyCount ?? 0) || 0,
        backups: Number(section.backups ?? section.backupCount ?? 0) || 0,
        backupBytes: Number(section.backupBytes ?? section.backupTotalBytes ?? 0) || 0,
        stateBytes: Number(section.stateBytes ?? section.stateSize ?? 0) || 0,
        skillsRootExists: section.skillsRootExists !== false && section.skillsRootExists !== undefined ? section.skillsRootExists === true : true,
        lastLocalScanAt: Number(section.lastLocalScanAt ?? 0) || 0,
        recentErrors: firstArray(section.recentErrors ?? body, ['recentErrors', 'errors']),
        muteUntil: Number(section.muteUntil ?? section.mute?.until ?? 0) || 0,
        ui,
        pins: (body?.pins !== null && typeof body?.pins === 'object') ? body.pins : (section.pins !== null && typeof section.pins === 'object' ? section.pins : null),
      }
    }

    function missingCount(value) {
      if (Array.isArray(value)) return value.length
      if (typeof value === 'number' && Number.isFinite(value)) return value
      return 0
    }

    function favoritesOf(ui) {
      if (ui === null || typeof ui !== 'object') return []
      return firstArray(ui, ['favorites']).filter(name => typeof name === 'string')
    }

    function errorText(entry) {
      if (typeof entry === 'string') return entry
      if (entry === null || typeof entry !== 'object') return ''
      return String(entry.message ?? entry.error ?? entry.reason ?? '')
    }

    function severityTone(severity) {
      const value = String(severity ?? '').toLowerCase()
      if (value === 'blocker' || value === 'critical' || value === 'high' || value === 'error') return 'error'
      if (value === 'medium' || value === 'warn' || value === 'warning') return 'warn'
      return 'muted'
    }

    /** Flatten a preview `validation` payload into renderable lines. */
    function validationLines(value) {
      if (value === null || value === undefined) return []
      if (typeof value === 'string') return value.trim().length > 0 ? [{ tone: 'error', text: value }] : []
      if (Array.isArray(value)) return value.flatMap(validationLines)
      if (typeof value !== 'object') return [{ tone: 'error', text: String(value) }]
      const out = []
      for (const key of ['errors', 'messages', 'problems', 'warnings']) {
        const list = Array.isArray(value[key]) ? value[key] : []
        for (const item of list) {
          const text = typeof item === 'string' ? item : errorText(item)
          if (text.trim().length > 0) out.push({ tone: key === 'warnings' ? 'warn' : 'error', text })
        }
      }
      if (out.length > 0) return out
      const message = errorText(value)
      if (message.trim().length > 0) return [{ tone: 'error', text: message }]
      return []
    }

    function Badge({ children, tone }) {
      return h('span', { className: `msh-chip${tone ? ` msh-chip-${tone}` : ''}` }, children)
    }

    function Stat({ label, value, tone }) {
      return h('div', { className: 'msh-stat' },
        h('div', { className: `msh-stat-value${tone ? ` msh-stat-${tone}` : ''}` }, String(value)),
        h('div', { className: 'msh-stat-label' }, label),
      )
    }

    /** Health badge: grade + score, with every signal listed in the tooltip. */
    function QualityBadge({ quality, t }) {
      if (quality === null || quality === undefined) return null
      const grade = typeof quality.grade === 'string' && quality.grade.length > 0 ? quality.grade.toUpperCase() : ''
      const score = Number(quality.score)
      const tone = grade === 'A' ? 'ok' : grade === 'B' ? 'accent' : grade === 'C' ? 'warn' : grade === 'D' ? 'error' : 'muted'
      const signals = firstArray(quality, ['signals']).filter(item => item !== null && typeof item === 'object')
      const title = [
        Number.isFinite(score) ? t('qualityTitle').replace('{grade}', grade || '?').replace('{score}', String(Math.round(score))) : t('quality'),
        ...signals.map(signal => `${signal.ok === false ? '✕' : '✓'} ${String(signal.label ?? signal.id ?? '')}${typeof signal.weight === 'number' ? ` (${signal.weight})` : ''}`),
      ].filter(Boolean).join('\n')
      const label = grade.length > 0
        ? `${t('quality')} ${grade}${Number.isFinite(score) ? ` · ${Math.round(score)}` : ''}`
        : `${t('quality')} ${Number.isFinite(score) ? Math.round(score) : '—'}`
      return h('span', { className: `msh-chip msh-chip-${tone} msh-quality`, title }, label)
    }

    function HubIcon({ size = 16 }) {
      const snapshot = useStore()
      useEffect(() => {
        void store.load(false)
        const timer = window.setInterval(() => { void store.load(true) }, 60_000)
        return () => window.clearInterval(timer)
      }, [])
      const pending = snapshot.data?.stats?.pending ?? 0
      return h('span', { className: 'msh-icon-wrap', style: { width: size, height: size } },
        h('svg', {
          viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          h('rect', { x: 2.6, y: 5.4, width: 12.8, height: 9.4, rx: 2 }),
          h('path', { d: 'M2.6 8.6h12.8M6.2 5.4v3.2M11.2 5.4v3.2' }),
          h('path', { d: 'M6.6 11.2l3.2 1.5-3.2 1.5z', fill: 'currentColor', stroke: 'none' }),
          h('path', { d: 'M16.4 12.2l4.8 1.4-3.6 2.6-1.2-2' }),
          h('circle', { cx: 19.4, cy: 19.2, r: 1.6, fill: 'currentColor', stroke: 'none' }),
        ),
        pending > 0 ? h('span', { className: 'msh-icon-badge' }, pending > 99 ? '99+' : String(pending)) : null,
      )
    }

    function StatusPill({ skill, t }) {
      if (skill.update?.available === true) {
        return h(Badge, { tone: 'warn' }, `${t('updateAvailable')}${skill.update.repo ? ` · ${skill.update.repo}` : ''}`)
      }
      if (typeof skill.update?.repo === 'string' && skill.update.repo.length > 0) {
        return h(Badge, { tone: 'ok' }, t('updateLatest'))
      }
      if (skill.update !== null && skill.update !== undefined) return h(Badge, { tone: 'muted' }, t('updateUnknown'))
      return h(Badge, { tone: 'muted' }, t('updateUnchecked'))
    }

    function OwnerPill({ skill, t }) {
      const tone = skill.updatedBy === 'agent' ? 'agent' : skill.updatedBy === 'user' ? 'user' : 'muted'
      const label = skill.updatedBy === 'agent' ? t('ownerAgent') : skill.updatedBy === 'user' ? t('ownerUser') : t('ownerUnknown')
      return h(Badge, { tone }, label)
    }

    function SkillRow({ skill, t, quality, pinned, favorite, onOpen, onUpdate, onEdit, onThink, onHistory, onPin, onFavorite, onRecycle, busy }) {
      const sourceLabel = skill.source === 'bundled' ? 'bundled' : (skill.source || 'user')
      const [copied, setCopied] = useState(false)
      const [confirmingUpdate, setConfirmingUpdate] = useState(false)
      const [confirmingRecycle, setConfirmingRecycle] = useState(false)
      useEffect(() => {
        if (!confirmingUpdate) return undefined
        const timer = window.setTimeout(() => setConfirmingUpdate(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingUpdate])
      useEffect(() => {
        if (!confirmingRecycle) return undefined
        const timer = window.setTimeout(() => setConfirmingRecycle(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingRecycle])
      const copyPath = () => {
        if (!skill.path) return
        void navigator.clipboard?.writeText(skill.path)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }
      const missing = missingCount(quality?.missing)
      const stage = typeof quality?.stage === 'string'
        ? quality.stage
        : (typeof skill.stage === 'string' ? skill.stage : '')
      const stageText = typeof quality?.stageLabel === 'string' && quality.stageLabel.length > 0
        ? quality.stageLabel
        : stageLabel(t, stage)
      return h('article', { className: `msh-row${pinned ? ' msh-row-pinned' : ''}` },
        h('div', { className: 'msh-row-head' },
          h('button', {
            type: 'button',
            className: `msh-star${pinned ? ' msh-star-on' : ''}`,
            title: pinned ? t('unpin') : t('pin'),
            'aria-label': pinned ? t('unpin') : t('pin'),
            disabled: busy === true,
            onClick: () => onPin?.(skill, !pinned),
          }, pinned ? '★' : '☆'),
          h('code', { className: 'msh-name' }, skill.name),
          skill.version ? h(Badge, { tone: 'muted' }, `v${skill.version}`) : h(Badge, { tone: 'muted' }, t('noVersion')),
          h(QualityBadge, { quality, t }),
          stage.length > 0 ? h(Badge, { tone: 'muted' }, `${t('stage')} · ${stageText}`) : null,
          missing > 0
            ? h('span', {
              className: 'msh-chip msh-chip-error',
              title: `${t('missingRefsTitle')}\n${firstArray(quality, ['missing']).filter(item => typeof item === 'string').join('\n')}`,
            }, '⚠ ' + t('missingRefs').replace('{count}', String(missing)))
            : null,
          skill.agentCreated ? h(Badge, { tone: 'agent' }, t('agentCreated')) : null,
          h(StatusPill, { skill, t }),
        ),
        h('p', { className: 'msh-desc' }, skill.description || t('emptySkills')),
        h('div', { className: 'msh-meta' },
          h('span', null, `${t('updatedAt')} ${fmtTime(skill.updatedAt)}`),
          h('span', null, `${t('updatedBy')} `, h('b', null, skill.updatedBy === 'agent' ? t('ownerAgent') : skill.updatedBy === 'user' ? t('ownerUser') : t('ownerUnknown'))),
          h('span', null, `${t('source')} ${sourceLabel}`),
          skill.install?.repo ? h('span', null, `↔ ${skill.install.repo}`) : null,
          skill.path ? h('span', { className: 'msh-path', title: skill.path }, shortPath(skill.path)) : null,
        ),
        h('div', { className: 'msh-tags' },
          (skill.tags ?? []).slice(0, 8).map(tag => h(Badge, { key: tag, tone: 'muted' }, tag)),
        ),
        h('div', { className: 'msh-row-actions' },
          h('button', {
            type: 'button',
            className: `msh-btn msh-btn-ghost msh-btn-sm${favorite ? ' msh-btn-fav' : ''}`,
            disabled: busy === true,
            onClick: () => onFavorite?.(skill.name, !favorite),
          }, favorite ? `★ ${t('favorites')}` : `☆ ${t('favorites')}`),
          skill.update?.available === true
            ? h('button', {
              type: 'button',
              className: `msh-btn${confirmingUpdate ? ' msh-btn-primary' : ''} msh-btn-sm`,
              disabled: busy === true,
              onClick: () => {
                if (!confirmingUpdate) { setConfirmingUpdate(true); return }
                setConfirmingUpdate(false)
                onUpdate?.(skill.name)
              },
            }, confirmingUpdate ? t('confirmUpdate') : t('updateNow'))
            : null,
          skill.hasSkillFile
            ? h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
              onClick: () => onEdit?.(skill),
            }, t('customize'))
            : null,
          skill.hasSkillFile
            ? h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
              onClick: () => onThink?.(skill),
            }, t('think'))
            : null,
          h('button', {
            type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
            onClick: () => onHistory?.(skill.name),
          }, t('tabHistory')),
          skill.path
            ? h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
              onClick: () => onOpen?.(skill.name, 'dir'),
            }, t('openDir'))
            : null,
          skill.hasSkillFile
            ? h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
              onClick: () => onOpen?.(skill.name, 'file'),
            }, t('openMd'))
            : null,
          skill.path
            ? h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: copyPath }, copied ? t('copied') : t('copyPath'))
            : null,
          skill.path
            ? h('button', {
              type: 'button',
              className: `msh-btn msh-btn-ghost msh-btn-sm msh-btn-danger${confirmingRecycle ? ' msh-btn-primary' : ''}`,
              disabled: busy === true,
              onClick: () => {
                if (!confirmingRecycle) { setConfirmingRecycle(true); return }
                setConfirmingRecycle(false)
                onRecycle?.(skill.name)
              },
            }, confirmingRecycle ? t('confirmRecycle') : t('recycle'))
            : null,
        ),
      )
    }

    function DiscoveryRow({ item, t, busy, onInstall, onIgnore, onOpen }) {
      const allPaths = item.skillPaths ?? []
      const paths = Array.isArray(item.availablePaths) ? item.availablePaths : allPaths
      const installedPaths = Array.isArray(item.installedPaths) ? item.installedPaths : []
      const [selected, setSelected] = useState(paths[0] ?? '')
      const [confirming, setConfirming] = useState(false)
      useEffect(() => {
        if (!confirming) return undefined
        const timer = window.setTimeout(() => setConfirming(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirming])
      const ignored = item.status === 'ignored'
      const allInstalled = paths.length === 0
      return h('article', { className: `msh-row msh-discovery${ignored ? ' msh-row-dim' : ''}` },
        h('div', { className: 'msh-row-head' },
          h('a', { className: 'msh-repo', href: item.htmlUrl, target: '_blank', rel: 'noreferrer noopener' }, item.repo),
          h(Badge, { tone: 'muted' }, `★ ${item.stars}`),
          item.status === 'installed' || allInstalled ? h(Badge, { tone: 'ok' }, t('allInstalled')) : null,
          installedPaths.length > 0 && !allInstalled
            ? h(Badge, { tone: 'ok' }, t('installedCount').replace('{done}', String(installedPaths.length)).replace('{total}', String(allPaths.length)))
            : null,
          ignored ? h(Badge, { tone: 'muted' }, t('ignored')) : null,
        ),
        h('p', { className: 'msh-desc' }, item.description || '—'),
        h('div', { className: 'msh-meta' },
          h('span', null, `${t('pushedAt')} ${fmtTime(item.pushedAt)}`),
          h('span', null, `${t('lastScan')} ${fmtTime(item.lastSeenAt)}`),
          item.license ? h('span', null, item.license) : null,
          h('span', null, `${t('skillPaths')} ${paths.length}`),
        ),
        h('div', { className: 'msh-tags' },
          (item.hits ?? []).slice(0, 8).map(hit => h(Badge, { key: hit, tone: 'accent' }, hit)),
        ),
        paths.length > 1
          ? h('div', { className: 'msh-select-line' },
            h('span', null, t('selectSkill')),
            h('select', {
              className: 'msh-select',
              value: selected,
              onChange: event => setSelected(event.target.value),
              disabled: busy,
            }, paths.map(path => h('option', { key: path, value: path }, path.replace(/\/SKILL\.md$/i, '')))),
          )
          : null,
        allPaths.length === 0 ? h('p', { className: 'msh-warn' }, t('noSkillPaths')) : null,
        h('div', { className: 'msh-row-actions' },
          !ignored && !allInstalled
            ? h('button', {
              type: 'button',
              className: `msh-btn${confirming ? ' msh-btn-primary' : ''}`,
              disabled: busy || paths.length === 0,
              onClick: () => {
                if (!confirming) { setConfirming(true); return }
                setConfirming(false)
                onInstall(item, selected || paths[0])
              },
            }, busy ? t('installing') : confirming ? `${t('confirmInstall')} · ${skillNameFromPath(selected || paths[0])}` : t('install'))
            : null,
          ignored
            ? h('button', { type: 'button', className: 'msh-btn', disabled: busy, onClick: () => onIgnore(item, 'unignore') }, t('restore'))
            : h('button', { type: 'button', className: 'msh-btn msh-btn-ghost', disabled: busy, onClick: () => onIgnore(item, 'ignore') }, t('ignore')),
          installedPaths.length > 0
            ? h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost',
              onClick: () => onOpen?.(skillNameFromPath(installedPaths[0]), 'dir'),
            }, t('installedOpen'))
            : null,
          h('a', { className: 'msh-btn msh-btn-ghost', href: item.htmlUrl, target: '_blank', rel: 'noreferrer noopener' }, `${t('openRepo')} ↗`),
        ),
      )
    }

    function EditorModal({ editor, t, snippets, onChange, onClose, onDiagnose, onGenerate, onPreview, onApply, onMode, onDiagnosisToggle, onDiagnosisAll }) {
      const textareaRef = useRef(null)
      useEffect(() => {
        const onKey = event => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      const insertSnippet = id => {
        const snippet = firstArray(snippets, ['items', 'snippets']).find(item => item?.id === id)
        if (snippet === undefined || typeof snippet.text !== 'string') return
        const area = textareaRef.current
        const current = typeof editor.text === 'string' ? editor.text : ''
        const start = area !== null && typeof area.selectionStart === 'number' ? area.selectionStart : current.length
        const end = area !== null && typeof area.selectionEnd === 'number' ? area.selectionEnd : current.length
        const piece = `${start > 0 && current[start - 1] !== '\n' ? '\n\n' : ''}${snippet.text}${end < current.length && current[end] !== '\n' ? '\n\n' : ''}`
        const next = `${current.slice(0, start)}${piece}${current.slice(end)}`
        onChange({ text: next })
        const caret = start + piece.length
        window.setTimeout(() => {
          const box = textareaRef.current
          if (box === null) return
          box.focus()
          try { box.setSelectionRange(caret, caret) } catch { /* caret is cosmetic */ }
        }, 0)
      }
      const snippetList = firstArray(snippets, ['items', 'snippets'])
      const diagnosis = firstArray(editor, ['diagnosis'])
      const selected = Array.isArray(editor.selectedDiagnosis) ? editor.selectedDiagnosis : []
      const validation = validationLines(editor.validation)
      return h('div', {
        className: 'msh-modal-backdrop',
        onClick: event => { if (event.target === event.currentTarget) onClose() },
      },
        h('div', { className: 'msh-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('editorTitle') },
          h('div', { className: 'msh-modal-head' },
            h('strong', null, `${t('editorTitle')} · ${editor.name}`),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onClose }, t('cancel')),
          ),
          h('p', { className: 'msh-modal-sub' }, t('editorSubtitle')),
          h('div', { className: 'msh-modal-row' },
            h('label', { className: 'msh-check' },
              h('input', { type: 'radio', checked: editor.mode === 'append', onChange: () => onMode('append') }),
              t('modeAppend'),
            ),
            h('label', { className: 'msh-check' },
              h('input', { type: 'radio', checked: editor.mode === 'replace', onChange: () => onMode('replace') }),
              t('modeReplace'),
            ),
            editor.mode === 'append'
              ? h('select', {
                className: 'msh-select', value: editor.position,
                onChange: event => onChange({ position: event.target.value }),
              },
                h('option', { value: 'end' }, t('positionEnd')),
                h('option', { value: 'top' }, t('positionTop')),
              )
              : null,
          ),
          editor.mode === 'replace'
            ? h('p', { className: 'msh-warn' }, t('replaceWarning'))
            : h('p', { className: 'msh-note' }, t('appendHint')),
          editor.digest
            ? h('div', { className: 'msh-digest' },
              h('b', null, t('thinkDigest')),
              h('span', null, editor.digest),
            )
            : null,
          h('div', { className: 'msh-modal-row' },
            h('span', { className: 'msh-note-inline' }, t('snippets')),
            snippetList.length === 0
              ? h('span', { className: 'msh-note-inline' }, t('snippetNone'))
              : h('select', {
                className: 'msh-select msh-snippet-select',
                value: '',
                onChange: event => { if (event.target.value !== '') insertSnippet(event.target.value) },
                title: t('snippetPick'),
              },
                h('option', { value: '' }, t('snippetPick')),
                snippetList.map(item => h('option', { key: item.id ?? item.title, value: item.id ?? '' }, item.title ?? item.id ?? '')),
              ),
          ),
          h('textarea', {
            className: 'msh-textarea',
            ref: textareaRef,
            value: editor.text,
            spellCheck: false,
            placeholder: editor.mode === 'replace' ? '---\nname: ...\n---\n...' : '把要补充的规则 / 文案粘贴到这里…',
            onChange: event => onChange({ text: event.target.value }),
          }),
          validation.length > 0
            ? h('div', { className: 'msh-validation' },
              h('b', null, t('validation')),
              validation.map((line, index) => h('span', { key: `${index}:${line.text}`, className: line.tone === 'warn' ? 'msh-validation-warn' : 'msh-validation-error' }, line.text)),
            )
            : null,
          diagnosis.length > 0
            ? h('div', { className: 'msh-diagnosis' },
              h('div', { className: 'msh-diagnosis-head' },
                h('b', null, t('diagnosisTitle')),
                h('button', {
                  type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
                  onClick: () => onDiagnosisAll(true),
                }, t('selectAll')),
                h('button', {
                  type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
                  onClick: () => onDiagnosisAll(false),
                }, t('selectNone')),
              ),
              diagnosis.map((item, index) => h('label', { key: `${index}:${item.issue ?? ''}`, className: 'msh-diagnosis-item' },
                h('input', {
                  type: 'checkbox',
                  checked: selected.includes(index),
                  onChange: () => onDiagnosisToggle(index),
                }),
                h('span', { className: `msh-chip msh-chip-${severityTone(item.severity)}` }, String(item.severity ?? 'issue')),
                h('span', { className: 'msh-diagnosis-issue' }, String(item.issue ?? '')),
                item.why ? h('span', { className: 'msh-diagnosis-why' }, String(item.why)) : null,
                item.fix ? h('span', { className: 'msh-diagnosis-fix' }, `→ ${String(item.fix)}`) : null,
              )),
            )
            : null,
          h('p', { className: 'msh-note' }, t('diagnoseHint')),
          h('div', { className: 'msh-modal-row' },
            h('input', {
              className: 'msh-search msh-hint',
              value: editor.hint,
              placeholder: t('thinkHintPlaceholder'),
              onChange: event => onChange({ hint: event.target.value }),
            }),
            h('button', {
              type: 'button', className: 'msh-btn',
              disabled: editor.diagnosing || editor.thinking || editor.applying,
              onClick: onDiagnose,
            }, editor.diagnosing ? t('diagnosing') : t('diagnose')),
            h('button', {
              type: 'button', className: 'msh-btn',
              disabled: editor.diagnosing || editor.thinking || editor.applying,
              onClick: onGenerate,
            }, editor.thinking ? t('generating') : t('generate')),
          ),
          h('div', { className: 'msh-modal-actions' },
            h('button', {
              type: 'button', className: 'msh-btn msh-btn-ghost',
              disabled: editor.previewing || editor.applying || editor.thinking || editor.text.trim().length === 0,
              onClick: onPreview,
            }, editor.previewing ? t('previewing') : t('previewDiff')),
            h('button', {
              type: 'button', className: 'msh-btn msh-btn-primary',
              disabled: editor.applying || editor.thinking || editor.text.trim().length === 0,
              onClick: onApply,
            }, editor.applying ? t('applying') : t('apply')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost', onClick: onClose }, t('cancel')),
          ),
        ),
      )
    }

    function DiffModal({ view, t, onClose }) {
      useEffect(() => {
        const onKey = event => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', {
        className: 'msh-modal-backdrop',
        onClick: event => { if (event.target === event.currentTarget) onClose() },
      },
        h('div', { className: 'msh-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('diffTitle') },
          h('div', { className: 'msh-modal-head' },
            h('strong', null, `${t('diffTitle')} · ${view.id}`),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onClose }, t('cancel')),
          ),
          view.loading
            ? h('div', { className: 'msh-empty' }, t('diffLoading'))
            : h('pre', { className: 'msh-diff' }, view.text || t('diffEmpty')),
        ),
      )
    }

    function SafetyPanel({ t, safety, diagnostics, diagnosticsError, onAction, onRefresh }) {
      const [keep, setKeep] = useState(5)
      const [pruneView, setPruneView] = useState(null)
      const [confirmingPrune, setConfirmingPrune] = useState(false)
      const [snapshotBusy, setSnapshotBusy] = useState(false)
      const [exportDir, setExportDir] = useState('')
      const [importDir, setImportDir] = useState('')
      const [confirmingExport, setConfirmingExport] = useState(false)
      const [confirmingImport, setConfirmingImport] = useState(false)
      const [muteHours, setMuteHours] = useState(12)
      const [mirror, setMirror] = useState({ safety: null, diagnostics: null })

      useEffect(() => {
        if (!confirmingPrune) return undefined
        const timer = window.setTimeout(() => setConfirmingPrune(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingPrune])
      useEffect(() => {
        if (!confirmingExport) return undefined
        const timer = window.setTimeout(() => setConfirmingExport(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingExport])
      useEffect(() => {
        if (!confirmingImport) return undefined
        const timer = window.setTimeout(() => setConfirmingImport(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingImport])
      // Keep the last good snapshot visible while a refresh is in flight.
      useEffect(() => {
        if (safety !== null && safety !== undefined) setMirror(current => ({ ...current, safety }))
      }, [safety])
      useEffect(() => {
        if (diagnostics !== null && diagnostics !== undefined) setMirror(current => ({ ...current, diagnostics }))
      }, [diagnostics])

      const safe = safety ?? mirror.safety
      const diag = diagnostics ?? mirror.diagnostics
      const backupCount = safe?.count ?? diag?.backups ?? 0
      const backupBytes = safe?.totalBytes ?? diag?.backupBytes ?? 0
      const bySkill = firstArray(safe, ['bySkill'])
      const errors = firstArray(diag, ['recentErrors']).map(errorText).filter(text => text.length > 0)

      const runPrune = async dryRun => {
        if (!dryRun) {
          if (!confirmingPrune) { setConfirmingPrune(true); return }
          setConfirmingPrune(false)
        }
        const result = await onAction('prune_backups', { keepPerSkill: keep, dryRun })
        if (result?.ok === true) {
          setPruneView({
            dryRun,
            removed: firstArray(result, ['removed']).length,
            freedBytes: Number(result.freedBytes ?? 0) || 0,
            kept: result.kept ?? '—',
          })
          if (!dryRun) onRefresh()
        }
      }
      const runSnapshot = async () => {
        setSnapshotBusy(true)
        try {
          const result = await onAction('snapshot', {})
          if (result?.ok === true) onRefresh()
        } finally {
          setSnapshotBusy(false)
        }
      }
      const runExport = async () => {
        if (exportDir.trim().length === 0) return
        if (!confirmingExport) { setConfirmingExport(true); return }
        setConfirmingExport(false)
        const result = await onAction('export', { dir: exportDir.trim() })
        if (result?.ok === true) onRefresh()
      }
      const runImport = async () => {
        if (importDir.trim().length === 0) return
        if (!confirmingImport) { setConfirmingImport(true); return }
        setConfirmingImport(false)
        const result = await onAction('import', { dir: importDir.trim(), confirm: true })
        if (result?.ok === true) onRefresh()
      }
      const setMute = async hours => {
        const result = await onAction('mute', { hours })
        if (result?.ok === true) onRefresh()
      }
      const muteUntil = Number(diag?.muteUntil ?? 0) || 0

      return h('div', { className: 'msh-panels' },
        h('p', { className: 'msh-note' }, t('safetyHint')),
        h('div', { className: 'msh-stats msh-stats-3' },
          h(Stat, { label: t('backupCount'), value: backupCount }),
          h(Stat, { label: t('backupBytes'), value: fmtBytes(backupBytes) }),
          h(Stat, { label: t('diagStateSize'), value: fmtBytes(diag?.stateBytes ?? 0) }),
        ),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' },
            h('strong', null, t('backupBySkill')),
            h('div', { className: 'msh-panel-actions' },
              h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onRefresh }, t('refreshPanel')),
              h('button', { type: 'button', className: 'msh-btn msh-btn-sm', disabled: snapshotBusy, onClick: runSnapshot }, snapshotBusy ? t('loading') : t('snapshot')),
            ),
          ),
          bySkill.length === 0
            ? h('div', { className: 'msh-empty msh-empty-sm' }, t('backupNone'))
            : h('div', { className: 'msh-bars' },
              bySkill.slice(0, 24).map(item => {
                const bytes = Number(item.bytes ?? item.totalBytes ?? 0) || 0
                const max = Math.max(...bySkill.map(entry => Number(entry.bytes ?? entry.totalBytes ?? 0) || 0), 1)
                return h('div', { key: String(item.name ?? ''), className: 'msh-bar-row' },
                  h('code', { className: 'msh-bar-name', title: String(item.name ?? '') }, String(item.name ?? '—')),
                  h('span', { className: 'msh-bar-track' },
                    h('span', { className: 'msh-bar-fill', style: { width: `${Math.max(2, Math.round((bytes / max) * 100))}%` } }),
                  ),
                  h('span', { className: 'msh-bar-meta' }, `${Number(item.count ?? 0) || 0} · ${fmtBytes(bytes)}`),
                )
              }),
            ),
        ),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' }, h('strong', null, t('pruneDryRun'))),
          h('div', { className: 'msh-modal-row' },
            h('label', { className: 'msh-check' },
              t('pruneKeep'),
              h('input', {
                className: 'msh-input-num', type: 'number', min: 1, max: 200, value: keep,
                onChange: event => setKeep(Math.max(1, Number(event.target.value) || 1)),
              }),
            ),
            h('button', { type: 'button', className: 'msh-btn msh-btn-sm', onClick: () => void runPrune(true) }, t('pruneDryRun')),
            h('button', {
              type: 'button',
              className: `msh-btn msh-btn-sm${confirmingPrune ? ' msh-btn-primary' : ''}`,
              onClick: () => void runPrune(false),
            }, confirmingPrune ? t('pruneConfirm') : t('pruneRun')),
          ),
          pruneView !== null
            ? h('p', { className: pruneView.removed > 0 ? 'msh-warn' : 'msh-note' },
              pruneView.removed > 0
                ? (pruneView.dryRun ? t('pruneWould') : t('pruneResult'))
                  .replace('{removed}', String(pruneView.removed))
                  .replace('{freed}', fmtBytes(pruneView.freedBytes))
                  .replace('{kept}', String(pruneView.kept ?? '—'))
                : t('pruneNothing'))
            : null,
        ),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' }, h('strong', null, `${t('exportLib')} / ${t('importLib')}`)),
          h('div', { className: 'msh-field' },
            h('span', null, t('exportLib')),
            h('input', {
              className: 'msh-search msh-dir', type: 'text', value: exportDir,
              placeholder: t('dirPlaceholder'),
              onChange: event => setExportDir(event.target.value),
            }),
            h('button', {
              type: 'button', className: `msh-btn msh-btn-sm${confirmingExport ? ' msh-btn-primary' : ''}`,
              disabled: exportDir.trim().length === 0,
              onClick: () => void runExport(),
            }, confirmingExport ? t('confirmExport') : t('exportLib')),
          ),
          h('div', { className: 'msh-field' },
            h('span', null, t('importLib')),
            h('input', {
              className: 'msh-search msh-dir', type: 'text', value: importDir,
              placeholder: t('dirPlaceholder'),
              onChange: event => setImportDir(event.target.value),
            }),
            h('button', {
              type: 'button', className: `msh-btn msh-btn-sm${confirmingImport ? ' msh-btn-primary' : ''}`,
              disabled: importDir.trim().length === 0,
              onClick: () => void runImport(),
            }, confirmingImport ? t('confirmImport') : t('importLib')),
          ),
        ),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' },
            h('strong', null, t('diagnostics')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onRefresh }, t('refreshPanel')),
          ),
          h('p', { className: 'msh-note-inline' }, t('diagnosticsHint')),
          diagnostics === null && diagnosticsError
            ? h('p', { className: 'msh-warn' }, `${t('loadFailed')}：${diagnosticsError}`)
            : null,
          h('div', { className: 'msh-about-grid' },
            h('div', null, h('b', null, t('diagSkills')), h('span', null, `${diag?.skills ?? 0} / ${t('statDomain')} ${diag?.domain ?? 0}`)),
            h('div', null, h('b', null, t('diagPending')), h('span', null, String(diag?.pending ?? 0))),
            h('div', null, h('b', null, t('diagUpdates')), h('span', null, String(diag?.updates ?? 0))),
            h('div', null, h('b', null, t('diagHistory')), h('span', null, String(diag?.history ?? 0))),
            h('div', null, h('b', null, t('diagBackups')), h('span', null, `${diag?.backups ?? 0} · ${fmtBytes(diag?.backupBytes ?? 0)}`)),
            h('div', null, h('b', null, t('diagSkillsRoot')), h('span', null, diag?.skillsRootExists === false ? t('missingDir') : t('exists'))),
          ),
          errors.length === 0
            ? h('p', { className: 'msh-note' }, t('diagNoErrors'))
            : h('div', { className: 'msh-errors' },
              h('b', null, t('diagErrors')),
              errors.slice(0, 12).map((text, index) => h('span', { key: `${index}:${text}`, className: 'msh-validation-error' }, text)),
            ),
        ),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' }, h('strong', null, t('mute'))),
          h('div', { className: 'msh-modal-row' },
            h('label', { className: 'msh-check' },
              t('muteHours'),
              h('input', {
                className: 'msh-input-num', type: 'number', min: 0, max: 720, value: muteHours,
                onChange: event => setMuteHours(Math.max(0, Number(event.target.value) || 0)),
              }),
            ),
            h('button', { type: 'button', className: 'msh-btn msh-btn-sm', onClick: () => void setMute(muteHours) }, t('mute')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => void setMute(0) }, t('muteNow')),
            h('span', { className: 'msh-note-inline' },
              muteUntil > Date.now() ? `${t('muteUntil')} ${fmtTime(muteUntil)}` : t('muteNone')),
          ),
        ),
      )
    }

    function ProjectsPanel({ t, projects, skills, onAdd, onRemove, onOpen, onBind, onUnbind, onSummary, summary, onRefresh }) {
      const [name, setName] = useState('')
      const [path, setPath] = useState('')
      const [formError, setFormError] = useState('')
      const [confirmingRemove, setConfirmingRemove] = useState('')
      const [binding, setBinding] = useState({})
      const items = firstArray(projects, ['items', 'projects'])

      useEffect(() => {
        if (confirmingRemove === '') return undefined
        const timer = window.setTimeout(() => setConfirmingRemove(''), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingRemove])

      const submit = () => {
        if (name.trim().length === 0) { setFormError(t('projectBadName')); return }
        if (path.trim().length === 0) { setFormError(t('projectBadPath')); return }
        setFormError('')
        void onAdd(name.trim(), path.trim())
        setName('')
        setPath('')
      }
      const summaryFor = item => (summary !== null && summary.name === item.name ? summary : null)

      return h('div', { className: 'msh-panels' },
        h('p', { className: 'msh-note' }, t('projectHint')),
        h('section', { className: 'msh-panel' },
          h('div', { className: 'msh-panel-head' },
            h('strong', null, t('projectAdd')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onRefresh }, t('refreshPanel')),
          ),
          h('div', { className: 'msh-field' },
            h('input', {
              className: 'msh-search', type: 'text', value: name,
              placeholder: t('projectName'),
              onChange: event => setName(event.target.value),
            }),
            h('input', {
              className: 'msh-search msh-dir', type: 'text', value: path,
              placeholder: t('projectPath'),
              onChange: event => setPath(event.target.value),
            }),
            h('button', { type: 'button', className: 'msh-btn msh-btn-sm msh-btn-primary', onClick: submit }, t('projectAdd')),
          ),
          formError.length > 0 ? h('p', { className: 'msh-warn' }, formError) : null,
          projects?.ok === false
            ? h('p', { className: 'msh-warn' }, `${t('loadFailed')}：${projects.error ?? ''}`)
            : null,
        ),
        projects?.loading === true && items.length === 0
          ? h('div', { className: 'msh-empty' }, t('loading'))
          : items.length === 0
            ? h('div', { className: 'msh-empty' }, t('projectEmpty'))
            : h('div', { className: 'msh-list' },
              items.map(item => {
                const bound = firstArray(item, ['skillNames'])
                const detail = summaryFor(item)
                return h('article', { key: item.id ?? item.name, className: 'msh-row' },
                  h('div', { className: 'msh-row-head' },
                    h('code', { className: 'msh-name' }, String(item.name ?? '')),
                    h('span', { className: 'msh-path', title: String(item.path ?? '') }, shortPath(String(item.path ?? ''))),
                    item.createdAt ? h(Badge, { tone: 'muted' }, fmtTime(item.createdAt)) : null,
                  ),
                  h('div', { className: 'msh-tags' },
                    bound.length === 0
                      ? h('span', { className: 'msh-note-inline' }, t('projectSkills'))
                      : bound.map(skillName => h('span', { key: skillName, className: 'msh-chip msh-chip-accent msh-chip-action' },
                        skillName,
                        h('button', {
                          type: 'button', className: 'msh-chip-x', title: t('projectUnbind'),
                          onClick: () => void onUnbind(item, skillName),
                        }, '×'),
                      )),
                  ),
                  h('div', { className: 'msh-row-actions' },
                    h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => void onOpen(item) }, t('projectOpen')),
                    h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => void onSummary(item) }, t('projectSummary')),
                    h('select', {
                      className: 'msh-select msh-select-sm',
                      value: binding[item.id ?? item.name] ?? '',
                      onChange: event => setBinding(current => ({ ...current, [item.id ?? item.name]: event.target.value })),
                    },
                      h('option', { value: '' }, t('projectBindHint')),
                      skills.map(skill => h('option', { key: skill.name, value: skill.name }, skill.name)),
                    ),
                    h('button', {
                      type: 'button', className: 'msh-btn msh-btn-sm',
                      disabled: (binding[item.id ?? item.name] ?? '').length === 0,
                      onClick: () => {
                        const key = item.id ?? item.name
                        const picked = binding[key] ?? ''
                        if (picked.length === 0) return
                        void onBind(item, picked)
                        setBinding(current => ({ ...current, [key]: '' }))
                      },
                    }, t('projectBind')),
                    h('button', {
                      type: 'button',
                      className: `msh-btn msh-btn-ghost msh-btn-sm msh-btn-danger${confirmingRemove === (item.id ?? item.name) ? ' msh-btn-primary' : ''}`,
                      onClick: () => {
                        const key = item.id ?? item.name
                        if (confirmingRemove !== key) { setConfirmingRemove(key); return }
                        setConfirmingRemove('')
                        void onRemove(item)
                      },
                    }, confirmingRemove === (item.id ?? item.name) ? t('confirmProjectRemove') : t('projectRemove')),
                  ),
                  detail !== null
                    ? h('div', { className: 'msh-summary' },
                      detail.loading === true
                        ? h('div', { className: 'msh-note-inline' }, t('projectSummaryLoading'))
                        : detail.error !== undefined
                          ? h('p', { className: 'msh-warn' }, String(detail.error))
                          : h(React.Fragment, null,
                            detail.exists === false ? h('p', { className: 'msh-warn' }, t('projectMissing')) : null,
                            h('b', null, `${t('projectFiles')} · ${Number(detail.fileCount ?? firstArray(detail, ['files']).length) || 0}`),
                            firstArray(detail, ['files']).length === 0
                              ? h('p', { className: 'msh-note-inline' }, t('projectNoFiles'))
                              : h('div', { className: 'msh-files' },
                                firstArray(detail, ['files']).slice(0, 50).map(file => h('div', { key: String(file.name ?? ''), className: 'msh-file-row' },
                                  h('code', { title: String(file.name ?? '') }, String(file.name ?? '')),
                                  h('span', null, `${fmtBytes(file.size ?? 0)} · ${fmtTime(file.mtime ?? 0)}`),
                                )),
                              ),
                            firstArray(detail, ['warnings']).length > 0
                              ? h('div', { className: 'msh-errors' },
                                h('b', null, t('projectWarnings')),
                                firstArray(detail, ['warnings']).map((warning, index) => h('span', {
                                  key: `${index}:${errorText(warning)}`,
                                  className: 'msh-validation-warn',
                                }, errorText(warning))),
                              )
                              : null,
                          ),
                    )
                    : null,
                )
              }),
            ),
      )
    }

    function CommandPalette({ t, skills, qualityMap, favorites, onClose, onOpenEditor, onOpenSkill }) {
      const [term, setTerm] = useState('')
      const [hovered, setHovered] = useState(0)
      const inputRef = useRef(null)
      useEffect(() => {
        const box = inputRef.current
        if (box !== null) box.focus()
        const onKey = event => {
          if (event.key === 'Escape') { event.preventDefault(); onClose() }
          if (event.key === 'ArrowDown') { event.preventDefault(); setHovered(value => value + 1) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setHovered(value => Math.max(0, value - 1)) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      const key = term.trim().toLowerCase()
      const found = useMemo(() => {
        const base = key.length === 0 ? skills : skills.filter(skill => `${skill.name} ${skill.description ?? ''}`.toLowerCase().includes(key))
        return base.slice(0, 40)
      }, [skills, key])
      const index = found.length === 0 ? 0 : Math.min(hovered, found.length - 1)
      const pick = skill => {
        if (skill === null || skill === undefined) return
        onClose()
        onOpenEditor(skill)
      }
      return h('div', {
        className: 'msh-modal-backdrop msh-palette-backdrop',
        onClick: event => { if (event.target === event.currentTarget) onClose() },
      },
        h('div', { className: 'msh-palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('commandPalette') },
          h('input', {
            ref: inputRef,
            className: 'msh-palette-input',
            type: 'text',
            value: term,
            placeholder: t('commandPlaceholder'),
            onChange: event => { setTerm(event.target.value); setHovered(0) },
            onKeyDown: event => {
              if (event.key === 'Enter') { event.preventDefault(); pick(found[index]) }
            },
          }),
          found.length === 0
            ? h('div', { className: 'msh-palette-empty' }, t('commandEmpty'))
            : h('div', { className: 'msh-palette-list' },
              found.map((skill, position) => {
                const quality = qualityMap.get(skill.name)
                return h('div', {
                  key: skill.name,
                  className: `msh-palette-item${position === index ? ' msh-palette-item-active' : ''}`,
                  onMouseEnter: () => setHovered(position),
                  onClick: () => pick(skill),
                },
                  h('code', null, skill.name),
                  quality ? h('span', { className: 'msh-palette-meta' }, `${quality.grade ?? ''} ${Number.isFinite(Number(quality.score)) ? Math.round(Number(quality.score)) : ''}`) : null,
                  favorites.includes(skill.name) ? h('span', { className: 'msh-palette-meta' }, '★') : null,
                  h('span', { className: 'msh-palette-desc' }, String(skill.description ?? '').slice(0, 90)),
                )
              }),
            ),
          h('div', { className: 'msh-palette-foot' },
            h('span', null, t('commandHint')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => void onOpenSkill(found[index]) }, t('openEditor')),
            h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: onClose }, t('close')),
          ),
        ),
      )
    }


    function HubPage({ t, locale }) {
      useLocaleTick(locale)
      const snapshot = useStore()
      const [tab, setTab] = useState('skills')
      const [query, setQuery] = useState('')
      const [onlyUpdatable, setOnlyUpdatable] = useState(false)
      const [onlyFavorites, setOnlyFavorites] = useState(false)
      const [stageFilter, setStageFilter] = useState('')
      const [sourceFilter, setSourceFilter] = useState('')
      const [updateFilter, setUpdateFilter] = useState('')
      const [confirmingAll, setConfirmingAll] = useState(false)
      const [editor, setEditor] = useState(null)
      const [history, setHistory] = useState({ items: [], loading: false, error: null })
      const [historyFilter, setHistoryFilter] = useState('')
      const [historyVersion, setHistoryVersion] = useState(0)
      const [rollbackConfirm, setRollbackConfirm] = useState(null)
      const [rollingId, setRollingId] = useState('')
      const [diffView, setDiffView] = useState(null)
      const [busy, setBusy] = useState('')
      const [toast, setToast] = useState(null)
      const [quality, setQuality] = useState({ map: new Map(), duplicates: [], loading: false, error: null })
      const [snippets, setSnippets] = useState({ items: [], loading: false, error: null })
      const [safety, setSafety] = useState(null)
      const [danger, setDanger] = useState({ data: null, loading: false, error: null })
      const [projects, setProjects] = useState({ items: [], loading: false, error: null, ok: null })
      const [projectSummary, setProjectSummary] = useState(null)
      const [uiState, setUiState] = useState({ favorites: [], groups: {}, order: [] })
      const [paletteOpen, setPaletteOpen] = useState(false)
      const [panelVersion, setPanelVersion] = useState(0)
      const editorOpenRef = useRef(false)
      const toastTimer = useRef(null)

      useEffect(() => {
        editorOpenRef.current = editor !== null
      }, [editor])

      useEffect(() => {
        void store.load(false)
        const timer = window.setInterval(() => { void store.load(true) }, 45_000)
        return () => window.clearInterval(timer)
      }, [])

      // Quality/stage/missing badges come from their own read-only route.
      useEffect(() => {
        let cancelled = false
        setQuality(current => ({ ...current, loading: true }))
        void store.getQuality().then(body => {
          if (cancelled) return
          setQuality({
            map: body?.ok === true ? normalizeQuality(body) : new Map(),
            duplicates: firstArray(body, ['duplicates']),
            loading: false,
            error: body?.ok === true ? null : String(body?.error ?? t('loadFailed')),
          })
        })
        return () => { cancelled = true }
      }, [panelVersion])

      // Snippets power the editor dropdown; a missing route leaves the select empty.
      useEffect(() => {
        let cancelled = false
        setSnippets(current => ({ ...current, loading: true }))
        void store.getSnippets().then(body => {
          if (cancelled) return
          setSnippets({
            items: firstArray(body, ['items', 'snippets']),
            loading: false,
            error: body?.ok === true ? null : String(body?.error ?? t('loadFailed')),
          })
        })
        return () => { cancelled = true }
      }, [panelVersion])

      // Favourites/pins: /ui first, then the overview payload as a fallback.
      useEffect(() => {
        let cancelled = false
        void store.getUi().then(body => {
          if (cancelled) return
          if (body?.ok === true && body.ui !== null && typeof body.ui === 'object') {
            setUiState(current => ({ ...current, ...body.ui, favorites: favoritesOf(body.ui) }))
            return
          }
          const fromOverview = snapshot.data?.ui
          if (fromOverview !== null && typeof fromOverview === 'object') {
            setUiState(current => ({ ...current, ...fromOverview, favorites: favoritesOf(fromOverview) }))
          }
        })
        return () => { cancelled = true }
      }, [panelVersion])

      useEffect(() => {
        const fromOverview = snapshot.data?.ui
        if (fromOverview === null || typeof fromOverview !== 'object') return
        setUiState(current => (
          JSON.stringify(current.favorites) === JSON.stringify(favoritesOf(fromOverview))
            ? current
            : { ...current, ...fromOverview, favorites: favoritesOf(fromOverview) }
        ))
      }, [snapshot.data?.ui])

      // Safety + diagnostics only refresh while the tab is visible.
      useEffect(() => {
        if (tab !== 'safety') return undefined
        let cancelled = false
        setDanger(current => ({ ...current, loading: true }))
        void Promise.all([store.getSafety(), store.getDiagnostics()]).then(([safeBody, diagBody]) => {
          if (cancelled) return
          setSafety(safeBody?.ok === true ? normalizeSafety(safeBody) : null)
          setDanger({
            data: diagBody?.ok === true ? normalizeDiagnostics(diagBody) : null,
            loading: false,
            error: diagBody?.ok === true ? null : String(diagBody?.error ?? t('loadFailed')),
          })
          if (diagBody?.ok === true) {
            const nextUi = normalizeDiagnostics(diagBody).ui
            if (nextUi !== null) setUiState(current => ({ ...current, ...nextUi, favorites: favoritesOf(nextUi) }))
          }
        })
        return () => { cancelled = true }
      }, [tab, panelVersion])

      useEffect(() => {
        if (tab !== 'projects') return undefined
        let cancelled = false
        setProjects(current => ({ ...current, loading: true }))
        void store.getProjects().then(body => {
          if (cancelled) return
          setProjects({
            items: firstArray(body, ['items', 'projects']),
            loading: false,
            error: body?.ok === true ? null : String(body?.error ?? t('loadFailed')),
            ok: body?.ok === true,
          })
        })
        return () => { cancelled = true }
      }, [tab, panelVersion])

      // Ctrl/Cmd + K opens the command palette from anywhere on the page.
      useEffect(() => {
        const onKey = event => {
          if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
            if (editorOpenRef.current) return
            event.preventDefault()
            setPaletteOpen(open => !open)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      useEffect(() => {
        if (!confirmingAll) return undefined
        const timer = window.setTimeout(() => setConfirmingAll(false), 4000)
        return () => window.clearTimeout(timer)
      }, [confirmingAll])

      useEffect(() => {
        if (rollbackConfirm === null) return undefined
        const timer = window.setTimeout(() => setRollbackConfirm(null), 4000)
        return () => window.clearTimeout(timer)
      }, [rollbackConfirm])

      useEffect(() => {
        if (tab !== 'history') return undefined
        let cancelled = false
        setHistory(current => ({ ...current, loading: true, error: null }))
        void store.getHistory(historyFilter).then(data => {
          if (cancelled) return
          setHistory({
            items: Array.isArray(data?.items) ? data.items : [],
            loading: false,
            error: data?.ok === true ? null : (data?.error ?? t('loadFailed')),
          })
        })
        return () => { cancelled = true }
      }, [tab, historyFilter, historyVersion])

      const say = (text, tone = 'ok') => {
        setToast({ text, tone })
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(null), 5000)
      }

      const run = async (name, payload, after) => {
        setBusy(name)
        try {
          const result = await store.action(name, payload)
          if (after) after(result)
        } finally {
          setBusy('')
        }
      }

      const data = snapshot.data
      const stats = data?.stats
      const skills = data?.skills ?? []
      const discoveries = data?.discoveries ?? []
      const qualityMap = quality.map
      const favorites = uiState.favorites
      const pinSource = data?.pins ?? danger.data?.pins ?? null
      const pinnedNames = useMemo(() => {
        const names = new Set()
        if (pinSource !== null && typeof pinSource === 'object') {
          if (Array.isArray(pinSource)) {
            for (const item of pinSource) {
              const name = typeof item === 'string' ? item : item?.name
              if (typeof name === 'string') names.add(name)
            }
          } else {
            for (const name of Object.keys(pinSource)) names.add(name)
          }
        }
        // GET /quality also reports a per-skill `pinned` flag.
        for (const [name, entry] of qualityMap) {
          if (entry?.pinned === true) names.add(name)
        }
        return names
      }, [pinSource, qualityMap])
      const stageOptions = useMemo(() => {
        const found = new Set()
        for (const skill of skills) {
          const stage = qualityMap.get(skill.name)?.stage ?? skill.stage
          if (typeof stage === 'string' && stage.length > 0) found.add(stage)
        }
        return [...found].sort()
      }, [skills, qualityMap])
      const sourceOptions = useMemo(() => {
        const found = new Set()
        for (const skill of skills) found.add(skill.source === 'bundled' ? 'bundled' : (skill.source || 'user'))
        return [...found].sort()
      }, [skills])
      const filtered = useMemo(() => {
        const key = query.trim().toLowerCase()
        const favoriteSet = new Set(favorites)
        let list = skills
        if (onlyUpdatable) list = list.filter(skill => skill.update?.available === true)
        if (onlyFavorites) list = list.filter(skill => favoriteSet.has(skill.name))
        if (stageFilter !== '') list = list.filter(skill => (qualityMap.get(skill.name)?.stage ?? skill.stage ?? '') === stageFilter)
        if (sourceFilter !== '') list = list.filter(skill => (skill.source === 'bundled' ? 'bundled' : (skill.source || 'user')) === sourceFilter)
        if (updateFilter === 'has') list = list.filter(skill => skill.update?.available === true)
        if (updateFilter === 'latest') list = list.filter(skill => skill.update?.available !== true && typeof skill.update?.repo === 'string' && skill.update.repo.length > 0)
        if (updateFilter === 'norepo') list = list.filter(skill => !(typeof skill.update?.repo === 'string' && skill.update.repo.length > 0))
        if (key.length === 0) return list
        return list.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(key))
      }, [skills, query, onlyUpdatable, onlyFavorites, stageFilter, sourceFilter, updateFilter, qualityMap, favorites])

      const pendingItems = discoveries.filter(item => item.status === 'pending')
      const updates = skills.filter(skill => skill.update?.available === true)
      const reminder = data?.reminder
      const hasReminder = reminder !== null && reminder !== undefined && (reminder.pending + reminder.updates) > 0
      const config = data?.config ?? {}
      const refreshPanels = () => setPanelVersion(value => value + 1)

      const onInstall = (item, skillPath) => {
        void run('install', { id: item.id, skillPath, confirm: true }, result => {
          if (result?.ok === true) say(t('installDone').replace('{name}', result.name ?? ''), 'ok')
          else say(`${t('installFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onIgnore = (item, action) => {
        void run(action, { id: item.id }, result => {
          if (result?.ok !== true) say(`${t('actionFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onOpen = (name, target) => {
        void store.fire('open', { name, target }).then(result => {
          if (result?.ok !== true) say(`${t('openFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onOpenRoot = () => {
        void store.fire('open', { root: true }).then(result => {
          if (result?.ok !== true) say(`${t('openFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onOpenBackups = () => {
        void store.fire('open', { backups: true }).then(result => {
          if (result?.ok !== true) say(`${t('openFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onUpdate = name => {
        void run('update', { name, confirm: true }, result => {
          if (result?.ok === true) say(t('updateDone').replace('{name}', name), 'ok')
          else say(`${t('updateFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onUpdateAll = () => {
        if (!confirmingAll) { setConfirmingAll(true); return }
        setConfirmingAll(false)
        void run('update_all', { confirm: true }, result => {
          if (result?.ok === true) say(`${t('updateAll').replace('{count}', '')} ${result.updated}/${result.attempted}`, 'ok')
          else say(`${t('updateFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      const onToggleFavorite = (name, next) => {
        const favoriteSet = new Set(favorites)
        if (next) favoriteSet.add(name)
        else favoriteSet.delete(name)
        const nextFavorites = [...favoriteSet]
        setUiState(current => ({ ...current, favorites: nextFavorites }))
        void store.fire('ui', { favorites: nextFavorites, patch: { favorites: nextFavorites } }).then(result => {
          if (result?.ok !== true) {
            say(`${t('actionFailed')}：${result?.error ?? 'unknown'}`, 'error')
            refreshPanels()
            return
          }
          if (result.ui !== null && typeof result.ui === 'object') {
            setUiState(current => ({ ...current, ...result.ui, favorites: favoritesOf(result.ui) }))
          }
          say(next ? t('favAdded').replace('{name}', name) : t('favRemoved').replace('{name}', name), 'ok')
        })
      }
      const onTogglePin = (skill, shouldPin) => {
        void store.fire(shouldPin ? 'pin' : 'unpin', { name: skill.name }).then(result => {
          if (result?.ok !== true) {
            say(`${t('actionFailed')}：${result?.error ?? 'unknown'}`, 'error')
            return
          }
          void store.load(true)
          refreshPanels()
        })
      }
      const onRecycle = name => {
        void run('recycle', { name, confirm: true }, result => {
          if (result?.ok === true) say(t('recycled').replace('{name}', name), 'ok')
          else say(`${t('recycleFailed')}：${result?.error ?? 'unknown'}`, 'error')
        })
      }
      /** One action channel for the safety/diagnostics and project panels. */
      const panelAction = async (name, payload) => {
        setBusy(name)
        try {
          const result = await store.fire(name, payload)
          // Import reports per-directory errors but can still import a subset.
          const partial = name === 'import' && result !== null && typeof result === 'object' && result.imported !== undefined
          if (result?.ok !== true && !partial) {
            say(`${t('actionFailed')}：${result?.error ?? 'unknown'}`, 'error')
            return result
          }
          if (name === 'snapshot') say(t('snapshotDone').replace('{count}', String(firstArray(result, ['backups']).length)), 'ok')
          if (name === 'prune_backups' && payload?.dryRun !== true) {
            say(t('pruneResult')
              .replace('{removed}', String(firstArray(result, ['removed']).length))
              .replace('{freed}', fmtBytes(Number(result.freedBytes ?? 0) || 0))
              .replace('{kept}', String(result.kept ?? '—')), 'ok')
          }
          if (name === 'export') {
            say(t('exportDone')
              .replace('{skills}', String(Array.isArray(result.skills) ? result.skills.length : (Number(result.skills) || 0)))
              .replace('{bytes}', fmtBytes(Number(result.bytes ?? 0) || 0))
              .replace('{dir}', String(result.dir ?? payload?.dir ?? '')), 'ok')
          }
          if (name === 'import') {
            const imported = Array.isArray(result.imported) ? result.imported.length : (Number(result.imported) || 0)
            const skipped = Array.isArray(result.skipped) ? result.skipped.length : (Number(result.skipped) || 0)
            say(t('importDone').replace('{imported}', String(imported)).replace('{skipped}', String(skipped)),
              result?.ok === true ? 'ok' : 'warn')
            if (firstArray(result, ['errors']).length > 0) say(firstArray(result, ['errors']).map(errorText).join('；'), 'error')
          }
          if (name === 'mute') say(payload?.hours === 0 ? t('muteOff') : t('muteSet').replace('{hours}', String(payload?.hours ?? 0)), 'ok')
          if (name === 'project_add') say(t('projectAdded').replace('{name}', String(result.project?.name ?? payload?.name ?? '')), 'ok')
          if (name === 'project_remove') say(t('projectRemoved').replace('{name}', String(payload?.name ?? result.removed ?? '')), 'ok')
          if (name === 'bind' || name === 'unbind') void store.load(true)
          return result
        } finally {
          setBusy('')
        }
      }
      const addProject = (name, path) => {
        void panelAction('project_add', { name, path }).then(result => {
          if (result?.ok !== true) {
            const text = String(result?.error ?? t('actionFailed'))
            setProjects(current => ({ ...current, ok: false, error: text }))
            return
          }
          refreshPanels()
        })
      }
      const removeProject = item => {
        void panelAction('project_remove', { id: item.id, name: item.name }).then(result => {
          if (result?.ok === true) {
            setProjectSummary(current => (current?.name === item.name ? null : current))
            refreshPanels()
          }
        })
      }
      const openProject = item => {
        void panelAction('open_project', { id: item.id, name: item.name })
      }
      const bindProject = (item, skillName) => {
        void panelAction('bind', { projectId: item.id, projectName: item.name, skillName }).then(result => {
          if (result?.ok === true) refreshPanels()
        })
      }
      const unbindProject = (item, skillName) => {
        void panelAction('unbind', { projectId: item.id, projectName: item.name, skillName }).then(result => {
          if (result?.ok === true) refreshPanels()
        })
      }
      const summarizeProject = item => {
        setProjectSummary({ name: item.name, loading: true })
        void store.getProjectSummary(item.name).then(body => {
          setProjectSummary(current => {
            if (current === null || current.name !== item.name) return current
            // projectSummary() sets ok=false when the folder is missing, but the
            // payload (exists/files/warnings) is still the useful report.
            const report = body !== null && typeof body === 'object'
              && (body.exists !== undefined || Array.isArray(body.files) || Array.isArray(body.warnings))
            if (!report) return { name: item.name, loading: false, ok: false, error: String(body?.error ?? t('loadFailed')) }
            return {
              ...body,
              name: body.project?.name ?? body.name ?? item.name,
              exists: body.exists !== false,
              files: firstArray(body, ['files']),
              warnings: firstArray(body, ['warnings']),
              loading: false,
            }
          })
        })
      }

      const setEditorField = patch => setEditor(current => current === null ? null : { ...current, ...patch })
      const baseEditor = skill => ({
        name: skill.name, mode: 'append', position: 'end', text: '', hint: '', digest: '',
        thinking: false, diagnosing: false, applying: false, previewing: false,
        diagnosis: [], selectedDiagnosis: [], validation: null,
      })
      const openCustom = skill => setEditor(baseEditor(skill))
      const openThink = skill => {
        setEditor({ ...baseEditor(skill), thinking: true })
        void (async () => {
          const result = await store.fire('think', { name: skill.name, mode: 'append', hint: '' })
          setEditor(current => current === null || current.name !== skill.name ? current : {
            ...current,
            thinking: false,
            text: result?.ok === true ? result.content : '',
            digest: result?.ok === true ? (result.digest ?? '') : '',
            mode: result?.ok === true && result.mode === 'replace' ? 'replace' : 'append',
          })
          if (result?.ok !== true) say(`${t('thinkFailed')}：${result?.error ?? ''}`, 'error')
        })()
      }
      const selectedDiagnosis = () => (editor?.diagnosis ?? []).filter((_, index) => (editor?.selectedDiagnosis ?? []).includes(index))
      const runDiagnose = () => {
        if (editor === null) return
        const { name, hint, mode } = editor
        setEditorField({ diagnosing: true })
        void (async () => {
          const result = await store.fire('think_diagnose', { name, hint, mode })
          if (result?.ok === true) {
            const items = firstArray(result, ['diagnosis']).filter(item => item !== null && typeof item === 'object')
            setEditorField({
              diagnosing: false,
              diagnosis: items,
              selectedDiagnosis: items.map((_, index) => index),
            })
            if (items.length === 0) say(t('diagnosisEmpty'), 'warn')
          } else {
            setEditorField({ diagnosing: false })
            say(`${t('diagnoseFailed')}：${result?.error ?? ''}`, 'error')
          }
        })()
      }
      const runGenerate = () => {
        if (editor === null) return
        const { name, mode, hint } = editor
        const diagnosis = selectedDiagnosis()
        setEditorField({ thinking: true })
        void (async () => {
          const payload = { name, mode, hint }
          if (diagnosis.length > 0) payload.diagnosis = diagnosis
          const result = await store.fire('think', payload)
          if (result?.ok === true) {
            setEditorField({
              thinking: false,
              text: result.content,
              digest: result.digest ?? '',
              mode: result.mode === 'replace' ? 'replace' : mode,
              validation: null,
            })
          } else {
            setEditorField({ thinking: false })
            say(`${t('thinkFailed')}：${result?.error ?? ''}`, 'error')
          }
        })()
      }
      const toggleDiagnosis = index => {
        setEditor(current => {
          if (current === null) return current
          const chosen = current.selectedDiagnosis ?? []
          return {
            ...current,
            selectedDiagnosis: chosen.includes(index) ? chosen.filter(item => item !== index) : [...chosen, index],
          }
        })
      }
      const setDiagnosisAll = on => {
        setEditor(current => current === null ? current : {
          ...current,
          selectedDiagnosis: on ? (current.diagnosis ?? []).map((_, index) => index) : [],
        })
      }
      const previewEditor = () => {
        if (editor === null) return
        const { name, text, mode, position } = editor
        setEditorField({ previewing: true })
        void (async () => {
          const result = await store.fire('preview', { name, text, mode, position })
          if (result?.ok === true) {
            const validation = result.validation ?? null
            const lines = validationLines(validation)
            const diff = result.diff
            // previewEdit() returns { diff: { text, added, removed, truncated } };
            // a plain string is accepted too for forward compatibility.
            const diffText = typeof diff === 'string'
              ? diff
              : (diff !== null && typeof diff === 'object' && typeof diff.text === 'string' ? diff.text : '')
            const counts = diff !== null && typeof diff === 'object' && Number.isFinite(Number(diff.added))
              ? `+${Number(diff.added)} / -${Number(diff.removed ?? 0)}\n`
              : ''
            setEditorField({ previewing: false, validation })
            setDiffView({
              id: `${name} · ${mode === 'replace' ? t('modeReplace') : t('modeAppend')}`,
              loading: false,
              text: diffText.length > 0
                ? `${counts}${diffText}`
                : (lines.length > 0 ? lines.map(line => line.text).join('\n') : t('diffEmpty')),
            })
          } else {
            setEditorField({
              previewing: false,
              validation: result?.validation ?? { errors: [String(result?.error ?? t('previewFailed'))] },
            })
            say(`${t('previewFailed')}：${result?.error ?? ''}`, 'error')
          }
        })()
      }
      const changeMode = mode => {
        if (editor === null) return
        if (mode === 'replace' && editor.text.trim().length === 0) {
          setEditorField({ mode })
          const name = editor.name
          void (async () => {
            const data = await store.getSkill(name)
            if (data?.ok === true && typeof data.content === 'string') setEditorField({ text: data.content })
            else say(`${t('loadFailed')}：${data?.error ?? ''}`, 'error')
          })()
        } else {
          setEditorField({ mode })
        }
      }
      const applyEditor = () => {
        if (editor === null) return
        const { name, text, mode, position } = editor
        setEditorField({ applying: true })
        void (async () => {
          const result = await store.fire('custom_update', { name, text, mode, position, confirm: true })
          if (result?.overview !== undefined) store.patch({ data: result.overview, error: null, loadedAt: Date.now() })
          if (result?.ok === true) {
            setEditor(null)
            refreshPanels()
            say(t('editDone').replace('{name}', name), 'ok')
          } else {
            setEditorField({ applying: false })
            say(`${t('editFailed')}：${result?.error ?? ''}`, 'error')
          }
        })()
      }

      const openHistory = name => {
        setHistoryFilter(name ?? '')
        setTab('history')
      }
      const kindLabel = kind => kind === 'install'
        ? t('kindInstall')
        : kind === 'upstream'
          ? t('kindUpstream')
          : kind === 'custom'
            ? t('kindCustom')
            : t('kindRollback')
      const openDiff = entry => {
        setDiffView({ id: entry.id, text: '', loading: true })
        void (async () => {
          const data = await store.getDiff(entry.id)
          setDiffView(current => current === null || current.id !== entry.id ? current : {
            ...current,
            loading: false,
            text: data?.ok === true ? data.text : (data?.error ?? t('diffEmpty')),
          })
        })()
      }
      const runRollback = entry => {
        if (rollbackConfirm !== entry.id) { setRollbackConfirm(entry.id); return }
        setRollbackConfirm(null)
        setRollingId(entry.id)
        void (async () => {
          const result = await store.fire('rollback', { id: entry.id, confirm: true })
          setRollingId('')
          if (result?.overview !== undefined) store.patch({ data: result.overview, error: null, loadedAt: Date.now() })
          if (result?.ok === true) {
            if (Array.isArray(result.history)) setHistory({ items: result.history, loading: false, error: null })
            else setHistoryVersion(value => value + 1)
            say(t('rollbackDone').replace('{name}', result.name ?? entry.name), 'ok')
          } else {
            say(`${t('rollbackFailed')}：${result?.error ?? ''}`, 'error')
          }
        })()
      }

      const tabs = [
        { id: 'skills', label: t('tabSkills'), count: stats?.domain ?? 0 },
        { id: 'discover', label: t('tabDiscover'), count: stats?.pending ?? 0 },
        { id: 'projects', label: t('tabProjects'), count: firstArray(projects, ['items']).length },
        { id: 'history', label: t('tabHistory'), count: stats?.historyCount ?? 0 },
        { id: 'safety', label: t('tabSafety'), count: safety?.count ?? 0 },
        { id: 'about', label: t('tabAbout') },
      ]

      return h(React.Fragment, null,
        h('div', { className: 'msh-page' },
          h('div', { className: 'msh-inner' },
            h('header', { className: 'msh-header' },
              h('div', null,
                h('h1', { className: 'msh-title' }, t('title')),
                h('p', { className: 'msh-subtitle' }, t('subtitle')),
              ),
              h('div', { className: 'msh-actions' },
                h('button', {
                  type: 'button', className: 'msh-btn', disabled: busy !== '',
                  onClick: () => void run('refresh', {}, () => say(t('refreshDone'))),
                }, busy === 'refresh' ? t('loading') : t('refresh')),
                h('button', {
                  type: 'button', className: 'msh-btn msh-btn-ghost', title: t('commandHint'),
                  onClick: () => setPaletteOpen(true),
                }, `⌘K · ${t('commandPalette')}`),
                h('button', {
                  type: 'button', className: 'msh-btn msh-btn-ghost',
                  onClick: onOpenRoot,
                }, t('openSkillsRoot')),
                h('button', {
                  type: 'button', className: 'msh-btn', disabled: busy !== '',
                  onClick: () => void run('discover', { force: true }, result => {
                    if (result?.result?.error) say(result.result.error, 'error')
                    else say(`${t('scanDone')} · ${t('statPending')} ${result?.result?.pending ?? 0}`, 'ok')
                  }),
                }, busy === 'discover' ? t('scanning') : t('scan')),
                h('button', {
                  type: 'button', className: 'msh-btn msh-btn-primary', disabled: busy !== '',
                  onClick: () => void run('check_updates', {}, result => {
                    say(`${t('updatesDone')} · ${result?.result?.available ?? 0}`, 'ok')
                  }),
                }, busy === 'check_updates' ? t('loading') : t('checkUpdates')),
                updates.length > 0
                  ? h('button', {
                    type: 'button',
                    className: `msh-btn${confirmingAll ? ' msh-btn-primary' : ''}`,
                    disabled: busy !== '',
                    onClick: onUpdateAll,
                  }, confirmingAll ? t('confirmUpdateAll') : t('updateAll').replace('{count}', String(updates.length)))
                  : null,
              ),
            ),

            hasReminder
              ? h('div', { className: 'msh-banner' },
                h('div', { className: 'msh-banner-icon' }, '⌁'),
                h('div', { className: 'msh-banner-body' },
                  h('strong', null, `${t('reminderTitle')} · ${reminder.date}`),
                  h('span', null, t('reminderBody')
                    .replace('{pending}', String(reminder.pending))
                    .replace('{updates}', String(reminder.updates))),
                ),
              )
              : null,

            data?.stats?.lastGithubScanError
              ? h('div', { className: 'msh-banner msh-banner-warn' },
                h('div', { className: 'msh-banner-icon' }, '!'),
                h('div', { className: 'msh-banner-body' },
                  h('strong', null, t('githubError')),
                  h('span', null, data.stats.lastGithubScanError),
                ),
              )
              : null,

            toast !== null
              ? h('div', { className: `msh-toast msh-toast-${toast.tone}` }, toast.text)
              : null,

            h('div', { className: 'msh-stats' },
              h(Stat, { label: t('statDomain'), value: stats?.domain ?? 0 }),
              h(Stat, { label: t('statPending'), value: stats?.pending ?? 0, tone: (stats?.pending ?? 0) > 0 ? 'warn' : undefined }),
              h(Stat, { label: t('statUpdates'), value: stats?.updates ?? 0, tone: (stats?.updates ?? 0) > 0 ? 'accent' : undefined }),
              h(Stat, { label: t('statAgent'), value: stats?.agentUpdated ?? 0 }),
            ),

            h('div', { className: 'msh-toolbar' },
              h('div', { className: 'msh-tabs' }, tabs.map(item => h('button', {
                key: item.id,
                type: 'button',
                className: `msh-tab${tab === item.id ? ' msh-tab-active' : ''}`,
                onClick: () => setTab(item.id),
              }, item.label, typeof item.count === 'number' && item.count > 0 ? h('span', { className: 'msh-tab-count' }, String(item.count)) : null))),
              tab === 'skills'
                ? h('div', { className: 'msh-filters' },
                  h('input', {
                    className: 'msh-search', type: 'search', value: query,
                    placeholder: t('searchPlaceholder'),
                    onChange: event => setQuery(event.target.value),
                  }),
                  h('label', { className: 'msh-check' },
                    h('input', {
                      type: 'checkbox', checked: onlyUpdatable,
                      onChange: event => setOnlyUpdatable(event.target.checked),
                    }),
                    t('onlyUpdatable'),
                  ),
                  h('label', { className: 'msh-check' },
                    h('input', {
                      type: 'checkbox', checked: onlyFavorites,
                      onChange: event => setOnlyFavorites(event.target.checked),
                    }),
                    `★ ${t('onlyFavorites')}`,
                  ),
                  stageOptions.length > 0
                    ? h('select', {
                      className: 'msh-select msh-select-sm',
                      value: stageFilter,
                      onChange: event => setStageFilter(event.target.value),
                      title: t('filterStage'),
                    },
                      h('option', { value: '' }, t('filterAllStage')),
                      stageOptions.map(stage => h('option', { key: stage, value: stage }, stageLabel(t, stage))),
                    )
                    : null,
                  sourceOptions.length > 1
                    ? h('select', {
                      className: 'msh-select msh-select-sm',
                      value: sourceFilter,
                      onChange: event => setSourceFilter(event.target.value),
                      title: t('filterSource'),
                    },
                      h('option', { value: '' }, t('filterAllSource')),
                      sourceOptions.map(source => h('option', { key: source, value: source }, source)),
                    )
                    : null,
                  h('select', {
                    className: 'msh-select msh-select-sm',
                    value: updateFilter,
                    onChange: event => setUpdateFilter(event.target.value),
                    title: t('filterUpdate'),
                  },
                    h('option', { value: '' }, t('filterAllUpdate')),
                    h('option', { value: 'has' }, t('updateHas')),
                    h('option', { value: 'latest' }, t('updateUpToDate')),
                    h('option', { value: 'norepo' }, t('updateNoRepo')),
                  ),
                )
                : null,
            ),

            snapshot.loading && data === null
              ? h('div', { className: 'msh-empty' }, t('loading'))
              : snapshot.error !== null && data === null
                ? h('div', { className: 'msh-empty' },
                  h('p', null, `${t('loadFailed')}：${snapshot.error}`),
                  h('button', { type: 'button', className: 'msh-btn', onClick: () => void store.load(true) }, t('retry')),
                )
                : tab === 'skills'
                  ? h('div', { className: 'msh-list' },
                    filtered.length === 0
                      ? h('div', { className: 'msh-empty' }, t('emptySkills'))
                      : filtered.map(skill => h(SkillRow, {
                        key: skill.name, skill, t, onOpen,
                        quality: qualityMap.get(skill.name) ?? null,
                        pinned: pinnedNames.has(skill.name),
                        favorite: favorites.includes(skill.name),
                        onUpdate: onUpdate,
                        onEdit: openCustom,
                        onThink: openThink,
                        onHistory: openHistory,
                        onPin: onTogglePin,
                        onFavorite: onToggleFavorite,
                        onRecycle,
                        busy: busy !== '',
                      })),
                  )
                  : tab === 'discover'
                    ? h('div', { className: 'msh-list' },
                      discoveries.length === 0
                        ? h('div', { className: 'msh-empty' }, t('emptyDiscover'))
                        : discoveries.map(item => h(DiscoveryRow, {
                          key: item.id, item, t, busy: busy !== '',
                          onInstall, onIgnore, onOpen,
                        })),
                    )
                    : tab === 'projects'
                      ? h(ProjectsPanel, {
                        t,
                        projects,
                        skills,
                        summary: projectSummary,
                        onAdd: addProject,
                        onRemove: removeProject,
                        onOpen: openProject,
                        onBind: bindProject,
                        onUnbind: unbindProject,
                        onSummary: summarizeProject,
                        onRefresh: refreshPanels,
                      })
                      : tab === 'safety'
                        ? h(SafetyPanel, {
                          t,
                          safety,
                          diagnostics: danger.data,
                          diagnosticsError: danger.error,
                          onAction: panelAction,
                          onRefresh: refreshPanels,
                        })
                        : tab === 'about'
                      ? h('div', { className: 'msh-about' },
                        h('p', null, t('aboutIntro')),
                        h('p', null, t('aboutHow')),
                        h('p', null, t('aboutAgent')),
                        h('div', { className: 'msh-about-grid' },
                          h('div', null, h('b', null, t('lastScan')), h('span', null, fmtTime(stats?.lastGithubScanAt))),
                          h('div', null, h('b', null, t('statDomain')), h('span', null, `${stats?.domain ?? 0} / ${stats?.total ?? 0}`)),
                          h('div', null, h('b', null, 'GitHub'), h('span', null, config.hasGithubToken ? t('tokenOk') : t('noToken'))),
                          h('div', null, h('b', null, 'Skills'), h('span', { className: 'msh-path' }, shortPath(data?.skillsRoot ?? ''))),
                          h('div', null,
                            h('b', null, t('openBackups')),
                            h('button', {
                              type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
                              onClick: onOpenBackups,
                            }, t('openBackups')),
                          ),
                        ),
                        h('p', { className: 'msh-note' }, t('schedule').replace('{time}', config.reminderTime ?? '09:30')),
                      )
                      : h('div', { className: 'msh-history' },
                        h('div', { className: 'msh-history-head' },
                          h('strong', null, historyFilter.length > 0 ? historyFilter : t('historyAll')),
                          historyFilter.length > 0
                            ? h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => setHistoryFilter('') }, t('clearFilter'))
                            : null,
                          h('button', { type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm', onClick: () => setHistoryVersion(value => value + 1) }, t('refresh')),
                        ),
                        h('p', { className: 'msh-note' }, t('historyHint')),
                        history.loading
                          ? h('div', { className: 'msh-empty' }, t('loading'))
                          : history.error !== null
                            ? h('div', { className: 'msh-empty' }, history.error)
                            : history.items.length === 0
                              ? h('div', { className: 'msh-empty' }, t('historyEmpty'))
                              : h('div', { className: 'msh-list' },
                                history.items.map(entry => h('article', { key: entry.id, className: 'msh-row' },
                                  h('div', { className: 'msh-row-head' },
                                    h('code', { className: 'msh-name' }, entry.name),
                                    h(Badge, { tone: entry.kind === 'rollback' ? 'warn' : 'muted' }, kindLabel(entry.kind)),
                                    h(Badge, { tone: 'muted' }, entry.by === 'agent' ? t('byAgent') : t('byUser')),
                                    entry.backupDir ? null : h(Badge, { tone: 'muted' }, t('noBackup')),
                                  ),
                                  h('div', { className: 'msh-meta' },
                                    h('span', null, fmtTime(entry.at)),
                                    h('span', null, `+${entry.added ?? 0} / -${entry.removed ?? 0}`),
                                    h('span', null, `${entry.beforeChars ?? 0} → ${entry.afterChars ?? 0}`),
                                  ),
                                  entry.summary ? h('p', { className: 'msh-desc' }, entry.summary) : null,
                                  h('div', { className: 'msh-row-actions' },
                                    h('button', {
                                      type: 'button', className: 'msh-btn msh-btn-ghost msh-btn-sm',
                                      onClick: () => openDiff(entry),
                                    }, t('viewDiff')),
                                    entry.backupDir
                                      ? h('button', {
                                        type: 'button',
                                        className: `msh-btn${rollbackConfirm === entry.id ? ' msh-btn-primary' : ''} msh-btn-sm`,
                                        disabled: rollingId !== '',
                                        onClick: () => runRollback(entry),
                                      }, rollingId === entry.id ? t('rollingBack') : rollbackConfirm === entry.id ? t('confirmRollback') : t('rollback'))
                                      : null,
                                  ),
                                )),
                              ),
                      ),
          ),
        ),
        editor !== null
          ? h(EditorModal, {
            editor,
            t,
            snippets,
            onChange: setEditorField,
            onClose: () => setEditor(null),
            onDiagnose: runDiagnose,
            onGenerate: runGenerate,
            onPreview: previewEditor,
            onApply: applyEditor,
            onMode: changeMode,
            onDiagnosisToggle: toggleDiagnosis,
            onDiagnosisAll: setDiagnosisAll,
          })
          : null,
        diffView !== null
          ? h(DiffModal, { view: diffView, t, onClose: () => setDiffView(null) })
          : null,
        paletteOpen
          ? h(CommandPalette, {
            t,
            skills,
            qualityMap,
            favorites,
            onClose: () => setPaletteOpen(false),
            onOpenEditor: openCustom,
            onOpenSkill: skill => {
              if (skill === null || skill === undefined) return
              setPaletteOpen(false)
              setQuery(skill.name)
              setTab('skills')
            },
          })
          : null,
      )
    }

    const CSS = `
.msh-page { height: 100%; overflow: auto; padding: 26px 28px 64px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); box-sizing: border-box; }
.msh-page *, .msh-page *::before, .msh-page *::after { box-sizing: border-box; }
.msh-inner { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.msh-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.msh-title { margin: 0; font-size: 20px; line-height: 28px; font-weight: 650; letter-spacing: 0.01em; }
.msh-subtitle { margin: 4px 0 0; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.msh-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.msh-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; line-height: 28px; cursor: pointer; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.msh-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.msh-btn:disabled { opacity: 0.55; cursor: default; }
.msh-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
.msh-btn-ghost { background: transparent; }
.msh-btn-sm { height: 26px; padding: 0 9px; font-size: 11.5px; line-height: 24px; }
.msh-banner { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--dsw-alias-border-l1); border-left: 3px solid var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 12px 14px; }
.msh-banner-warn { border-left-color: var(--dsw-alias-state-warn-primary); }
.msh-banner-icon { width: 22px; height: 22px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2); display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--dsw-alias-brand-primary); flex: none; }
.msh-banner-body { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; line-height: 18px; }
.msh-banner-body strong { font-size: 12.5px; }
.msh-banner-body span { color: var(--dsw-alias-label-secondary); }
.msh-toast { position: sticky; top: 0; z-index: 2; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-overlay); }
.msh-toast-ok { color: var(--dsw-alias-state-success-primary); }
.msh-toast-error { color: var(--dsw-alias-state-error-primary); }
.msh-toast-warn { color: var(--dsw-alias-state-warn-primary); }
.msh-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.msh-stat { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 12px 14px; }
.msh-stat-value { font-size: 22px; line-height: 28px; font-weight: 650; }
.msh-stat-warn { color: var(--dsw-alias-state-warn-primary); }
.msh-stat-accent { color: var(--dsw-alias-brand-primary); }
.msh-stat-label { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.msh-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 10px; }
.msh-tabs { display: flex; gap: 4px; }
.msh-tab { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); height: 30px; padding: 0 11px; border-radius: 8px; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.msh-tab:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.msh-tab-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
.msh-tab-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); font-size: 10.5px; line-height: 16px; text-align: center; }
.msh-filters { display: flex; align-items: center; gap: 10px; }
.msh-search { width: 220px; height: 30px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 12.5px; outline: none; }
.msh-search:focus { border-color: var(--dsw-alias-brand-primary); }
.msh-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.msh-list { display: flex; flex-direction: column; gap: 10px; }
.msh-row { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 13px 15px; display: flex; flex-direction: column; gap: 7px; }
.msh-row:hover { border-color: var(--dsw-alias-border-l2); }
.msh-row-dim { opacity: 0.62; }
.msh-row-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.msh-name { font-size: 13px; font-weight: 650; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.msh-repo { color: var(--dsw-alias-brand-primary); text-decoration: none; font-size: 13px; font-weight: 650; }
.msh-repo:hover { text-decoration: underline; }
.msh-desc { margin: 0; font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.msh-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.msh-meta b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.msh-path { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; opacity: 0.85; }
.msh-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.msh-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 18px; white-space: nowrap; }
.msh-chip-ok { color: var(--dsw-alias-state-success-primary); }
.msh-chip-warn { color: var(--dsw-alias-state-warn-primary); }
.msh-chip-accent { color: var(--dsw-alias-brand-primary); }
.msh-chip-agent { color: var(--dsw-alias-brand-primary); }
.msh-chip-user { color: var(--dsw-alias-label-primary); }
.msh-row-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.msh-select-line { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.msh-select { height: 28px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: 11.5px; padding: 0 8px; max-width: 420px; }
.msh-warn { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
.msh-empty { border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; padding: 26px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.msh-empty p { margin: 0 0 10px; }
.msh-about { display: flex; flex-direction: column; gap: 12px; font-size: 12.5px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.msh-about p { margin: 0; }
.msh-about-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 4px; }
.msh-about-grid > div { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.msh-about-grid b { color: var(--dsw-alias-label-primary); font-weight: 600; font-size: 12px; }
.msh-about-grid span { font-size: 11.5px; }
.msh-note { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 10px; font-size: 11.5px; }
.msh-icon-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.msh-modal-backdrop { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent); display: flex; align-items: center; justify-content: center; padding: 24px; }
.msh-modal { width: min(760px, 94vw); max-height: 88vh; overflow: auto; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 18px 50px rgba(0,0,0,0.28); }
.msh-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.msh-modal-head strong { font-size: 14px; }
.msh-modal-sub { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.msh-modal-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.msh-textarea { width: 100%; min-height: 260px; resize: vertical; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 18px; outline: none; }
.msh-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
.msh-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.msh-digest { display: flex; gap: 8px; font-size: 12px; line-height: 18px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 10px; color: var(--dsw-alias-label-secondary); }
.msh-digest b { color: var(--dsw-alias-brand-primary); font-weight: 600; white-space: nowrap; }
.msh-hint { flex: 1 1 260px; width: auto; }
.msh-history { display: flex; flex-direction: column; gap: 10px; }
.msh-history-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.msh-history-head strong { font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.msh-diff { margin: 0; max-height: 52vh; overflow: auto; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 17px; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-primary); }
.msh-icon-badge { position: absolute; top: -5px; right: -7px; min-width: 13px; height: 13px; padding: 0 3px; border-radius: 7px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-layer-1); font-size: 9px; line-height: 13px; font-weight: 700; text-align: center; }
/* --- roadmap additions: quality / pins / safety / projects / palette --- */
.msh-chip-error { color: var(--dsw-alias-state-error-primary); }
.msh-row-pinned { border-left: 3px solid var(--dsw-alias-brand-primary); }
.msh-star { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px; }
.msh-star:hover:not(:disabled) { color: var(--dsw-alias-state-warn-primary); }
.msh-star-on { color: var(--dsw-alias-state-warn-primary); }
.msh-quality { cursor: help; }
.msh-btn-fav { color: var(--dsw-alias-state-warn-primary); }
.msh-btn-danger { color: var(--dsw-alias-state-error-primary); }
.msh-btn-danger:hover:not(:disabled) { border-color: var(--dsw-alias-state-error-primary); }
.msh-stats-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.msh-panels { display: flex; flex-direction: column; gap: 12px; }
.msh-panel { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.msh-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.msh-panel-head strong { font-size: 12.5px; }
.msh-panel-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.msh-empty-sm { padding: 14px; }
.msh-note-inline { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.msh-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.msh-dir { flex: 1 1 320px; width: auto; }
.msh-input-num { width: 72px; height: 26px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: 11.5px; padding: 0 6px; }
.msh-bars { display: flex; flex-direction: column; gap: 6px; }
.msh-bar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.msh-bar-name { min-width: 120px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.msh-bar-track { flex: 1 1 auto; height: 7px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.msh-bar-fill { display: block; height: 100%; background: var(--dsw-alias-brand-primary); border-radius: 4px; }
.msh-bar-meta { min-width: 92px; text-align: right; color: var(--dsw-alias-label-secondary); }
.msh-errors { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
.msh-errors b { font-size: 11.5px; color: var(--dsw-alias-label-primary); }
.msh-validation-error { color: var(--dsw-alias-state-error-primary); }
.msh-validation-warn { color: var(--dsw-alias-state-warn-primary); }
.msh-validation { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px 10px; font-size: 11.5px; background: var(--dsw-alias-bg-layer-2); }
.msh-validation b { color: var(--dsw-alias-state-error-primary); }
.msh-diagnosis { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); border-radius: 8px; padding: 8px 10px; max-height: 220px; overflow: auto; }
.msh-diagnosis-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.msh-diagnosis-head b { margin-right: auto; }
.msh-diagnosis-item { display: flex; align-items: flex-start; gap: 6px; font-size: 11.5px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.msh-diagnosis-issue { color: var(--dsw-alias-label-primary); font-weight: 600; }
.msh-diagnosis-why { opacity: 0.9; }
.msh-diagnosis-fix { color: var(--dsw-alias-brand-primary); }
.msh-snippet-select { max-width: 300px; }
.msh-select-sm { height: 26px; font-size: 11px; }
.msh-chip-action { gap: 4px; padding-right: 3px; }
.msh-chip-x { appearance: none; border: 0; background: transparent; color: inherit; font-size: 11px; line-height: 1; cursor: pointer; padding: 0 3px; }
.msh-chip-x:hover { color: var(--dsw-alias-state-error-primary); }
.msh-summary { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; font-size: 11.5px; }
.msh-summary b { font-size: 11.5px; }
.msh-files { display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow: auto; }
.msh-file-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.msh-file-row code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msh-filters { flex-wrap: wrap; justify-content: flex-end; }
.msh-palette-backdrop { align-items: flex-start; padding-top: 12vh; }
.msh-palette { width: min(620px, 92vw); max-height: 70vh; display: flex; flex-direction: column; gap: 8px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.28); }
.msh-palette-input { width: 100%; height: 38px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: 13px; padding: 0 12px; outline: none; }
.msh-palette-input:focus { border-color: var(--dsw-alias-brand-primary); }
.msh-palette-list { display: flex; flex-direction: column; gap: 2px; overflow: auto; }
.msh-palette-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; cursor: pointer; font-size: 12px; }
.msh-palette-item-active { background: var(--dsw-alias-bg-layer-2); }
.msh-palette-item code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 600; }
.msh-palette-meta { font-size: 10.5px; color: var(--dsw-alias-brand-primary); }
.msh-palette-desc { flex: 1 1 auto; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msh-palette-empty { padding: 18px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.msh-palette-foot { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.msh-palette-foot span { margin-right: auto; }
@media (max-width: 720px) {
  .msh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .msh-stats-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .msh-page { padding: 18px 14px 48px; }
  .msh-about-grid { grid-template-columns: 1fr; }
  .msh-search { width: 150px; }
  .msh-filters { justify-content: flex-start; }
}
`

    function apply(ctx) {
      const locale = ctx.locale
      const t = locale.bind(NS)
      try {
        ctx.effect(() => locale.register(NS, { zh, en }), 'manju-skill-hub: dictionaries')
      } catch (error) {
        console.warn('[manju-skill-hub] locale registration failed:', error)
      }
      // One document-level stylesheet owned by this plugin: the sidebar icon
      // needs its badge style even while the page is not mounted.
      try {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.manjuSkillHub = 'styles'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'manju-skill-hub: styles')
      } catch (error) {
        console.warn('[manju-skill-hub] style registration failed:', error)
      }
      const props = () => ({ t, locale })
      try {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 2,
          label: () => t('nav'),
          locale: NS,
          inject: props,
        }, HubIcon))
      } catch (error) {
        console.warn('[manju-skill-hub] sidebar.panellist registration failed:', error)
      }
      try {
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: props,
        }, HubPage))
      } catch (error) {
        console.warn('[manju-skill-hub] main registration failed:', error)
      }
    }

    return { inject, apply }
  },
})
