import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(rootDir, "app");

// 测试统一按业务时区（中国标准时间）跑：导出类代码用本地时区把 mysql2 返回的 Date
// 还原成数据库里的墙上时间，用例里又用固定偏移的 ISO 串做 mock，若测试进程跟着
// 机器时区走（GitHub runner 是 UTC），同一份 mock 会得到两个差 8 小时的结果。
// 在配置里先固定 TZ，worker 进程继承该环境变量，本地与 CI 结果一致。
process.env.TZ = "Asia/Shanghai";

export default {
  test: {
    // 默认 node 环境：93 个 Nitro 服务端 spec 只跑 handler/工具函数，不需要 DOM，
    // 每个文件都起一份 happy-dom 纯属浪费（实测 nitro 子集 14.6s → 8.0s）。
    // 需要 DOM 的（mount 组件、读 document）在文件首行用
    // `// @vitest-environment happy-dom` 单独声明。
    environment: "node",
    include: ["app/__tests__/**/*.spec.js"],
  },
  plugins: [vue()],
  resolve: {
    alias: {
      "@/plugins": path.resolve(rootDir, "app/plugins-legacy"),
      "@": webSrc,
      "~": webSrc,
      "@ctk-system/shared": path.resolve(rootDir, "app/packages/shared/index.js"),
      "@ctk-system/composables": path.resolve(rootDir, "app/packages/composables/index.js"),
      "@ctk-system/ui": path.resolve(rootDir, "app/packages/ui/index.js"),
      "@ctk-system/api": path.resolve(rootDir, "app/packages/api/index.js"),
    },
  },
};
