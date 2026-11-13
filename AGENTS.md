# AI / Agent 协作规约（ctk-system）

本文件是本仓库内 AI / Agent 的协作规约。项目概览见 [README.md](README.md)；本文件记录执行任务时必须遵守的边界、架构约定和验收规则。

## 1. 工作原则

1. **先看代码再下结论。** 区分「已验证行为」「已实现代码」「业务要求」「待确认方案」四种状态，不凭页面名称或旧文档推断业务规则。
2. **只读为默认。** 回答/排查/评审默认只读；远程部署、远程重启、数据库写入、业务单据保存/提交/审核/删除和 `git push` 都需要用户明确授权。
3. **保护工作区。** 开始任务先 `git status --short` 识别已有修改；不覆盖、回退或整理无关改动；不用 `git reset --hard` / `git checkout --` 覆盖用户修改。
4. **保护秘密。** 不在回复、日志、脚本、SQL、截图或提交中输出数据库密码、ERP AppSecret、Token、JWT secret、企业微信密钥等私密值；集成配置只核对键是否存在，不输出值。
5. **破坏性操作可恢复。** 删除或迁移文件前确认精确目标，优先可恢复方式。

## 2. 架构事实

- Nuxt 4 + Nitro 单体全栈应用：页面在 `app/pages/`（业务页在 `tk_custom/`），API 路由在 `server/routes/prod-api/`，服务端工具在 `server/utils/`（按 `<domain>-read.ts` / `<domain>-write.ts` 等组织），前端通用工具在 `app/utils/helpers.ts`。不存在独立的 Java 后端目录，不要引用旧路径 `frontend/` 或 `app/views/`。
- 公共包：`app/packages/{api,composables,shared,ui}`，导入名 `@ctk-system/*`；`app/api/tk_custom/` 是兼容导入路径的薄 re-export 层。
- SQL 资产统一在 `db/sql/`；`logs/`、`outputs/`、`output/`、`.nuxt/`、`.output/` 是构建或运行产物，不作为源码处理。
- 涉及路由、菜单、权限、接口或数据库字段的改动，必须同步检查前端、Nitro 路由和 SQL 三层，不要只改其中一层。

## 3. 流程与验证

### 调查顺序

1. `git status --short` 和 `git diff -- <path>` 识别已有改动
2. `rg --files` / 读源码定位实现，不凭文件名猜
3. 改动前确认调用链：页面 → API → Nitro Route → MySQL / 外部集成

### 验证命令

```powershell
bun run test          # Vitest 全量单元测试
bun run lint          # 轻量 eslint（0 error 为准；警告不阻塞，见 eslint.config.mjs）
bun run check:sql     # 迁移目录规约：顶层不许出 DML、schema/ 不许出 DML、文件名要 YYYYMMDD_描述.sql
git diff --check      # 空白错误检查
```

按风险选命令，不必全跑；但认证、路由、API、服务端公共模块或数据库改动要补对应测试。测试失败要记录失败用例与原因，判断是既有基线问题还是本次引入——不用「其他都通过」掩盖失败。验证依赖真实账号、外部 ERP 或生产网络时，明确标注未验证边界。

测试环境约定（`vitest.config.js`）：默认 `node` 环境，只有需要 DOM 的 spec 在**文件首行**写 `// @vitest-environment happy-dom`（如部分需要挂载组件的 spec）；测试进程时区固定 `Asia/Shanghai`，因为导出类代码用本地时区还原 `mysql2` 返回的 `Date`，而 CI runner 默认是 UTC——不固定会导致时区偏移假红。写新 spec 别依赖真实机器时钟/随机数，需要时使用 `vi.useFakeTimers()` 或注入固定值。

### 本地开发环境

- 根目录 `bun run dev` 启动（Bun 直接加载被忽略的 `local.env`；`5173` 端口被占用时先停止占用进程，不自动清理端口）。
- 进程外状态（会话、验证码、登录失败锁、写请求幂等键）统一存在 MySQL 的 `sys_cache` 表，实现见 `server/utils/redis.ts`。登录、验证码异常时先查 MySQL 连接和 `sys_cache` 表，再查业务代码。
- **会话有两把键，撤销必须两把都删**：`saveAuthSession()` 同时写 `auth_sessions:<tokenId>` 与兼容副本 `login_tokens:<tokenId>`，而 `getAuthSession()` 在主键缺失时会回退读兼容副本（`normalizeLegacySession`）。只删除 `auth_sessions:*` 会话依然有效，看起来像「改权限/踢人没生效」——代码侧统一用 `deleteAuthSession()`，手工清理两个前缀都要删。
- **列表页查询统一走 `useTkListQuery`**（`app/packages/composables/useTkListQuery.js`）：返回 `loading/list/total/error/getList/handleQuery/resetQuery`，内部保证「并发只认最后一次响应」与「`code` 非 200 时保留旧数据并记 `error`，不抛错」。页面保留自己的失败提示（`watch(error)` 弹 toast 或渲染错误条）。`queryParams` 用 `ref`，脚本里取用一律 `.value`（模板自动解包）。树形列表（如 `system/dept` 用 `response.data` + `proxy.handleTree`）没有 `rows/total`，不适用。
- `getGarnet()` 是 `sys_cache` 客户端的兼容别名（历史命名），新代码请用 `getCache()`。
- 新增配置键同步更新 `local.env.example`（只放占位符，不放真实值）。
- 日常开发和页面验收禁止生产构建 `bun run build`，只有明确发布/部署任务才执行。

### 修改后的生效方式

| 修改范围 | 生效方式 |
| --- | --- |
| Vue / JS / CSS / packages | Vite HMR 自动生效，未生效刷新页面 |
| Nitro routes / utils / plugins | 开发服务器自动热重载，观察日志确认编译成功 |
| 动态路由 / 权限 middleware / store | 刷新页面，必要时重新登录 |
| `nuxt.config.ts` / 依赖 / 启动脚本 | 重启 `bun run dev` |
| SQL / 菜单 / 字典 / 系统配置 | 导入 SQL 并清 `sys_cache` 里的会话（菜单、配置、Token），重新登录 |

完成任务时说明实际跑过的验证、未验证的外部依赖、是否需要重启；不代替用户做重启或部署决定。

## 4. 前端与服务端规约

### API 分层

- 新增 `tk_custom` 接口走标准链路（见 [README.md](README.md)），复杂逻辑放 `server/utils/`，路由保持薄。
- 页面继续从 `@/api/tk_custom/...` 导入；不在薄包装里重建 `request`、复制 Token 处理或写第二套错误拦截器。
- `app/utils/request.js` 是兼容原有请求签名的 `$fetch` 适配层，作为唯一前端请求入口。
- `auth.js`、Pinia store、登录流程、权限 middleware 留在 `app/`，不为「公共化」强行搬进 `packages/`。

### UI 和列表

- 新页面用 Nuxt UI v4 或原生 Tailwind，不新增 Element Plus；旧页面重构逐步替换，不为小改动扩大迁移范围。
- 列表优先组合 `useTkListQuery` / `useTkRowInteraction` + `@ctk-system/ui` 组件；业务列和领域交互留在页面。
- 行交互默认：单击选中、再击取消、双击打开；复选框、操作列、指定忽略列不触发打开；主键非 `id` 时显式传 `getRowId`。
- `TkUTable` 绑 `v-model:row-selection` 不会自动渲染复选框列，必须手动加 `id: 'select'` 列（`header`/`cell` 用 `UCheckbox` 接 `table.toggleAllPageRowsSelected` / `row.toggleSelected`）；双击打开走表格的 `@row-open`，`useTkRowInteraction` 的 `onRowOpen` 在 `TkUTable` 体系下无人调用、不要当作接线。
- 日期范围直接用 `UPopover + <UCalendar range :number-of-months="2">`（值保持 `['YYYY-MM-DD','YYYY-MM-DD']`，datetime 口径 `00:00:00` / `23:59:59`），字符串与 `CalendarDate` 转换及今天/近 7 天等预设走 `@/packages/shared/dateRange`；单日用 `UPopover + <UCalendar>` 或 `UInputDate`；**不再新建 `TkDate*` 日期封装组件**，不给裸控件写 Element Plus 的 `type`/`value-format`。
- 不存在 `UTimeline`，时间线用 Tailwind HTML 写；后台布局限制溢出时，业务页最外层用 `absolute inset-0 overflow-y-auto` 保证子页可滚动。

## 5. 数据库与外部集成

### 数据链路（两条，勿混）

- **ERP WebAPI**（`server/utils/k3.ts`）：库存、单据、需 WebAPI 认证的写操作。
- **SQL Server 直连**（`server/utils/sqlserver.ts`）：工序计划、生产质量、产量/在制查询。
- 排查问题先判断走哪条链路；不用 WebAPI 成功替代 SQL Server 结果，反之亦然。
- 写操作必须用已确认的 FormId、字段和单据状态；检查完整响应、单据号和最终状态。

### SQL 与 MySQL

- 迁移文件统一放 `db/sql/`；**新文件按用途分目录**：结构变更 → `db/sql/schema/YYYYMMDD_描述.sql`，数据初始化/修正（含 INSERT/UPDATE/DELETE）→ `db/sql/data/YYYYMMDD_描述.sql`。
- 改动前跑 `bun run check:sql`（`tools/check-sql-migration-layout.mjs`）：`db/sql/` 顶层出现数据变更、`schema/` 里出现 DML、或文件名不合 `YYYYMMDD_描述.sql` 都会直接失败。
- 中文 SQL 不经 PowerShell 管道直接喂给 `mysql`；使用 UTF-8 无 BOM 文件导入或标准数据库客户端工具执行。
- 任何保存/提交/审核/删除/批量修正先读当前状态、确认影响范围和幂等条件；禁止盲目重试写请求。
- SQL Server 查询基于实际表字段和已确认的时间/状态条件；「查不到」≠「没有」，超时、配置为空、权限失败分别说明。
- 变更 `sys_menu` / `sys_config` / `sys_job` 后刷新 `sys_cache` 中对应缓存并重新登录。

### 外部单据写入安全

- 「已实现」≠ 生产账套写入已验证。涉及真实外部 ERP 写入单独记录环境、单据号、状态和回滚方案。
- 库存查询失败和无库存是两回事，不能用空结果继续决策。
- 销售出库物料不匹配时禁止硬编码物料映射；必须记录来源/目标物料、仓库、批次、数量和业务原因，转换需业务确认，出库前核对转换单状态和目标库存。

## 6. 部署与远程操作

- 未经明确要求不执行生产部署、远程重启、远程数据库写入、隧道变更或 `git push`。
- `bun run deploy` 前核对根目录 `deploy.config.json`（覆盖 `deploy.js` 默认目标）：确认服务器、目录和服务名指向预期环境。
- 生产由 `nuxt-ssr`（Bun/Nitro）+ MySQL 承载。部署后等服务就绪再验收。
- 生产验收不看 HTTP 200 就收工：认证要重新登录访问真实业务 API；外部集成核对真实返回数据。无法验证时明确标记未完成。

## 7. 持续沉淀项目经验

完成非琐碎任务后，检查本次是否产生了值得复用的已验证流程、排错方法，或用户明确纠正的项目约定。若有：
- 先检查 `.agents/skills/` 中是否已有相关技能；优先精简更新已有技能，避免重复创建。
- 没有合适技能时，在 `.agents/skills/<kebab-case-name>/SKILL.md` 新建项目技能；写清触发场景、可复用步骤、易错点和验证方式，较长细节放 `references/`。
- 只沉淀可迁移到后续同类任务的经验，不记对话流水账、临时结论、未经验证的猜测或一次性结果；保留本文件既有的业务边界和安全要求。
- 涉及凭据、真实业务数据或生产环境时，不把敏感值写入技能。
- 在任务完成回复中说明是否沉淀经验，以及新增或更新的技能路径。
