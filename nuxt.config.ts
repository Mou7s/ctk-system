import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import createSvgIcon from "./vite/plugins/svg-icon.js";
import { staticNavigation } from "./app/router/static-navigation.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const webSrc = path.resolve(rootDir, "app");
const repoRoot = path.resolve(rootDir, "..");
const require = createRequire(path.join(rootDir, "package.json"));
const envMode = process.env.NODE_ENV === "production" ? "production" : "development";
const releaseVersion = envMode === "production" ? randomUUID() : "development";
const fileEnv = loadEnv(envMode, rootDir, "");

function resolveProfilePath() {
  const configured = process.env.NUXT_PROFILE_PATH
    || fileEnv.NUXT_PROFILE_PATH;
  if (configured) return configured;

  return path.join(rootDir, "runtime", "uploadPath");
}

const profilePath = resolveProfilePath();

function resolveDependency(entry: string) {
  return require.resolve(entry);
}

const dayjsDir = path.dirname(require.resolve("dayjs/package.json"));
const echartsDir = path.dirname(require.resolve("echarts/package.json"));
const zrenderDir = path.dirname(require.resolve("zrender/package.json"));

const dependencyAliases = {
  "js-cookie": resolveDependency("js-cookie"),
  "file-saver": resolveDependency("file-saver"),
  jsencrypt: resolveDependency("jsencrypt"),
};

function buildViteAliases() {
  return [
    { find: "@/plugins", replacement: path.resolve(rootDir, "app/plugins-legacy") },
    { find: "@", replacement: webSrc },
    { find: "~", replacement: webSrc },
    // dayjs "main" is UMD (dayjs.min.js); Element Plus needs ESM default export + plugin subpaths.
    { find: /^dayjs$/, replacement: path.join(dayjsDir, "esm/index.js") },
    { find: /^dayjs\//, replacement: `${dayjsDir}/` },
    // Keep nuxt-echarts and vue-echarts on the same physical ECharts/ZRender instance.
    { find: /^echarts$/, replacement: path.join(echartsDir, "index.js") },
    { find: /^echarts\//, replacement: `${echartsDir}/` },
    { find: /^zrender$/, replacement: path.join(zrenderDir, "index.js") },
    { find: /^zrender\//, replacement: `${zrenderDir}/` },
    ...Object.entries(dependencyAliases).map(([find, replacement]) => ({ find, replacement })),
  ];
}

function collectStaticRouteMeta(routes: any[], result = new Map<string, Record<string, unknown>>()) {
  for (const route of routes) {
    if (route.path && route.meta) {
      result.set(route.path, route.meta);
    }
    if (Array.isArray(route.children)) {
      collectStaticRouteMeta(route.children, result);
    }
  }
  return result;
}

const staticRouteMeta = collectStaticRouteMeta(staticNavigation);

export default defineNuxtConfig({
  ssr: true,
  devServer: {
    // Default to IPv4 loopback on Windows so Bun/listhen does not bind IPv6-only ([::1]),
    // which fails under local proxy/TUN filters when Chrome falls back to 127.0.0.1.
    host: process.env.NUXT_HOST || process.env.NITRO_HOST || process.env.HOST || "127.0.0.1",
  },
  sourcemap: process.env.NODE_ENV === "production"
    ? (process.env.NUXT_BUILD_DEBUG_MAPS === "1"
        ? { server: true, client: true }
        : { server: false, client: false })
    : { server: true, client: true },
  compatibilityDate: "2026-07-04",
  future: {
    compatibilityVersion: 4,
  },
  appConfig: {
    ui: {
      colors: {
        primary: 'blue',
        neutral: 'slate',
      },
    },
  },
  devtools: { enabled: false },
  experimental: {
    appManifest: false,
  },

  // The admin area still contains browser-only pages and a
  // large client-side route graph. Keep the public login page SSR, but let
  // the authenticated SPA shell render in the browser during migration.
  // Individual routes can opt back into SSR after their browser-only
  // dependencies have been migrated.
  routeRules: {
    "/**": { ssr: false },
    "/login": { ssr: true },
  },

  app: {
    head: {
      title: process.env.NUXT_PUBLIC_APP_TITLE || process.env.VITE_APP_TITLE || "Enterprise Admin",
      meta: [
        { name: "theme-color", content: "#f0f2f5", media: "(prefers-color-scheme: light)" },
        { name: "theme-color", content: "#0f1114", media: "(prefers-color-scheme: dark)" },
      ],
    },
  },
  runtimeConfig: {
    public: {
      releaseVersion,
      appTitle: process.env.NUXT_PUBLIC_APP_TITLE || process.env.VITE_APP_TITLE || "Enterprise Admin",
      brandTitle: process.env.NUXT_PUBLIC_BRAND_TITLE || "内部管理系统",
      brandSubtitle: process.env.NUXT_PUBLIC_BRAND_SUBTITLE || "企业运营协同平台",
      brandMark: process.env.NUXT_PUBLIC_BRAND_MARK || "EA",
      brandFooter: process.env.NUXT_PUBLIC_BRAND_FOOTER || "Copyright © 2026",
      companyName: process.env.NUXT_PUBLIC_COMPANY_NAME || process.env.COMPANY_DISPLAY_NAME || "示例企业有限公司",
      demoTitle: process.env.NUXT_PUBLIC_DEMO_TITLE || "制造业管理系统",
      demoMode: ["1", "true", "yes", "on"].includes(String(process.env.NUXT_DEMO_MODE || "").toLowerCase()),
      appBaseApi: process.env.NUXT_PUBLIC_APP_BASE_API || process.env.VITE_APP_BASE_API || fileEnv.VITE_APP_BASE_API || "/prod-api",
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || process.env.VITE_APP_ENV || fileEnv.VITE_APP_ENV || "development",
      routerMode: process.env.NUXT_PUBLIC_ROUTER_MODE || process.env.VITE_APP_ROUTER_MODE || fileEnv.VITE_APP_ROUTER_MODE || "history",
    },
    authTokenSecret: process.env.NUXT_AUTH_TOKEN_SECRET || "",
    legacyTokenSecret: process.env.NUXT_LEGACY_TOKEN_SECRET || process.env.TOKEN_SECRET || "",
    tokenExpireMinutes: Number(process.env.NUXT_TOKEN_EXPIRE_MINUTES || 1440),
    mysqlUrl: process.env.NUXT_MYSQL_URL || "",
    mysqlHost: process.env.NUXT_MYSQL_HOST || "",
    mysqlPort: Number(process.env.NUXT_MYSQL_PORT || 3306),
    mysqlUser: process.env.NUXT_MYSQL_USER || "",
    mysqlPassword: process.env.NUXT_MYSQL_PASSWORD || "",
    mysqlDatabase: process.env.NUXT_MYSQL_DATABASE || "",
    mysqlConnectTimeoutMs: Number(process.env.NUXT_MYSQL_CONNECT_TIMEOUT_MS || 5000),
    mysqlQueryTimeoutMs: Number(process.env.NUXT_MYSQL_QUERY_TIMEOUT_MS || 10000),
    demoMysqlUrl: process.env.NUXT_DEMO_MYSQL_URL || "",
    demoMysqlHost: process.env.NUXT_DEMO_MYSQL_HOST || "",
    demoMysqlPort: Number(process.env.NUXT_DEMO_MYSQL_PORT || 3306),
    demoMysqlUser: process.env.NUXT_DEMO_MYSQL_USER || "",
    demoMysqlPassword: process.env.NUXT_DEMO_MYSQL_PASSWORD || "",
    demoMysqlDatabase: process.env.NUXT_DEMO_MYSQL_DATABASE || "",
    demoLoginUsername: process.env.NUXT_DEMO_LOGIN_USERNAME || "demo",
    demoLoginPassword: process.env.NUXT_DEMO_LOGIN_PASSWORD || process.env.TK_DEMO_LOGIN_PASSWORD || "",
    k3BaseUrl: process.env.NUXT_K3_BASE_URL || "",
    k3BaseUrlIntranet: process.env.NUXT_K3_BASE_URL_INTRANET || "",
    k3DbId: process.env.NUXT_K3_DBID || "",
    k3Username: process.env.NUXT_K3_USERNAME || "",
    k3Password: process.env.NUXT_K3_PASSWORD || "",
    k3AppId: process.env.NUXT_K3_APP_ID || "",
    k3AppSecret: process.env.NUXT_K3_APP_SECRET || "",
    k3Lcid: Number(process.env.NUXT_K3_LCID || 2052),
    sqlServerK3Host: process.env.NUXT_SQLSERVER_K3_HOST || "",
    sqlServerK3HostFallback: process.env.NUXT_SQLSERVER_K3_HOST_FALLBACK || "",
    sqlServerK3TlsServerName: process.env.NUXT_SQLSERVER_K3_TLS_SERVER_NAME || "",
    sqlServerK3Port: Number(process.env.NUXT_SQLSERVER_K3_PORT || 1433),
    sqlServerK3Database: process.env.NUXT_SQLSERVER_K3_DATABASE || "",
    sqlServerK3User: process.env.NUXT_SQLSERVER_K3_USER || process.env.TK_SQLSERVER_USERNAME || "",
    sqlServerK3Password: process.env.NUXT_SQLSERVER_K3_PASSWORD || process.env.TK_SQLSERVER_PASSWORD || "",
    sqlServerK3ConnectTimeoutMs: Number(process.env.NUXT_SQLSERVER_K3_CONNECT_TIMEOUT_MS || 5000),
    sqlServerK3RequestTimeoutMs: Number(process.env.NUXT_SQLSERVER_K3_REQUEST_TIMEOUT_MS || 30000),
    sqlServerK3PoolMax: Number(process.env.NUXT_SQLSERVER_K3_POOL_MAX || 5),
    profilePath,
    wxMpQrCodeUrl: process.env.NUXT_WX_MP_QR_CODE_URL || "/profile/upload/lucky/mp-qrcode.png",
    wecomAutoSyncEnabled: !["0", "false", "off"].includes(String(process.env.NUXT_WECOM_AUTO_SYNC_ENABLED || "1").toLowerCase()),
    wecomAutoSyncIntervalMs: Number(process.env.NUXT_WECOM_AUTO_SYNC_INTERVAL_MS || 60 * 60 * 1000),
    wecomAutoSyncInitialDelayMs: Number(process.env.NUXT_WECOM_AUTO_SYNC_INITIAL_DELAY_MS || 30 * 1000),
    jukeboxEngineMode: process.env.NUXT_JUKEBOX_ENGINE_MODE || "embedded",
    jukeboxEngineEnabled: process.env.NUXT_JUKEBOX_ENGINE_ENABLED || "",
    jukeboxServiceToken: process.env.NUXT_JUKEBOX_SERVICE_TOKEN || "",
    jukeboxMediaTimeoutMs: Number(process.env.NUXT_JUKEBOX_MEDIA_TIMEOUT_MS || 10 * 60 * 1000),
    jukeboxMediaBackupPath: process.env.NUXT_JUKEBOX_MEDIA_BACKUP_PATH || "",
    jukeboxStatePath: process.env.NUXT_JUKEBOX_STATE_PATH || "",
    jukeboxFfprobePath: process.env.NUXT_JUKEBOX_FFPROBE_PATH || "ffprobe",
    jukeboxMpvPath: process.env.NUXT_JUKEBOX_MPV_PATH || "mpv",
    jukeboxMpvIpcPath: process.env.NUXT_JUKEBOX_MPV_IPC_PATH || "/tmp/mpv-ipc",
    jukeboxMpvLogPath: process.env.NUXT_JUKEBOX_MPV_LOG_PATH || "",
    jukeboxVolume: Number(process.env.NUXT_JUKEBOX_VOLUME || 70),
    jukeboxPlaybackRetries: Number(process.env.NUXT_JUKEBOX_PLAYBACK_RETRIES || 2),
    jukeboxPulseServer: process.env.NUXT_JUKEBOX_PULSE_SERVER || process.env.PULSE_SERVER || "",
    jukeboxAudioUid: process.env.NUXT_JUKEBOX_AUDIO_UID || "",
    jukeboxAudioGid: process.env.NUXT_JUKEBOX_AUDIO_GID || "",
  },
  alias: {
    "@/plugins": path.resolve(rootDir, "app/plugins-legacy"),
    "@": webSrc,
    "~": webSrc,
    "@ctk-system/shared": path.resolve(rootDir, "app/packages/shared/index.js"),
    "@ctk-system/composables": path.resolve(rootDir, "app/packages/composables/index.js"),
    "@ctk-system/ui": path.resolve(rootDir, "app/packages/ui/index.js"),
    "@ctk-system/api": path.resolve(rootDir, "app/packages/api/index.js"),
  },
  modules: ["@pinia/nuxt", "@nuxt/ui", "nuxt-easy-lightbox", "nuxt-echarts"],
  // Auto-import / global-register shared list shells (TkSearchPanel, TkToolbar, …)
  components: [
    {
      path: path.resolve(rootDir, "app/packages/ui"),
      pathPrefix: false,
      extensions: ["vue"],
      global: true,
    },
  ],
  colorMode: {
    classSuffix: "",
    preference: "system",
    fallback: "light",
  },
  ui: {
    // SSR/Nitro must not depend on Google Fonts metadata during startup. The
    // application already supplies its own system/font stack in CSS.
    fonts: false,
    colors: {
      primary: "blue",
      neutral: "slate",
    },
  },
  icon: {
    provider: "server",
    serverBundle: "local",
    clientBundle: {
      scan: true,
      sizeLimitKb: 1024,
    },
    fallbackToApi: false,
  },
  echarts: {
    renderer: "canvas",
    charts: ["BarChart"],
    components: [
      "GridComponent",
      "MarkLineComponent",
      "TitleComponent",
      "TooltipComponent",
    ],
  },
  pinia: {
    storesDirs: [],
  },
  build: {
    transpile: [],
  },
  css: ["@/assets/styles/tailwind.css"],
  vite: {
    envDir: path.resolve(rootDir, "."),
    plugins: [createSvgIcon(false)],
    resolve: {
      alias: buildViteAliases(),
      dedupe: [
        "vue",
        "dayjs",
        "echarts",
        "zrender",
        "pinia",
        "vue-router",
      ],
    },
    optimizeDeps: {
      include: [
        "dayjs",
        "dayjs/plugin/localeData.js",
        "dayjs/plugin/customParseFormat.js",
        "dayjs/plugin/advancedFormat.js",
        "dayjs/plugin/weekOfYear.js",
        "dayjs/plugin/weekYear.js",
        "dayjs/plugin/dayOfYear.js",
        "dayjs/plugin/isSameOrAfter.js",
        "dayjs/plugin/isSameOrBefore.js",
        "lodash-unified",
        "js-cookie",
        "file-saver",
        "jsencrypt",
        "fuse.js",
        "@internationalized/date",
        "@vueuse/core",
        "@wangeditor/editor",
        "@wangeditor/editor-for-vue",
        "xlsx/xlsx.mjs",
      ],
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
    build: {
      cssMinify: "esbuild",
      reportCompressedSize: false,
    },
  },
  nitro: {
    // Nuxt 4.6 moved the renderer into nuxt/dist/runtime/server. Nitro 2 dev
    // must inline its absolute path so import.meta.dev and virtual manifests
    // are transformed rather than executed directly by Bun.
    ...(process.env.NODE_ENV !== "production" ? {
      externals: {
        inline: [(id: string) => /nuxt\/dist\/runtime\/server\//.test(id.replaceAll("\\", "/"))],
      },
    } : {}),
    // Bun is the canonical Nitro runtime for local builds and production.
    // Keep the target at ES2020 because server utilities intentionally use BigInt.
    preset: process.env.NITRO_PRESET || "bun",
    // Quotation templates may contain customer and price examples. Bundle them as
    // server-only assets instead of copying them into Nitro's publicly served tree.
    serverAssets: [
      {
        baseName: "quotation-templates",
        dir: path.resolve(rootDir, "server/templates"),
        pattern: "*.xlsx",
      },
    ],
    esbuild: {
      options: {
        target: "es2020",
      },
    },
  },
  hooks: {
    "pages:extend"(pages) {
      // Keep Nuxt file-based routing enabled while enriching generated routes
      // with the static title/icon/permission metadata used by the shell.
      for (const page of pages) {
        const meta = staticRouteMeta.get(page.path);
        if (meta) {
          page.meta = { ...page.meta, ...meta };
        }
      }
    },
  },
  // "vite:extendConfig"(config, { isClient }) {
    //   // Only patch rollup input during production builds.
    //   // In dev mode, environments.client.build.rollupOptions.input.entry points to
    //   // .nuxt/dev/index.mjs (the Nitro server entry). Setting input.server = input.entry
    //   // would cause Vite to treat the Node.js server bundle as a client chunk,
    //   // triggering "BuildMessage: ModuleNotFound" in the browser overlay on first request.
    //   if (!isClient || process.env.NODE_ENV !== "production") {
    //     return;
    //   }
    //   const patchInput = (rollupOptions?: { input?: Record<string, string> | string | string[] }) => {
    //     const input = rollupOptions?.input;
    //     if (input && typeof input === "object" && !Array.isArray(input) && input.entry && !input.server) {
    //       input.server = input.entry;
    //     }
    //   };
    //   patchInput(config.build?.rollupOptions);
    //   patchInput(
    //     (config as { environments?: { client?: { build?: { rollupOptions?: { input?: Record<string, string> } } } } })
    //       .environments?.client?.build?.rollupOptions,
    //   );
    // },
});
