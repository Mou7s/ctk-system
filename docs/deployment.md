# 本地开发、生产部署与白标配置指南

> 相关文档：[项目概览](../README.md) · [系统架构](./architecture.md) · [核心业务模块](./modules.md) · [协作规约](../AGENTS.md) · [安全策略](../SECURITY.md)

本文档面向开发者与运维人员，说明 `ctk-system` 的本地开发启动、Docker Compose 生产部署、**白标品牌与企业抬头配置**、外部系统集成参数以及开源与私有资产的隔离规范。

---

## 一、环境要求与本地开发

### 1. 基础环境要求

| 组件 | 推荐版本 | 说明 |
| --- | --- | --- |
| **Bun** | `1.4.x`（`package.json` 声明 `bun@1.4.0`，镜像使用 `oven/bun:1.4.4-debian`） | 项目统一的包管理器与 Nitro 服务端运行时 |
| **MySQL** | `8.0+` / `8.4` | 需启用 `lower_case_table_names=1`、字符集 `utf8mb4`、`max_allowed_packet=64M` |
| **FFmpeg / mpv**（可选） | 发行版稳定版 | 仅在启用厂区广播（Jukebox）音频校验与本地播放时需要 |

### 2. 安装依赖

```bash
bun install
```

> 项目根目录的 `bunfig.toml` 配置了 `linker = "hoisted"`，为 Nuxt / Vite 模块解析所必需，请勿删除。

### 3. 配置本地环境变量

复制示例模板生成本地配置文件（`local.env` 已被 `.gitignore` 忽略，不会进入 Git）：

```bash
# macOS / Linux
cp local.env.example local.env

# Windows PowerShell
Copy-Item local.env.example local.env
```

本地最小可运行配置示例（在 `local.env` 中填写）：

```dotenv
# 本地监听地址（默认 127.0.0.1，避免 Windows 下 IPv6 ::1 回环兼容问题）
NUXT_HOST=127.0.0.1

# MySQL 业务库（支持 JDBC 格式或离散 NUXT_MYSQL_* 变量）
TK_MYSQL_URL=jdbc:mysql://127.0.0.1:3306/app_erp?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
TK_MYSQL_USERNAME=root
TK_MYSQL_PASSWORD=your_local_mysql_password

# 会话令牌签名密钥（请使用随机长字符串）
NUXT_AUTH_TOKEN_SECRET=replace-with-a-random-secret-string
NUXT_LEGACY_TOKEN_SECRET=replace-with-a-legacy-secret-string
```

### 4. 初始化数据库

SQL 迁移资产统一存放在 `db/sql/`，按用途拆分为两个子目录：

- `db/sql/schema/`：纯结构变更（DDL），按文件名日期顺序执行（起始文件为 `20261113_init_schema.sql`）。
- `db/sql/data/`：初始化种子与菜单/配置数据（DML），按文件名日期顺序执行（起始文件为 `20261113_init_seed.sql`）。

导入示例（Linux / macOS）：

```bash
mysql -h 127.0.0.1 -u root -p --default-character-set=utf8mb4 app_erp < db/sql/schema/20261113_init_schema.sql
mysql -h 127.0.0.1 -u root -p --default-character-set=utf8mb4 app_erp < db/sql/data/20261113_init_seed.sql
```

随后按日期顺序导入其余增量迁移文件即可。

> **注意事项**
> - Windows 下请勿通过 PowerShell 管道直接向 `mysql` 输入含中文的 SQL，容易产生编码乱码；请使用 UTF-8 无 BOM 文件配合数据库客户端工具或 `SOURCE` 命令导入。
> - 系统无需额外 Redis 服务：登录会话、图形验证码、登录失败锁与写请求幂等键统一存储在 MySQL 的 `sys_cache` 表中。若本地登录或验证码异常，请先检查 MySQL 连通性与 `sys_cache` 表。

### 5. 启动开发服务与常用命令

```bash
# 启动开发服务器（自动加载 local.env）
bun run dev

# 运行全量单元测试（Vitest）
bun run test

# 运行代码静态检查（ESLint）
bun run lint

# 校验 SQL 迁移目录与命名规约
bun run check:sql
```

> 日常开发与页面验收直接使用 `bun run dev` 即可，无需执行生产构建 `bun run build`。修改 `local.env`、`nuxt.config.ts` 或依赖后需重启 `bun run dev`。

---

## 二、生产部署指南（Docker Compose）

仓库内置多阶段 `Dockerfile` 与 `docker-compose.yml`，支持一键编排应用服务、Caddy 反向代理与可选的本地 MySQL 实例。

### 1. 容器服务拓扑

| 服务名 | 容器名 | 镜像 / 构建方式 | 端口 | 职责 |
| --- | --- | --- | --- | --- |
| `app` | `ctk-system-app` | 本地构建 `Dockerfile`（`oven/bun:1.4.4-debian`） | `127.0.0.1:3100:3100` | Nuxt 4 + Nitro 全栈应用（内置 `ffmpeg`/`mpv`/`curl`） |
| `caddy` | `ctk-caddy` | `caddy:2-alpine` | `80:80` | 反向代理 `/prod-api/*`、`/api/_nuxt_icon/*` 与前端路由，直出 `/profile/*` 静态文件（上传上限 50MB） |
| `mysql`（可选） | `ctk-mysql` | `mysql:8.4`（`profiles: ["local-db"]`） | `127.0.0.1:3306:3306` | 容器化 MySQL，仅在未接入外部独立数据库时通过 `--profile local-db` 启用 |

### 2. 准备生产环境配置文件

复制 `.env.docker.example` 为 `.env.docker`（该文件已被 `.gitignore` 忽略，严禁提交到 Git）：

```bash
cp .env.docker.example .env.docker
```

按实际生产环境填写以下核心配置：

- 宿主机挂载目录：`HOST_TKSERVER_FILES_DIR`、`HOST_MYSQL_DATA_DIR`、`HOST_JUKEBOX_BACKUP_DIR`、`HOST_JUKEBOX_STATE_DIR` 等。
- 数据库连接：`NUXT_MYSQL_HOST`、`NUXT_MYSQL_PORT`、`NUXT_MYSQL_DATABASE`、`NUXT_MYSQL_USER`、`NUXT_MYSQL_PASSWORD`（使用 `local-db` 时同步设置 `MYSQL_ROOT_PASSWORD`）。
- 会话密钥：`NUXT_AUTH_TOKEN_SECRET`、`NUXT_LEGACY_TOKEN_SECRET`、`NUXT_TOKEN_EXPIRE_MINUTES`（默认 `1440` 分钟）。
- 品牌与抬头配置：见 [第三章](#三白标品牌与企业抬头配置专题)。
- 外部系统凭据与定时任务开关：见 [第四章](#四外部集成与核心运行配置)。

> `docker-compose.yml` 已在 `app` 服务中显式清空 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`，避免宿主机代理配置干扰内网数据库、ERP 或考勤库的直连访问。

### 3. 持久化卷与宿主机目录挂载

在首次启动前，确保宿主机目录已创建并具备容器运行用户（`uid:gid = 1000:1000`）的读写权限：

| 环境变量（宿主机路径） | 默认宿主机路径 | 容器挂载路径 | 用途 |
| --- | --- | --- | --- |
| `HOST_TKSERVER_FILES_DIR` | `/srv/TKServerFiles` | `/data/TKServerFiles`（`caddy` 只读挂载其下 `uploadPath`） | 用户上传文件、业务附件与静态资源目录（对应 `NUXT_PROFILE_PATH=/data/TKServerFiles/uploadPath`） |
| `HOST_MYSQL_DATA_DIR` | `/srv/ctk-system/mysql-data` | `/var/lib/mysql` | 容器化 MySQL 数据目录（仅 `--profile local-db` 生效） |
| `HOST_JUKEBOX_BACKUP_DIR` | `/srv/ctk-system/jukebox-media` | `/data/jukebox-media` | 厂区广播音频备份目录（需独立于 `NUXT_PROFILE_PATH`） |
| `HOST_JUKEBOX_STATE_DIR` | `/srv/ctk-system/jukebox-state` | `/data/jukebox-state` | 厂区广播调度状态持久化目录 |
| `HOST_PULSE_SOCKET_DIR` | `/run/user/1000/pulse` | `/run/user/1000/pulse` | 宿主机 PulseAudio 音频套接字（仅需本机声卡播音时挂载） |
| `HOST_SSH_DIR` | `/srv/ctk-system/ssh` | `/data/ssh:ro` | 只读 SSH 私钥目录（仅启用绿盾 IT 资产 SSH 采集时需要） |
| — | `./deploy/docker/Caddyfile` | `/etc/caddy/Caddyfile:ro` | Caddy 反向代理配置文件 |
| — | Docker 具名卷 `caddy_data` / `caddy_config` | `/data` / `/config` | Caddy 运行数据与配置缓存 |

### 4. 启动与健康检查

```bash
# 方式 A：接入外部已有 MySQL（默认）
docker compose up -d --build

# 方式 B：同时启动容器内 MySQL（local-db profile）
docker compose --profile local-db up -d --build
```

查看容器状态与健康检查结果：

```bash
docker compose ps
docker compose logs -f app
```

内置健康检查口径：

- **`app`**：每 30 秒请求 `http://127.0.0.1:3100/app-version`（超时 5 秒，重试 3 次，启动宽限 20 秒），`caddy` 会等待 `app` 进入 `healthy` 状态后再启动。
- **`mysql`**（启用 `local-db` 时）：每 10 秒执行 `mysqladmin ping`（超时 5 秒，重试 10 次，启动宽限 30 秒）。

> **生产验收建议**：健康检查返回 HTTP 200 仅代表进程存活。上线后请重新登录系统，验证真实业务 API 响应及外部集成（如 ERP、企微）返回数据正常。

### 5. 版本升级流程

1. 拉取最新代码并检查变更日志：
   ```bash
   git pull origin main
   ```
2. 若本次更新包含数据库变更，先按日期顺序导入 `db/sql/schema/` 与 `db/sql/data/` 中新增的 SQL 文件。若修改了 `sys_menu`、`sys_config` 或 `sys_job`，请清理 MySQL `sys_cache` 表中对应的缓存键（会话撤销需同时清理 `auth_sessions:*` 与兼容键 `login_tokens:*`）。
3. 重新构建并平滑重启应用容器：
   ```bash
   docker compose build app
   docker compose up -d app
   ```
4. 观察 `docker compose ps` 确认 `ctk-system-app` 恢复 `healthy`，并完成登录与关键业务回归验收。

---

## 三、白标品牌与企业抬头配置专题

`ctk-system` 采用**「开源代码纯白标，本地开发与企业生产自动显示自有公司名」**的设计原则：

- 仓库源码、默认配置和示例模板中不包含任何特定企业的名称或商标，仅提供通用白标占位符（如 `Enterprise Admin`、`内部管理系统`、`示例企业有限公司`）。
- 企业和个人部署时，只需在被 Git 忽略的 `local.env`（本地开发）或 `.env.docker`（Docker 生产）中配置以下 8 个环境变量，即可在登录页、浏览器标题、资产标签与各类 Excel 导出报表中完整展示自有品牌，**无需修改业务源码**，也便于无冲突地同步上游更新。

### 环境变量对照表

| 环境变量 | 代码默认值 | 作用范围与生效位置 |
| --- | --- | --- |
| `NUXT_PUBLIC_APP_TITLE` | `Enterprise Admin` | 浏览器标签页标题（`nuxt.config.ts` 中的 `app.head.title` 与 `runtimeConfig.public.appTitle`） |
| `NUXT_PUBLIC_BRAND_TITLE` | `内部管理系统` | 登录页（`app/pages/login.vue`）与注册页（`app/pages/register.vue`）主标题 |
| `NUXT_PUBLIC_BRAND_SUBTITLE` | `企业运营协同平台` | 登录页品牌副标题 |
| `NUXT_PUBLIC_BRAND_MARK` | `EA` | 登录页顶部品牌徽标缩写文字（建议 2–4 个大写字母） |
| `NUXT_PUBLIC_BRAND_FOOTER` | `Copyright © 2026` | 登录页与注册页底部版权信息 |
| `NUXT_PUBLIC_COMPANY_NAME` | 回退 `COMPANY_DISPLAY_NAME`，最终回退 `示例企业有限公司` | 前端业务页面展示的企业名称（如 IT 资产标签打印抬头 `app/pages/tk_custom/itAsset/index.vue`） |
| `COMPANY_DISPLAY_NAME` | `示例企业有限公司` | 服务端导出报表的通用企业抬头（如 IT 资产台账 Excel `server/utils/it-asset-excel.ts`），同时作为 `NUXT_PUBLIC_COMPANY_NAME` 与 `ATTENDANCE_COMPANY_TITLE` 的默认回退值 |
| `ATTENDANCE_COMPANY_TITLE` | 回退 `COMPANY_DISPLAY_NAME`，最终回退 `示例企业有限公司` | 企微考勤汇总导出报表专用企业抬头（`server/utils/wecom-attendance-export.ts`），适合集团或多主体组织单独指定考勤表抬头 |

### 配置示例

在 `local.env` 或 `.env.docker` 末尾填入自有企业信息（以下以通用占位符演示）：

```dotenv
NUXT_PUBLIC_APP_TITLE=示例企业运营管理平台
NUXT_PUBLIC_BRAND_TITLE=示例企业内部管理系统
NUXT_PUBLIC_BRAND_SUBTITLE=数字化生产与协同办公平台
NUXT_PUBLIC_BRAND_MARK=DEMO
NUXT_PUBLIC_BRAND_FOOTER=Copyright © 2026 示例企业有限公司
NUXT_PUBLIC_COMPANY_NAME=示例企业有限公司
COMPANY_DISPLAY_NAME=示例企业有限公司
ATTENDANCE_COMPANY_TITLE=示例企业有限公司（制造中心）
```

> **生效方式说明**
> - **本地开发**：修改 `local.env` 后重启 `bun run dev` 立即生效。
> - **Docker 生产**：`runtimeConfig.public.*` 在容器启动时由 Nitro 运行时环境变量覆盖，修改 `.env.docker` 后执行 `docker compose up -d --force-recreate app` 即可生效；如需同步更新 SSR 首屏静态 HTML `<title>` 默认值，可在修改环境变量或构建参数后重新构建镜像。

---

## 四、外部集成与核心运行配置

### 1. MySQL 业务库与进程外缓存

- **连接配置**：支持本地开发使用的 `TK_MYSQL_URL` / `TK_MYSQL_USERNAME` / `TK_MYSQL_PASSWORD`，也支持生产推荐的离散变量 `NUXT_MYSQL_HOST`、`NUXT_MYSQL_PORT`、`NUXT_MYSQL_DATABASE`、`NUXT_MYSQL_USER`、`NUXT_MYSQL_PASSWORD`。
- **主备故障切换**：`NUXT_MYSQL_HOST_FALLBACK` 可配置同一份数据库的备用入口（如内网隧道地址）；主地址不可达时自动切换，留空则不启用。
- **超时与缓存清理**：`NUXT_MYSQL_CONNECT_TIMEOUT_MS`（默认 `5000`）、`NUXT_MYSQL_QUERY_TIMEOUT_MS`（默认 `10000`）、`NUXT_SYS_CACHE_CLEANUP_INTERVAL_MS`（默认 `300000` 毫秒）、`NUXT_SYS_CACHE_CLEANUP_INITIAL_DELAY_MS`（默认 `60000` 毫秒）。

### 2. 金蝶 K3Cloud 双数据链路

系统与金蝶 ERP 存在两条独立的数据链路，请按业务场景分别配置、切勿混用：

- **WebAPI 链路**（库存查询、单据保存/提交/审核等写操作）：
  - `NUXT_K3_BASE_URL`、`NUXT_K3_BASE_URL_INTRANET`（内网优先地址）
  - `NUXT_K3_DBID`、`NUXT_K3_USERNAME`、`NUXT_K3_PASSWORD`、`NUXT_K3_APP_ID`、`NUXT_K3_APP_SECRET`
  - `NUXT_K3_CONNECT_TIMEOUT_MS`、`NUXT_K3_REQUEST_TIMEOUT_MS`、`NUXT_K3_NO_PROXY_HOSTS`（本地开发通过代理时配置需直连的主机列表，逗号分隔）
  - > **生产提示**：`server/utils/k3-config.ts` 会将精确的 `5000` / `30000` 视为未显式覆写并回退读取 `sys_config` 中的历史值，生产环境 `.env.docker` 建议显式设为非默认值（例如 `8000` 与 `60000`）。
- **SQL Server 直连链路**（工序计划、生产质量、产量/在制只读查询）：
  - `NUXT_SQLSERVER_K3_HOST`、`NUXT_SQLSERVER_K3_HOST_FALLBACK`、`NUXT_SQLSERVER_K3_PORT`（默认 `1433`）
  - `NUXT_SQLSERVER_K3_DATABASE`、`NUXT_SQLSERVER_K3_USER`、`NUXT_SQLSERVER_K3_PASSWORD`
  - `NUXT_SQLSERVER_K3_TLS_SERVER_NAME`（当目标主机填写 IP 且 TLS 拒绝 IP SNI 时配置）
  - `NUXT_SQLSERVER_K3_CONNECT_TIMEOUT_MS`（默认 `5000`）、`NUXT_SQLSERVER_K3_REQUEST_TIMEOUT_MS`（默认 `30000`）、`NUXT_SQLSERVER_K3_POOL_MAX`（默认 `5`）

### 3. 企业微信与可选外源集成

- **企业微信（WeCom）**：
  - 凭据：`NUXT_WECOM_CORP_ID`、`NUXT_WECOM_CORP_SECRET`、`NUXT_WECOM_CORP_SECRET_CONTACTS`（生产部署优先在数据库 `sys_config` 维护 `wx.work.corpId` 等键，环境变量仅作为兜底）。
  - 通知链接覆盖：`NUXT_QUOTATION_APP_INTERNAL_URL`（如 `http://localhost:3100`）、`NUXT_QUOTATION_APP_EXTERNAL_URL`（如 `https://your-domain.example.com`），用于报价审批等企微卡片跳转。
  - 通讯录自动同步：`NUXT_WECOM_AUTO_SYNC_ENABLED`（默认 `1`）、`NUXT_WECOM_AUTO_SYNC_INTERVAL_MS`（默认 `3600000`）、`NUXT_WECOM_AUTO_SYNC_INITIAL_DELAY_MS`（默认 `30000`）。
- **外部考勤只读库（可选）**：`NUXT_ATTENDANCE_MYSQL_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE`。
- **IT 资产外源 SSH 只读采集（可选）**：`NUXT_LVDUN_SSH_HOST` / `PORT` / `USER` / `KEY_PATH`。
- **厂区广播 Jukebox（可选）**：`NUXT_JUKEBOX_ENGINE_MODE=embedded`（已内嵌至 Nitro）、`NUXT_JUKEBOX_ENGINE_ENABLED`（本地默认 `0`，生产按需设 `1`）、`NUXT_JUKEBOX_VOLUME`、`NUXT_JUKEBOX_MEDIA_BACKUP_PATH`、`NUXT_JUKEBOX_STATE_PATH`。

### 4. Nitro 后台定时任务开关（`NUXT_NITRO_JOB_*`）

统一迁移至 Nitro 的定时任务注册在 `server/utils/nitro-jobs/registry.ts` 中，**所有任务默认关闭（`0`）**，仅当对应环境变量设为 `1`（或 `sys_config` 中对应 `nitro.job.<key>=1`）时才执行真实写操作或外部推送：

| 环境变量开关 | 任务说明 |
| --- | --- |
| `NUXT_NITRO_JOB_KUCUN_FULL_SYNC` | 库存全量同步 |
| `NUXT_NITRO_JOB_KUCUN_DIFF_SYNC` | 库存差异同步 |
| `NUXT_NITRO_JOB_SUGGEST_PUSH` | 匿名意见推送至企业微信 |
| `NUXT_NITRO_JOB_APPROVE_SYNC` | 同步企业微信审批信息 |
| `NUXT_NITRO_JOB_APPROVE_SYNC_7D` | 拉取近 7 天审批消息 |
| `NUXT_NITRO_JOB_KUCUN_WARNING_PUSH` | 金蝶库存上下限预警推送 |
| `NUXT_NITRO_JOB_BROADCAST_SYNC` | 同步厂区广播计划 |
| `NUXT_NITRO_JOB_UPLOAD_PATH` | 上传路径维护任务 |
| `NUXT_NITRO_JOB_OVERDUE_AUTO_FREEZE` | 逾期应收客户自动冻结出库 |
| `NUXT_NITRO_JOB_KUCUN_WARNING_SNAPSHOT` | 同步金蝶库存预警快照 |
| `NUXT_NITRO_JOB_WECOM_EMPLOYEE_SYNC` | 更新企业微信通讯录员工 |
| `NUXT_MO_CLOSE_ENABLED` | 生产订单自动结案（独立插件，默认 `0`，配合 `NUXT_MO_CLOSE_INTERVAL_MS` / `NUXT_MO_CLOSE_INITIAL_DELAY_MS`） |

> **本地开发保护机制**：在 `bun run dev` 开发模式下，`server/utils/nitro-jobs/dev-guard.ts` 会默认跳过重型定时调度，避免外部 ERP/企微超时拖慢本地页面调试。如需本地验证调度器，可使用 `NUXT_NITRO_JOBS_IN_DEV=1 bun run dev` 启动，或在「系统监控 → 定时任务」页面手动触发单次执行。

### 5. 演示模式（`NUXT_DEMO_MODE`）

系统支持面向公开体验的演示模式，并与生产数据实现物理隔离：

- **开启演示外观**：设置 `NUXT_DEMO_MODE=true`（支持 `1` / `true` / `yes` / `on`），登录页自动切换为演示标识与 `NUXT_PUBLIC_DEMO_TITLE`（默认 `制造业管理系统`）。
- **物理隔离数据源**：通过 `NUXT_DEMO_MYSQL_URL` 或离散变量 `NUXT_DEMO_MYSQL_HOST` / `PORT` / `DATABASE` / `USER` / `PASSWORD` 指定独立的演示库。登录名为 `demo` 的账号所有读写操作仅落入演示库；**若未配置演示库会直接报错，绝不会回退到生产库**。
- **快捷演示入口**：配置 `NUXT_DEMO_LOGIN_USERNAME=demo` 与 `NUXT_DEMO_LOGIN_PASSWORD` 后，访问 `/login?demo=1` 或 `/demo` 可自动填充演示账号（严禁在此处填写生产账号密码）。

---

## 五、开源与私有资产隔离最佳实践

本仓库遵循**「开源的进 Git，不开源的不进 Git、不 push」**原则。请严格依托 `.gitignore` 维护代码与企业私有资产的边界，**严禁使用 `git add -f` 强制提交被忽略文件**。

### 受 `.gitignore` 管控的私有资产清单

| 路径 / 模式 | 用途说明 | 开源仓库中应保留的替代项 |
| --- | --- | --- |
| `local.env`、`local.env.*` | 本地开发凭据、连接串与企业品牌配置 | 仅提交 `local.env.example`（占位符） |
| `.env.docker`、`.env.docker.*` | Docker 生产环境变量与密钥 | 仅提交 `.env.docker.example`（占位符） |
| `deploy.config.json`、`scripts/deploy/deploy.config.json` | 私有部署服务器地址与目标目录配置 | 仅本地或运维机保留 |
| `.private/` | 私有业务文档、内部运维记录、真实数据样本 | 不进入 Git |
| `.agents/` | 本地内部 Agent 技能与企业专属业务经验 | 不进入 Git |
| `tools/db_config.py`、`tools/{demo-env,kingdee,probes-tests,dev-env,migration}/`、`scratch/` | 内部探测脚本、迁移工具与临时实验文件 | 不进入 Git |
| `runtime/`、`output/`、`*.pem`、`*.key`、`*.pfx` | 运行时上传文件、导出产物与私钥证书 | 不进入 Git |

### 提交与推送前自检清单

每次执行 `git commit` 或 `git push` 前，请按顺序核对：

1. 运行 `git status --short`，确认暂存区中不含上述私有目录、环境文件或证书私钥。
2. 检查改动内容，确认源码、注释、文档与测试用例中均不含真实企业名称、内网 IP、员工信息、账号密码、ERP 密钥或真实生产单据号；涉及企业信息统一通过环境变量或数据库配置注入。
3. 运行规范检查：
   ```bash
   bun run check:sql
   git diff --check
   ```
