# ctk-system

开源企业运营与生产管理全栈系统，基于 **Bun + Nuxt 4 + Nitro** 构建。前端界面、Nitro 服务端接口（认证会话、MySQL / SQL Server 数据访问）以及可选的外部 ERP / 企业微信集成全部整合在单一仓库中。

本项目采用 **GNU General Public License v3.0 (GPL-3.0-or-later)** 开源协议，详见 [LICENSE](LICENSE)。

## 项目结构

```text
.
├─ app/                        # Nuxt 前端应用
│  ├─ pages/                   # 页面路由；业务模块位于 tk_custom/
│  ├─ packages/                # 公共模块包（见下表）
│  ├─ api/tk_custom/           # 兼容导入路径的 API 薄 re-export 层
│  ├─ components/ layouts/     # 公共组件与页面布局
│  ├─ store/ middleware/       # Pinia 状态管理、全局鉴权中间件
│  ├─ utils/helpers.ts         # 前端通用工具函数
│  └─ router/static-navigation.js  # 侧边栏/顶部菜单静态配置
├─ server/                     # Nitro 服务端
│  ├─ routes/prod-api/         # 显式 API 路由（未登记路径返回 404）
│  ├─ templates/               # 服务端导出/打印模板
│  └─ utils/                   # 领域读写逻辑（<domain>-read.ts / -write.ts）、数据库与集成封装
├─ public/                     # 静态资源
├─ db/sql/                     # SQL 资产目录
│  ├─ schema/                  # 表结构 DDL（YYYYMMDD_描述.sql）
│  └─ data/                    # 初始化 Seed 与数据脚本（YYYYMMDD_描述.sql）
├─ tools/                      # SQL 目录规范检查等工程化脚本
├─ local.env.example           # 本地环境变量配置模板
├─ SECURITY.md                 # 安全漏洞报告与配置安全规范
├─ LICENSE                     # GNU GPLv3 开源协议全文
└─ AGENTS.md                   # AI / Agent 协作与工程规约
```

公共模块包（在页面中通过路径别名导入）：

| 包目录 | 导入名 | 内容 |
| --- | --- | --- |
| `app/packages/api` | `@ctk-system/api` | `TkApi` 请求封装与业务 API 聚合 |
| `app/packages/composables` | `@ctk-system/composables` | `useTkListQuery`、`useTkRowInteraction` 等组合式函数 |
| `app/packages/ui` | `@ctk-system/ui` | `TkSearchPanel`、`TkToolbar`、`TkUTable` 等通用 UI 组件 |
| `app/packages/shared` | `@ctk-system/shared` | 日期范围、格式化、口径计算等纯函数（可独立单测） |

## 技术栈

- **运行时**：Bun 1.4（包管理、脚本执行、开发与生产 SSR）
- **前端**：Nuxt 4 · Vue 3.5 · Nuxt UI v4 · Tailwind CSS 4 · Pinia
- **服务端**：Nitro（显式 server routes）· Zod 参数校验
- **数据库**：MySQL (`mysql2`) · Microsoft SQL Server (`mssql`，可选外部集成)
- **外部集成（可选）**：ERP WebAPI / SQL Server 账套直连、企业微信通讯录与消息通知、媒体播放服务
- **测试与检查**：Vitest + Happy DOM · ESLint

请求链路：浏览器 → `/prod-api/*` → 显式 Nitro route → MySQL / 可选外部集成。

进程外状态（登录会话、验证码、登录失败锁定、写请求幂等键）统一持久化在 MySQL 的 `sys_cache` 表中（实现见 `server/utils/redis.ts`），避免服务重启导致会话丢失。页面路由来源于 `app/pages/`，导航菜单由 `app/router/static-navigation.js` 与 `sys_menu` 权限表共同维护。

## 开源快速启动

### 前置要求

- [Bun](https://bun.sh) 1.4+
- 本地 MySQL 8.0+（`sys_cache` 表会在服务首次连接数据库时按需初始化）
- 外部 ERP（WebAPI / SQL Server）和企业微信均为**可选集成**：未配置外部凭证时，核心基础系统与本地单元测试仍可正常运行

### 1. 配置本地环境变量

复制模板文件 `local.env.example` 为 `local.env`（该文件已被 `.gitignore` 忽略，切勿提交到版本库）：

```powershell
# Windows PowerShell
Copy-Item local.env.example local.env
```

```bash
# macOS / Linux
cp local.env.example local.env
```

编辑 `local.env`，至少填写本地 MySQL 与令牌签名密钥：

- `TK_MYSQL_URL` / `TK_MYSQL_USERNAME` / `TK_MYSQL_PASSWORD`：指向本地 MySQL 数据库
- `NUXT_AUTH_TOKEN_SECRET` / `NUXT_LEGACY_TOKEN_SECRET`：填写本地随机开发密钥
- 若暂不连接外部 ERP 或企业微信，可将 K3 / SQL Server / WeCom 相关配置留空，并将 `NUXT_WECOM_AUTO_SYNC_ENABLED=0`

### 2. 初始化本地 MySQL 数据库

创建目标数据库（推荐字符集 `utf8mb4`），按顺序导入表结构与最小化 Seed 数据：

```bash
# 1. 导入表结构（按 db/sql/schema/ 下文件顺序执行）
mysql -u <user> -p --default-character-set=utf8mb4 <database> < db/sql/schema/20261113_init_schema.sql

# 2. 导入最小初始化数据（基础角色、菜单、字典与占位账号）
mysql -u <user> -p --default-character-set=utf8mb4 <database> < db/sql/data/20261113_init_seed.sql
```

> **安全提示**：导入 Seed 数据后，请务必根据 `db/sql/data/20261113_init_seed.sql` 中的说明重置管理员或演示账号密码，切勿在公开或生产环境使用默认占位凭证。更多安全注意事项见 [SECURITY.md](SECURITY.md)。

### 3. 安装依赖并启动

```bash
# 安装依赖
bun install

# 启动本地开发服务器（Bun 自动加载 local.env）
bun run dev

# 运行全量单元测试（不依赖外部 ERP / 企业微信）
bun run test
```

启动成功后访问：

- 前端页面：<http://127.0.0.1:5173>
- 服务端 API：<http://127.0.0.1:5173/prod-api>

> 若 `5173` 端口被占用，请先停止占用端口的进程后再启动。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 启动开发环境（Nitro + Vite 热重载，自动加载 `local.env`） |
| `bun run test` | 运行 Vitest 全量单元测试 |
| `bun run lint` | 运行轻量 ESLint 静态检查 |
| `bun run check:sql` | 校验 `db/sql/` 迁移目录与命名规范 |
| `bun run build` | 生产环境构建（仅发布/部署时执行） |
| `bun run preview` | 预览生产构建产物 |

## 开发约定

### 新增一个业务接口（`tk_custom`）

```text
1. server/routes/prod-api/tk_custom/<name>/*.ts      <- Nitro 路由与 Zod 参数校验
2. server/utils/<domain>-read.ts / <domain>-write.ts <- 复杂查询与写入逻辑
3. app/packages/api/modules/<name>.js                <- 前端 API 封装（createTkApi）
4. app/api/tk_custom/<name>.js                       <- 薄 re-export（兼容旧导入路径）
5. db/sql/schema/YYYYMMDD_描述.sql 或 data/          <- 涉及表结构、菜单或权限变更时
6. app/__tests__/*.spec.js                           <- 对应路由或单测用例
```

要点：

- 菜单与权限标识由 `sys_menu` 维护，静态导航与后端权限校验需保持同步
- 写操作需明确幂等性与失败影响，禁止盲目重试
- 外部 ERP 的 WebAPI 链路与 SQL Server 直连链路职责独立，排查或开发时不要混用

### UI 与列表约定

- 新页面优先使用 Nuxt UI v4 与原生 Tailwind CSS，**不新增 Element Plus**
- 前端通用辅助方法统一沉淀在 `app/utils/helpers.ts` 或 `@ctk-system/shared`
- 列表页优先组合 `@ctk-system/composables`（如 `useTkListQuery`、`useTkRowInteraction`）与 `@ctk-system/ui`（如 `TkUTable`）
- 行交互默认：单击选中、再击取消、双击打开；复选框列与操作列不触发行打开

## 安全与协作

- 安全漏洞上报流程与密钥管理规范见 [SECURITY.md](SECURITY.md)
- AI / Agent 协作规约见 [AGENTS.md](AGENTS.md)

## 开源协议

本项目基于 **GNU General Public License v3.0 (GPL-3.0-or-later)** 发布，完整协议文本请查阅 [LICENSE](LICENSE)。
