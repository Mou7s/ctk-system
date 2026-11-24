/**
 * Dev smoke: login + open /tk_custom/pic, collect Vue component-resolve warnings.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const USER = process.env.LOGIN_USER || "admin";
const PASS = process.env.LOGIN_PASS || "";
if (!PASS) {
  throw new Error("Missing LOGIN_PASS environment variable");
}

const warnings = [];
const pageErrors = [];
const failedRequests = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
  const text = msg.text();
  if (
    text.includes("Failed to resolve component") ||
    text.includes("TkSearchPanel") ||
    text.includes("TkToolbar") ||
    msg.type() === "error" ||
    msg.type() === "warning"
  ) {
    warnings.push(`[${msg.type()}] ${text.slice(0, 500)}`);
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 500)));
page.on("response", (res) => {
  if (res.status() >= 400 && /pic|TkSearch|packages\/ui|app-globals/i.test(res.url())) {
    failedRequests.push(`${res.status()} ${res.url()}`);
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });

  // Nuxt login form selectors (try a few)
  const userSel = 'input[placeholder*="账号"], input[placeholder*="用户"], input[name="username"], input[type="text"]';
  const passSel = 'input[placeholder*="密码"], input[name="password"], input[type="password"]';
  await page.waitForSelector(passSel, { timeout: 15000 });
  await page.fill(userSel, USER);
  await page.fill(passSel, PASS);

  // captcha if present — try reading canvas is hard; often dev disables it
  const captcha = page.locator('input[placeholder*="验证码"]');
  if (await captcha.count()) {
    // Attempt common dev bypass: fill dummy; if login fails we'll report
    await captcha.fill("1234");
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"], button:has-text("登录"), .login-btn'),
  ]);

  await page.waitForTimeout(1500);

  // Force hard navigation to pic
  await page.goto(`${BASE}/tk_custom/pic`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  // Inspect runtime: is TkSearchPanel registered?
  const runtime = await page.evaluate(() => {
    // Nuxt 3 可能不直接暴露 app；从任意组件的 appContext 往上找
    const roots = document.querySelectorAll("*");
    let vueApp = null;
    for (const el of roots) {
      if (el.__vueParentComponent?.appContext?.app) {
        vueApp = el.__vueParentComponent.appContext.app;
        break;
      }
    }
    const has =
      vueApp?.component?.("TkSearchPanel") ||
      vueApp?._context?.components?.TkSearchPanel;
    return {
      hasGlobalTkSearchPanel: Boolean(has),
      componentKeys: vueApp?._context?.components
        ? Object.keys(vueApp._context.components).filter((k) => k.startsWith("Tk") || k.includes("Search") || k.includes("Pagination"))
        : [],
      path: location.pathname,
      title: document.title,
      bodySnippet: document.body?.innerText?.slice(0, 200) || "",
    };
  });

  console.log(JSON.stringify({ runtime, warnings: warnings.slice(0, 40), pageErrors, failedRequests }, null, 2));
} finally {
  await browser.close();
}
