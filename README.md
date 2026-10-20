# 漫剧技能中枢 · Manju Skill Hub

一个 DSH（DeepSeek Harness）插件，给 AI 漫剧 / 短剧项目做技能总控：

- **本机技能全览**：从 Harness 的 `skills` 服务与 `$DSH_HOME/skills` 读取全部已安装技能，
  解析每个 `SKILL.md` 的介绍、版本、标签、`agent_created`、更新时间、安装时间与路径，
  并筛出漫剧相关技能。
- **是否更新 / 由谁更新**：把技能与 GitHub 上游仓库关联，比较上游最近提交与本机安装时间，
  标出「可更新 / 已是最新 / 未检查」；同时显示更新者（智能体 / 本人 / 未知）。
- **GitHub 探员**：按计划（默认每天 09:30）用 GitHub 搜索接口找开源 short-drama / manju
  skill，做关键词相关性评分，并逐个仓库校验确实存在 `SKILL.md`，才列入「待确认安装」。
- **每日提醒**：侧边栏图标显示待确认数量角标；页面顶部有今日提醒横幅；系统提示词里也会
  带入当天提醒，智能体可据此主动询问是否安装。
- **安装 / 忽略**：在页面里二次确认后安装到 `$DSH_HOME/skills/<name>`（同名目录不覆盖），
  或忽略某条发现；智能体通过 `manju_skill_hub` 工具读取同一份数据，安装必须用户明确确认。
- **本地文件直达**：每个技能下方有「打开目录」「打开 SKILL.md」「复制路径」；
  顶部有「打开技能目录」，已安装仓库有「打开已装目录」。用系统文件管理器直接定位，
  路径由 Host 校验必须位于技能目录内。
- **一键更新**：可更新的技能会出现「更新到最新」，二次确认后从 GitHub 拉取上游最新
  版本，**先把整目录备份到 `$DSH_HOME/manju-skill-hub/backups/<技能名>-<类型>-<时间>`**，再原子替换；
  右上角「全部更新」逐个处理所有可更新技能。失败会保留旧版本，不丢文件。
- **自定义更新**：每个技能卡片的「自定义更新」打开编辑弹窗，粘贴你的文案 → 选择
  「追加受管小节」（默认，写进一个可重复替换的「自定义补充」块）或「整篇替换」→ 应用。
  写入前整目录备份；追加模式重复应用只会替换那个小节，不会越堆越多。
- **编辑预览与片段**：编辑器里可「预览差异」先看应用后的 diff 与校验结果（不落盘），
  也可从「片段」库一键插入常用硬规则。
- **思考模式 2.0**：先让默认模型「诊断」出问题清单，勾选后「生成」建议内容，结果填进同一个
  编辑弹窗；生成不等于落盘，仍需你确认后应用。
- **变更历史与回滚**：安装 / 上游更新 / 自定义更新都会记录一条历史（时间、操作者、
  +/- 行数、diff 文件），「变更历史」页可以查看差异，并一键回滚到任意一次备份；
  回滚前会再给当前版本做一次安全备份，回滚本身也进历史。
- **数据安全**：备份统计、按技能保留最新 N 份的清理（支持预演）、备份完整性检查、
  立即快照、整库导出/导入、先备份再回收技能。
- **更新策略**：pin / unpin 锁定技能版本（自动更新会跳过），可选的每日自动更新（默认关闭），
  版本比较与上游仓库状态探测。
- **质量体检**：引用缺失检查、健康分（A/B/C/D）、生产阶段识别、重名 / 同描述技能检测。
- **片段库与项目工作台**：保存可复用规则片段；把项目目录与本机技能绑定，检查目录、交付物
  与命名缺口。
- **体验与诊断**：收藏与阶段 / 来源 / 更新状态筛选、`Ctrl/Cmd + K` 命令面板、免打扰、
  只读运行诊断（备份占用、state 大小、最近错误等）。

## 快捷操作

| 位置 | 按钮 / 操作 | 行为 |
| --- | --- | --- |
| 顶部 | 打开技能目录 | 资源管理器打开 `$DSH_HOME/skills` |
| 顶部 | `Ctrl / Cmd + K` | 打开命令面板，搜索技能，回车打开编辑器 |
| 每个技能 | 打开目录 | 打开该技能文件夹 |
| 每个技能 | 打开 SKILL.md | 打开所在文件夹并选中 `SKILL.md` |
| 每个技能 | 复制路径 | 复制技能文件夹绝对路径 |
| 每个技能 | ☆ / ★ | 收藏 / 取消收藏（只影响本机筛选） |
| 每个技能（可更新） | 更新到最新 | 从上游拉取最新版（先备份，二次确认） |
| 每个技能 | 自定义更新 | 弹窗编辑：追加受管小节 / 整篇替换（先备份） |
| 编辑弹窗 | 插入片段 | 从片段库插入到光标处 |
| 编辑弹窗 | 预览差异 | 只读预览应用后的 diff 与校验结果 |
| 编辑弹窗 | 诊断 → 生成 | 模型先列问题清单，勾选后再生成建议内容 |
| 每个技能 | 思考模式 | 让默认模型阅读技能并给出可编辑的更新建议 |
| 每个技能 | 变更历史 | 打开该技能的变更记录（可看差异、回滚） |
| 每个技能 | 回收 | 先整目录备份，再删除技能目录并移除清单记录 |
| 顶部（有更新时） | 全部更新 | 逐个更新所有可更新技能 |
| GitHub 发现（已装） | 打开已装目录 | 打开该仓库首个已安装技能的文件夹 |
| 项目 | 新建 / 绑定 / 项目体检 / 打开目录 | 见「项目工作台」 |
| 备份与诊断 | 预演清理 / 确认清理 / 立即快照 / 导出 / 导入 | 见「备份与诊断」 |
| 探员设置 | 打开备份目录 | 打开 `$DSH_HOME/manju-skill-hub/backups` |

## 安装

1. 克隆本仓库到任意本地目录：

```bash
git clone https://github.com/whui5041-cloud/DSH-manjuhub.git
cd DSH-manjuhub
```

2. 在 DSH 里用 Plugin Manager 以本地目录安装本包：

```
plugin_manager install_bundle  target = <克隆目录的绝对路径>
```

或把本目录链接进 profile 后重启。安装后刷新 Web 页面，侧边栏会出现「漫剧技能中枢」图标。

> 注意：开源版包名是 `manju-skill-hub`（不带 `@local/` 前缀）。如果你之前装过开发版 `@local/manju-skill-hub`，请先卸载旧版再安装，避免两个同名面板同时加载。

## 配置（可选）

bundle patch 里已经给了默认值，改 `cordis.patch.yml` 的 `config` 即可：

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `reminderTime` | `09:30` | 每日提醒 / 巡检 / 自动更新的时间（本机时区） |
| `remindOnBoot` | `true` | 启动后补一次当天提醒（已提醒过则跳过） |
| `githubMinIntervalHours` | `6` | 两次 GitHub 巡检的最小间隔 |
| `verifyReposPerRun` | `10` | 每次最多校验多少个候选仓库的 `SKILL.md` |
| `updateCheckPerRun` | `15` | 每次更新检查最多读取多少个上游仓库 |
| `thinkMaxInputChars` | `90000` | 思考 / 诊断模式最多把多少字符的 SKILL.md 发给模型（超出会截断并提示） |
| `domainOnly` | `true` | 页面默认只看漫剧相关技能 |
| `queries` | 内置 7 条 | 覆盖 GitHub 搜索词 |

自动更新开关、免打扰截止时间、pin、收藏、片段、项目等都存在 `state.json` 里（见「数据」），
不是 `cordis.patch.yml` 配置项。

GitHub 令牌（可选，强烈建议）：设置环境变量 `GITHUB_TOKEN`（或 `GH_TOKEN` / `GITHUB_PAT`）。
未配置时 GitHub 每小时只允许 60 次 API 调用，探员会自动降速并在页面提示。

## 智能体工具

`manju_skill_hub`（一个工具，多 action；写操作必须在用户明确确认后传 `confirm=true`）：

| action | 参数 | 行为 |
| --- | --- | --- |
| `overview` | `scope=domain\|all` | 本机技能清单（介绍 / 版本 / 更新状态 / 更新者） |
| `summary` | — | 精简统计 JSON（待安装 / 可更新 / 提醒） |
| `quality` | — | 健康分、阶段、引用缺失、疑似重复组 |
| `diagnostics` | — | 只读运行诊断 JSON（备份、state、最近错误、免打扰） |
| `projects` | — | 项目工作台列表（名称 / 路径 / 绑定技能数） |
| `discover` | `force=true` 忽略最小间隔 | 立刻去 GitHub 找开源 skill |
| `check_updates` | — | 复查上游更新 |
| `install` | `target`（`gh:owner/repo`）、`skill_path`、`confirm=true` | 安装一个技能 |
| `read_skill` | `target`（技能名） | 读取完整 `SKILL.md`，供智能体分析 |
| `custom_update` | `target`、`text`、`mode=append\|replace`、`position=end\|top`、`confirm=true` | 把文案融合进技能 |
| `update` | `target`、`confirm=true` | 把单个技能更新到上游最新 |
| `update_all` | `confirm=true` | 批量更新全部可更新技能 |
| `pin` / `unpin` | `target`（技能名） | 锁定 / 解锁版本（自动更新会跳过 pinned） |
| `history` | 可选 `target` | 查看最近变更记录 |
| `rollback` | `id`（或 `target`）、`confirm=true` | 回滚到某条历史记录 |
| `ignore` / `unignore` | `target`（发现 id） | 忽略 / 恢复某条发现 |
| `reminder` | — | 立即生成今日提醒 |

以下能力只在 Web 界面 / HTTP 接口提供，**没有**对应的工具 action：备份清理、快照、整库
导出 / 导入、回收技能、自动更新开关、免打扰、收藏筛选、编辑预览、诊断式生成、项目增删 /
绑定 / 体检、片段保存 / 删除、上游仓库状态探测。

## HTTP 接口

前缀 `/api/manju-skill-hub`，只允许本机回环访问；所有写操作要求同源，且多数需要
`confirm=true`（见下表）。读接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/overview?all=1` | 全量清单与发现；不带 `all=1` 时按 `domainOnly` 过滤 |
| GET | `/summary` | 精简统计 |
| GET | `/skill?name=<技能名>` | 读取 `SKILL.md`（最多 20 万字符） |
| GET | `/history?name=<技能名>` | 变更记录 |
| GET | `/diff?id=<历史 id>` | 某条记录的 diff |
| GET | `/safety` | 备份数量、占用、按技能分布 |
| GET | `/diagnostics` | 运行诊断 + 最近错误 + 免打扰 + UI 偏好 |
| GET | `/quality` | 每个技能的分数 / 等级 / 阶段 / 缺失引用 / signals / pinned |
| GET | `/projects` | 项目列表 |
| GET | `/projects/summary?name=<项目名或 id>` | 单项目体检 |
| GET | `/snippets` | 片段列表（为空时先写入默认 3 条） |
| GET | `/ui` | 收藏等 UI 偏好 |
| POST | `/action` | 统一写入口，`action` 见下表 |

`POST /action` 的 `action` 值：

| 分类 | action |
| --- | --- |
| 本地 / 探员 | `open`、`refresh`、`discover`、`check_updates` |
| 备份与数据 | `prune_backups`、`snapshot`、`export`、`import`、`recycle`（后两者需 `confirm`） |
| 策略 | `pin`、`unpin`、`auto_update`、`mute`、`ui` |
| 编辑增强 | `preview`、`think`、`think_diagnose` |
| 项目 | `project_add`、`project_remove`、`bind`、`unbind`、`open_project`、`project_summary` |
| 片段 | `snippet_save`、`snippet_remove` |
| 体检 | `health_check`（探测上游仓库，联网） |
| 安装 / 更新 | `install`、`update`、`update_all`、`custom_update`、`rollback`（均需 `confirm`） |
| 其他 | `ignore`、`unignore` |

## 数据

- 状态：`$DSH_HOME/manju-skill-hub/state.json`（原子写入）。基础字段是
  `skills` / `discoveries` / `installs` / `meta` / `reminder`；插件启动或使用后会写入
  `settings` / `pins` / `ui` / `projects` / `snippets` / `history` / `edits`。
- 备份：`$DSH_HOME/manju-skill-hub/backups/<技能名>-<类型>-<时间>`，类型包括
  `custom` / `update` / `rollback` / `pre-rollback` / `snapshot` / `recycle` /
  `import` / `manual` 等；旧版 `upgrade` 生成的无类型备份也会被统计。
- 变更 diff：`$DSH_HOME/manju-skill-hub/history/<id>.diff`。
- 整库导出：默认 `$DSH_HOME/manju-skill-hub/exports/export-<id>`（也可指定目录），
  内含 `manifest.json`、`README.txt` 与 `skills/<技能名>/`。
- 技能目录：`$DSH_HOME/skills/`。

## 备份与诊断

- **自动备份**：上游更新、自定义写入、回滚、回收之前都会把整个技能目录复制到
  `backups/`（安装没有旧版本，不产生备份）。回滚前还会给当前版本再做一次安全备份。
- **统计**：`backupStats` 递归统计备份数量、总占用与按技能分布；`verifyBackupDir`
  检查目录是否存在、是否含 `SKILL.md`、文件数与字节数。
- **清理**：`pruneBackups` 按技能只保留最新 N 份（默认 5，最小 1），**每个技能的最新一份
  永远保留**；还支持总占用上限（默认 2 GB，超出后从最旧的、非「每技能最新」的备份开始删）。
  `dryRun` 只预演不删除，页面会显示「将删除 / 释放 / 保留」。
- **快照**：`createSnapshot` 把选定技能（默认最多 30 个）复制到
  `backups/<技能名>-snapshot-<毫秒时间>`。
- **整库导出**：复制每个技能目录到 `<目标>/skills/<技能名>/`，写 `manifest.json`
  （名称 / 版本 / 来源仓库 / 描述 / 更新时间）与 `README.txt` 恢复说明。导出目录不能位于
  技能目录内。
- **整库导入**：读取 `<来源>/skills/<技能名>/SKILL.md`，默认**跳过已存在的同名技能**，
  不覆盖本机版本；只复制含 `SKILL.md` 的目录。
- **回收**：先整目录备份（`recycle`），再删除技能目录并从 state 移除记录；之后可用备份或
  导出的目录恢复。
- **运行诊断**：只读，不修改文件。显示技能 / 待装 / 可更新 / 历史 / 备份数量、
  `state.json` 大小、技能目录是否存在、最近错误与免打扰状态。
- **免打扰**：设置截止时间后，今日提醒横幅与系统提示词里的提醒会被抑制；GitHub 巡检、
  更新检查照常进行。

## pin 与自动更新

- **pin / unpin**：`pin` 记录技能名、版本、上游仓库与时间；pinned 技能会从
  `autoUpdateCandidates` 中排除，但**手动**「更新到最新」仍然可用。
- **自动更新**：默认关闭，在页面或 `POST /action {action:"auto_update", enabled:true}`
  显式开启。开启后只在每日定时任务（`reminderTime`）里执行：先发提醒，再对
  `autoUpdateCandidates(state)` 的前 10 个技能逐个调用与手动更新相同的「先备份再替换」流程；
  单个失败不阻塞其余技能。**不会**在启动时自动更新。
- **候选条件**：`update.available === true`、未被 pin、不在排除列表
  （`settings.autoUpdateExclude`）里。
- **版本比较**：`compareVersions` 支持 `v` 前缀、三段数字、构建元数据与预发布后缀；
  缺省 / 非数字按 `0.0.0` 处理，正式版高于同号预发布版。当前「是否可更新」仍以
  上游 `pushed_at` 与安装时间比较出的 `update.available` 为准，不靠版本号比较决定。
- **上游状态探测**（HTTP `health_check`，联网）：对已知仓库查询归档 / 禁用状态与最近推送，
  并返回 GitHub 预览地址；需要仓库已关联，且受 GitHub 限额影响。

## 质量体检

全部为只读、确定性检查，不发网络请求（`health_check` 除外）：

- **引用检查**：`referenceCheck` 解析 `SKILL.md` 里的 Markdown 链接与裸 `references/...`
  路径，逐个检查本地文件是否存在；跳过外链、锚点、绝对路径与技能目录之外的路径。
  最多检查 200 个引用，缺失最多列 50 个。
- **健康分**：`healthScore` 权重合计 100 —— 有可读 `SKILL.md` 20、frontmatter 含
  `name` + `description` 15、引用完整 20、有版本号 10、30 天内更新过 10、
  关联上游仓库 10、状态正常（非 `pending` / `stale`）15。
  等级：A ≥ 90，B ≥ 75，C ≥ 60，D < 60。
- **阶段识别**：`stageOf` 按名称 / 描述 / `when_to_use` / 标签里的关键词打分，
  归为 `script`（剧本）、`storyboard`（分镜）、`asset`（资产）、`feed`（投喂）、
  `qc`（质检）、`publish`（发布）或 `other`（其他）；名称命中权重 3，正文命中 1。
- **重名 / 同质**：`dedupeGroups` 先归一化名称（去 `sd-` / `dsh-` 前缀、
  `engine` / `skill` / `引擎` / `技能` 后缀、分隔符），再对描述做 token Jaccard
  相似度；归一化同名或相似度 > 0.6 的技能归为一组，结果只作提示。

## 片段库

- 内置 3 条漫剧生产硬规则：15 秒分段、台词音色标注、上线审核红线。
- 只在 `state.snippets` 为空时写入，之后完全由用户维护；片段存在 `state.json`，
  不联网、不跨机器同步。
- 编辑弹窗里「插入片段」把内容插到光标处；片段标题上限 120 字、正文上限 20000 字、
  标签最多 12 个。
- 模块支持新建、更新（同一 `id`）、删除，以及按标题 / 正文 / 标签过滤
  （`listSnippets(state, query)`）；界面以列表选择为主，没有变量替换或模板渲染。

## 项目工作台

- **新建项目**：填项目名与目录绝对路径；同名路径不能重复添加，名称不能为空。
- **绑定技能**：从本机技能里选；绑定只存技能名，解绑不影响技能文件。
- **项目体检**：检查目录是否存在、绑定技能是否仍在本机、顶层交付物列表（最多 50 个，
  目录在前）与命名提示。
- 命名提示按文件名识别 `script-*` / `storyboard-*` / `assets-*` / `feed-*` / `qc-*`
  这类前缀（中英文均可），缺哪类就提示补哪类；目录为空、技能缺失、目录不存在都会
  给出警告。
- 「打开目录」在系统文件管理器里定位项目目录；「删除项目」只移除绑定，不删除目录。
- 项目路径存绝对路径；移动项目目录后需要重新添加。

## 体验与命令面板

- **六个页签**：本机技能、GitHub 发现、项目、变更历史、备份与诊断、探员设置。
- **命令面板**：`Ctrl / Cmd + K` 打开，按名称 / 描述搜索技能，显示健康等级、分数与收藏标记；
  上下键选择，回车打开编辑弹窗，Esc 关闭。
- **筛选与收藏**：关键词搜索、只看收藏、只看可更新、按阶段 / 来源 / 更新状态筛选；
  收藏保存在 `state.ui.favorites`。
- **技能行**：健康徽章（含缺失引用提示）、阶段徽章、pin 星标、收藏、回收、
  打开目录 / SKILL.md、复制路径、自定义更新、思考模式、变更历史。
- **编辑器**：追加受管小节 / 整篇替换、片段插入、预览差异（含校验结果）、
  诊断 → 勾选问题 → 生成；应用前先备份。
- **诊断面板**：备份数量 / 占用 / 按技能分布、清理预演与执行、立即快照、导出 / 导入、
  运行诊断、免打扰设置。

## 自检

```powershell
# 语法检查
node --check index.js
node --check client.js
Get-ChildItem lib/*.js | ForEach-Object { node --check $_.FullName }

# 新增模块的离线测试（临时目录，不碰真实技能目录，不联网）
node test/roadmap.mjs

# 原有 smoke 测试（含真实 GitHub 探测；MSH_SKIP_NETWORK=1 可跳过联网部分）
node test/smoke.mjs
```

`test/roadmap.mjs` 覆盖：备份统计 / 按技能保留最新 N 份 / 完整性检查 / 快照 / 导出导入、
pin 与自动更新候选 / 版本比较、引用检查 / 健康分分档 / 阶段 / 重名检测、
项目新建绑定体检、片段增删改查与默认片段、追加与替换预览校验、GitHub / Gitee / GitLab
仓库地址解析。

## 边界与已知限制

- 探员是确定性的关键词 + 仓库校验流程，不做模型级语义评估；需要深入评估时由当前智能体
  调用工具接手。
- 「可更新」基于上游 `pushed_at` 与安装时间比较，属于提醒信号，不代表本机版本一定落后；
  自动更新也不比较版本号。
- 自动更新是「每日定时任务里的前 10 个候选」，没有逐技能计划、没有自动回滚；
  失败只记录，不会重试。
- pin 是本机状态，只影响自动更新候选；不会阻止手动更新，也不会向上游声明版本。
- 健康分、阶段、重名检测都是本地静态启发式：引用检查只看 Markdown 链接与裸
  `references/` 路径（HTML、图片标签、远程链接不查），阶段靠关键词，重名可能误报。
  分数用于排序与提示，不是对技能质量的权威评价。
- 备份清理只保证「每个技能最新一份」不被删；总占用上限按删除时的文件大小估算，
  不包含删除失败的目录。
- 整库导出是目录复制，不是单文件压缩包；导入只认 `<来源>/skills/<名称>/SKILL.md`，
  默认跳过同名技能，不做版本冲突合并。
- 回收会删除技能目录（备份仍保留）；恢复需要手动导入或复制备份，界面没有「一键还原回收」。
- 项目体检只看顶层文件（最多 50 个），命名提示只看文件名模式，不校验文件内容；
  项目路径是绝对路径，移动目录后失效。
- 片段库只存在本机 `state.json`，没有云同步、变量替换或模板渲染。
- 诊断只读取本插件自己的 state 与目录信息，不抓取宿主日志；「最近错误」来自
  `state.meta` 里已记录的错误（例如 GitHub 巡检失败）。
- Gitee / GitLab 只在 `lib/sources.js` 里做地址解析与归档地址生成（`parseSource` /
  `tarballUrl` / `webUrl`）；探员、安装、更新仍只走 GitHub，尚未接入这两个平台。
- 安装只支持带 `SKILL.md` 的仓库；安装后需新会话才能被技能目录完整识别。
- HTTP 接口仅限本机回环与同源请求；没有额外的账号 / 令牌鉴权。

## 贡献

- 本仓库是一个 DSH（DeepSeek Harness）插件：`index.js` 是 Host 半（工具、定时任务、HTTP 路由），
  `client.js` 是 Web 半（侧边栏面板），`lib/` 是纯函数模块，`test/` 是离线自检。
- 提交前请运行「自检」里的命令，保证 `node --check` 与 `test/roadmap.mjs` 通过。
- 改动 state 结构时请同步更新 `README.md` 的「数据」章节；改动配置项时同步更新「配置」表。
- 不提交 `state.json`、`backups/`、`history/`、`exports/` 与任何含个人路径 / 令牌的文件（`.gitignore` 已覆盖）。
- 提交信息用一句话说清「改了什么 + 为什么」，中英文均可。

## 许可

本项目以 [MIT License](./LICENSE) 开源。

欢迎基于它改造自己的漫剧技能总控，也欢迎把更好的漫剧技能仓库通过探员发现出来。

