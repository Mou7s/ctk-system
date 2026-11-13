const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");

const rootDir = __dirname;
const appDir = rootDir;

const REMOTE_FRONTEND_FINGERPRINT_FILE = "nuxt-current.sha256";
const REMOTE_FRONTEND_LOCK_FILE = "nuxt-deploy.lock";
const REMOTE_SNAPSHOT_PREFIX = "nuxt-snapshot-";
const REMOTE_SNAPSHOT_LIMIT = 3;

// Helper to format timestamps
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

// Log formatting
const color = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(msg, type = "info") {
  const prefix = {
    info: `${color.cyan}[INFO]${color.reset}`,
    warn: `${color.yellow}[WARN]${color.reset}`,
    err: `${color.red}[ERROR]${color.reset}`,
    ok: `${color.green}[SUCCESS]${color.reset}`,
    run: `${color.yellow}[RUN]${color.reset}`,
  }[type];
  console.log(`${prefix} ${msg}`);
}

// A listening port does not prove that a process belongs to this checkout.
function isRepositoryNuxtDevProcess(entry, sourceRoot = rootDir) {
  const pid = Number(entry?.ProcessId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const cliPath = path.join(sourceRoot, "node_modules", "@nuxt", "cli", "dist", "dev", "index.mjs").replace(/\\/g, "/").toLowerCase();
  const command = String(entry.CommandLine || "").replace(/\\/g, "/").toLowerCase();
  const args = command.match(/"[^"]*"|[^\s]+/g) || [];
  return args.some((arg) => arg.replace(/^"|"$/g, "") === cliPath);
}

function readLocalNuxtDevProcesses() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "@(Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress"],
  { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return [];
  try {
    const entries = JSON.parse(String(result.stdout || "[]").replace(/^\uFEFF/, ""));
    return (Array.isArray(entries) ? entries : [entries]).filter((entry) => isRepositoryNuxtDevProcess(entry));
  } catch { return []; }
}

function listeningPortsForPid(output, pid) {
  return String(output).split(/\r?\n/).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "TCP" || fields[3] !== "LISTENING" || Number(fields[4]) !== Number(pid)) return [];
    const port = Number(fields[1].split(":").pop());
    return Number.isInteger(port) && port > 0 && port <= 65535 ? [port] : [];
  });
}

function stopLocalNuxtDevProcesses() {
  const entries = readLocalNuxtDevProcesses();
  let stopped = false;
  for (const entry of entries) {
    // Recheck ownership immediately before stopping. Do not kill a process tree.
    if (!readLocalNuxtDevProcesses().some((current) => current.ProcessId === entry.ProcessId)) continue;
    const result = spawnSync("taskkill.exe", ["/PID", String(entry.ProcessId), "/F"], { stdio: "ignore", windowsHide: true });
    if (result.status !== 0) throw new Error(`Could not stop this checkout's Nuxt dev process ${entry.ProcessId}.`);
    stopped = true;
  }
  return stopped;
}

function waitForLocalNuxtDev(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    const entries = readLocalNuxtDevProcesses();
    const result = spawnSync("netstat.exe", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
    for (const entry of entries) {
      const ports = listeningPortsForPid(result.stdout, entry.ProcessId);
      if (ports.length) return { pid: entry.ProcessId, port: ports[0] };
    }
    Atomics.wait(waitBuffer, 0, 0, 500);
  }
  return null;
}

function startFrontendDev(env) {
  const logsDir = path.join(rootDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, "frontend-dev.log");
  const logFd = fs.openSync(logPath, "a");
  const child = spawn("bun", ["run", "dev"], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    env,
  });
  child.unref();
  fs.closeSync(logFd);
  const server = waitForLocalNuxtDev();
  if (server) {
    log(`Restarted local Nuxt dev server (PID ${server.pid}, port ${server.port}); log: ${logPath}`, "ok");
  } else {
    log(`Local deploy succeeded, but Nuxt dev did not publish a listening process for this checkout within 30 seconds. Check: ${logPath}`, "warn");
  }
}

// Parse Command Line Arguments
const args = process.argv.slice(2);

const options = {
  skipBuild: args.includes("--skip-build"),
  fast: !args.includes("--full-build"),
  cleanBuild: args.includes("--clean-build") || args.includes("--clean-frontend"),
  cleanFrontend: args.includes("--clean-frontend") || args.includes("--clean-build"),
  skipBackup: args.includes("--skip-backup"),
  preserveSnapshots: args.includes("--preserve-snapshots"),
  noRestart: args.includes("--no-restart"),
  dryRun: args.includes("--dry-run"),
  skipBunCheck: args.includes("--skip-bun-check"),
  skipRemoteInstall: args.includes("--skip-remote-install"),
  nitro: true,
};

// Execute command locally with logs
function runLocal(cmd, argsList, cwd = rootDir) {
  const display = `${cmd} ${argsList.join(" ")}`;
  log(display, "run");
  if (options.dryRun) return true;

  const result = spawnSync(cmd, argsList, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status}: ${display}`,
    );
  }
  return true;
}

// Resolve the Windows bsdtar by absolute path. A bare "tar" lookup can hit
// an MSYS/Git-Bash GNU tar whose "host:path" syntax rejects drive letters
// ("tar: Cannot connect to C: resolve failed").
function windowsBsdTarPath() {
  if (process.platform !== "win32") return "";
  const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const candidate = path.join(systemRoot, "System32", "tar.exe");
  return fs.existsSync(candidate) ? candidate : "";
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldIncludeDeploymentPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized !== "server/node_modules" && !normalized.startsWith("server/node_modules/");
}

function collectDeploymentFiles(sourcePath, relativePath = "") {
  if (!shouldIncludeDeploymentPath(relativePath)) return [];
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink()) return [];
  if (sourceStat.isDirectory()) {
    return fs.readdirSync(sourcePath)
      .sort()
      .flatMap((name) => collectDeploymentFiles(
        path.join(sourcePath, name),
        relativePath ? path.join(relativePath, name) : name,
      ));
  }
  return [{ path: normalizeRelativePath(relativePath), sourcePath }];
}

function computeDeploymentFingerprint(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Nitro output directory not found: ${sourcePath || "(empty)"}`);
  }
  const digest = crypto.createHash("sha256");
  for (const file of collectDeploymentFiles(sourcePath)) {
    const content = fs.readFileSync(file.sourcePath);
    digest.update(file.path);
    digest.update("\0");
    digest.update(String(content.length));
    digest.update("\0");
    digest.update(content);
    digest.update("\0");
  }
  return digest.digest("hex");
}

function remotePathJoin(basePath, name, remoteOs = "windows") {
  return remoteOs === "windows"
    ? path.win32.join(basePath, name)
    : path.posix.join(basePath, name);
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runRemoteCapture(remote, sshPortArgs, script) {
  const encoded = encodePowerShell(script);
  const result = spawnSync(
    "ssh",
    [...sshPortArgs, remote, `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`],
    { cwd: rootDir, encoding: "utf8", shell: true, windowsHide: true },
  );
  if (result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

function readRemoteFrontendFingerprint(remote, sshPortArgs, remoteBackupDir, remoteOs = "windows") {
  const markerPath = remotePathJoin(remoteBackupDir, REMOTE_FRONTEND_FINGERPRINT_FILE, remoteOs);
  const raw = remoteOs === "windows"
    ? runRemoteCapture(remote, sshPortArgs, `if (Test-Path -LiteralPath '${markerPath}') { Get-Content -LiteralPath '${markerPath}' -Raw }`)
    : (() => {
        const result = spawnSync("ssh", [...sshPortArgs, remote, `if [ -f '${markerPath}' ]; then cat '${markerPath}'; fi`], {
          cwd: rootDir,
          encoding: "utf8",
          shell: true,
        });
        if (result.status !== 0) return null;
        return String(result.stdout || "").trim();
      })();
  if (raw === null) return null;
  return raw.split(/\s+/)[0].trim().toLowerCase();
}

function buildRemoteFrontendHealthScript(frontendService) {
  return `$svc = Get-Service -Name "${frontendService}" -ErrorAction Stop; if ($svc.Status -ne "Running") { throw "Frontend service ${frontendService} is not running" }`;
}

function buildRemoteFrontendHealthCommand(frontendService, remoteOs = "windows") {
  if (remoteOs === "windows") return buildRemoteFrontendHealthScript(frontendService);
  return `systemctl is-active --quiet '${frontendService}'`;
}

function isNitroFingerprintUnchanged(localFingerprint, remoteFingerprint) {
  return Boolean(
    localFingerprint &&
    remoteFingerprint &&
    localFingerprint.trim().toLowerCase() === remoteFingerprint.trim().toLowerCase(),
  );
}

function getLatestFileMtimeMs(targetPath, ignoredNames = new Set()) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = stat.mtimeMs;
  for (const name of fs.readdirSync(targetPath)) {
    if (ignoredNames.has(name)) continue;
    latest = Math.max(latest, getLatestFileMtimeMs(path.join(targetPath, name), ignoredNames));
  }
  return latest;
}

function validateReusableNitroOutput(outputDir, sourceRoot = appDir) {
  const requiredPaths = [
    path.join(outputDir, "server", "index.mjs"),
    path.join(outputDir, "server", "package.json"),
    path.join(outputDir, "public"),
  ];
  const missing = requiredPaths.filter((targetPath) => !fs.existsSync(targetPath));
  if (missing.length > 0) {
    throw new Error(`--skip-build requires a complete Nitro output; missing: ${missing.map((targetPath) => path.relative(outputDir, targetPath)).join(", ")}`);
  }

  const sourcePaths = [
    path.join(sourceRoot, "app"),
    path.join(sourceRoot, "server"),
    path.join(sourceRoot, "nuxt.config.ts"),
    path.join(sourceRoot, "package.json"),
    path.join(sourceRoot, "bun.lock"),
    path.join(sourceRoot, "bun.lockb"),
    path.join(sourceRoot, "patch.cjs"),
  ];
  const latestSourceMtime = Math.max(...sourcePaths.map((targetPath) => getLatestFileMtimeMs(
    targetPath,
    new Set(["node_modules", ".nuxt", ".output"]),
  )));
  const latestOutputMtime = getLatestFileMtimeMs(outputDir);
  if (latestSourceMtime > latestOutputMtime + 1000) {
    throw new Error("--skip-build cannot reuse stale Nitro output; source files are newer than .output. Run without --skip-build.");
  }
  return outputDir;
}

function checkRemoteFrontendHealth(remote, sshPortArgs, frontendService, remoteOs = "windows") {
  const command = buildRemoteFrontendHealthCommand(frontendService, remoteOs);
  const result = remoteOs === "windows"
    ? (() => {
        const encoded = encodePowerShell(command);
        return spawnSync("ssh", [...sshPortArgs, remote, `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`], {
          cwd: rootDir,
          stdio: "inherit",
          shell: true,
          windowsHide: true,
        });
      })()
    : spawnSync("ssh", [...sshPortArgs, remote, command], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
      });
  if (result.status !== 0) {
    throw new Error(`Remote frontend service ${frontendService} health check failed.`);
  }
}

function copyNitroTreeWithoutDependencies(sourcePath, targetPath, relativePath = "") {
  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  if (normalizedRelativePath === "server/node_modules") return;

  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink()) return;

  if (sourceStat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const name of fs.readdirSync(sourcePath)) {
      copyNitroTreeWithoutDependencies(
        path.join(sourcePath, name),
        path.join(targetPath, name),
        relativePath ? path.join(relativePath, name) : name,
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function frontendDependencyInstallMarker() {
  return path.join(appDir, "node_modules", ".ctk-system-bun-install.stamp");
}

function shouldInstallFrontendDependencies() {
  const nodeModules = path.join(appDir, "node_modules");
  if (!fs.existsSync(nodeModules)) return true;

  const marker = frontendDependencyInstallMarker();
  if (!fs.existsSync(marker)) return true;
  const markerMtime = fs.statSync(marker).mtimeMs;
  const dependencyFiles = [
    path.join(appDir, "package.json"),
    path.join(appDir, "bun.lock"),
    path.join(appDir, "bun.lockb"),
  ];
  return dependencyFiles.some((file) => {
    return fs.existsSync(file) && fs.statSync(file).mtimeMs > markerMtime;
  });
}

function markFrontendDependenciesInstalled() {
  const marker = frontendDependencyInstallMarker();
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, `${new Date().toISOString()}\n`, "utf8");
}

// Main Deploy Pipeline
function main() {
  const frontendDevEnv = { ...process.env };
  let shouldRestartFrontendDev = false;
  const restoreFrontendDev = () => {
    if (!shouldRestartFrontendDev) return;
    startFrontendDev(frontendDevEnv);
    shouldRestartFrontendDev = false;
  };
  const defaultConfig = {
    server: process.env.DEPLOY_SERVER || "",
    user: process.env.DEPLOY_USER || "",
    sshPort: process.env.DEPLOY_SSH_PORT || "22",
    remoteOs: process.env.DEPLOY_REMOTE_OS || "windows",
    frontendRuntime: process.env.DEPLOY_FRONTEND_RUNTIME || "bun",
    remoteNuxtDir: process.env.DEPLOY_REMOTE_NUXT_DIR || "",
    frontendService: process.env.DEPLOY_FRONTEND_SERVICE || "nuxt-ssr",
    remoteRuntimeExecutable: process.env.DEPLOY_REMOTE_RUNTIME_EXECUTABLE || "",
    remoteServiceConfig: process.env.DEPLOY_REMOTE_SERVICE_CONFIG || "",
    remoteBackupDir: process.env.DEPLOY_REMOTE_BACKUP_DIR || "",
    webServerReloadCommand: process.env.DEPLOY_WEB_SERVER_RELOAD_COMMAND || "",
  };

  let config = { ...defaultConfig };
  const configPath = path.join(rootDir, "deploy.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config = { ...config, ...localConfig };
      log(`Merged local configuration from: ${configPath}`, "info");
    } catch (e) {
      log(`Failed to parse local config ${configPath}: ${e.message}`, "warn");
    }
  }

  const server = config.server;
  const user = config.user;
  const sshPort = config.sshPort || "22";
  const remoteOs = (config.remoteOs || "windows").toLowerCase();
  const remoteBackupDir = config.remoteBackupDir;
  const frontendRuntime = String(config.frontendRuntime || "bun").toLowerCase();
  const remoteNuxtDir = config.remoteNuxtDir;
  const frontendService = config.frontendService;
  const remoteRuntimeExecutable = config.remoteRuntimeExecutable;
  const remoteServiceConfig = config.remoteServiceConfig;
  const webServerReloadCommand = config.webServerReloadCommand || "";

  if (!server || !user) {
    log('Config file must contain "server" and "user" fields.', "err");
    process.exit(1);
  }

  if (!remoteNuxtDir || !frontendService) {
    log('Nitro deployment requires "remoteNuxtDir" and "frontendService" in configuration.', "err");
    process.exit(1);
  }

  if (!['bun', 'node'].includes(frontendRuntime)) {
    log(`Unsupported frontendRuntime "${frontendRuntime}". Use "bun" or "node".`, "err");
    process.exit(1);
  }

  if (frontendRuntime === "bun" && remoteOs === "windows" && (!remoteRuntimeExecutable || !remoteServiceConfig)) {
    log('Bun Nitro deployment requires "remoteRuntimeExecutable" and "remoteServiceConfig" in configuration.', "err");
    process.exit(1);
  }

  log("Deployment mode: Nuxt 4 + Nitro full-stack.", "info");

  // Perform Local Builds
  if (!options.skipBuild) {
    log('Building Nuxt 4 + Nitro application...', 'info');

    // Stop only this checkout's Nuxt CLI to avoid cache locks and pollution
    if (!options.dryRun) {
      shouldRestartFrontendDev = stopLocalNuxtDevProcesses();
      if (shouldRestartFrontendDev) {
        log("Detected a running local Nuxt dev server; it will be restored after a successful deploy.", "info");
      }
    }

    if (!options.dryRun && (!options.fast || options.cleanFrontend)) {
      const nuxtCache = path.join(appDir, '.nuxt');
      const outputCache = path.join(appDir, '.output');

      if (fs.existsSync(nuxtCache)) {
        fs.rmSync(nuxtCache, { recursive: true, force: true });
        log('Cleared frontend .nuxt cache directory.', 'info');
      }
      if (fs.existsSync(outputCache)) {
        fs.rmSync(outputCache, { recursive: true, force: true });
        log('Cleared frontend .output build directory.', 'info');
      }
    } else {
      log('Fast mode: keeping Nuxt build caches.', 'info');
    }

    process.env.NODE_ENV = "production";
    process.env.BABEL_ENV = "production";
    process.env.NUXT_TELEMETRY_DISABLED = "1";
    const rawNuxtHeapMb = process.env.CTK_NUXT_MAX_OLD_SPACE_SIZE_MB || "5120";
    const nuxtHeapMb = Number(rawNuxtHeapMb);
    if (!Number.isInteger(nuxtHeapMb) || nuxtHeapMb < 1024 || nuxtHeapMb > 32768) {
      throw new Error(
        `CTK_NUXT_MAX_OLD_SPACE_SIZE_MB must be an integer between 1024 and 32768, got: ${rawNuxtHeapMb}`,
      );
    }
    const preservedNodeOptions = String(process.env.NODE_OPTIONS || "")
      .replace(/(?:^|\s)--max-old-space-size=\d+/g, " ")
      .trim();
  const patchRequire = `--require=${path.join(appDir, "patch.cjs").replace(/\\/g, "/")}`;
    process.env.NODE_OPTIONS = [
      preservedNodeOptions,
      `--max-old-space-size=${nuxtHeapMb}`,
      patchRequire,
    ].filter(Boolean).join(" ");
    log(`Nuxt production build heap: ${nuxtHeapMb} MB`, "info");

    if (!options.fast || shouldInstallFrontendDependencies()) {
    runLocal("bun", ["install", "--frozen-lockfile"], appDir);
      if (!options.dryRun) markFrontendDependenciesInstalled();
    } else {
      log('Fast mode: frontend dependencies are unchanged; skipping bun install.', 'info');
    }
    process.env.NITRO_PRESET = frontendRuntime;
    log(`Nitro production runtime: ${frontendRuntime}`, "info");
    runLocal("bun", ["run", "--bun", "nuxt", "build"], appDir);
  }

  // Resolve Nitro Build Output Directory
  let distPath = "";
  if (!options.dryRun || options.skipBuild) {
    const checkPaths = [path.join(appDir, ".output")];
    for (const p of checkPaths) {
      if (fs.existsSync(p) && fs.readdirSync(p).length > 0) {
        distPath = p;
        break;
      }
    }
    if (!distPath) {
      log("Nuxt Nitro output not found in .output.", "err");
      process.exit(1);
    }
    log(`Using Nuxt Nitro server build directory: ${distPath}`, "info");
    if (options.skipBuild) {
      validateReusableNitroOutput(distPath);
      log("Validated reusable Nitro output for --skip-build.", "info");
    }
  }

  const stamp = `${getTimestamp()}-${process.pid}`;
  const remote = `${user}@${server}`;
  const scpPortArgs = ["-P", sshPort];
  const sshPortArgs = ["-p", sshPort];

  // Verify the runtime required by the deployed Nitro service.
  if (!options.skipBunCheck) {
    log(`Verifying remote ${frontendRuntime === "bun" ? "Bun" : "Node.js"} installation...`, "info");
    if (options.dryRun) {
      log(`[DRY-RUN] Would check remote ${frontendRuntime} installation`, "info");
    } else {
      const runtimeCheckCmd = remoteOs === "windows"
        ? (() => {
            const runtimeCheckScript = frontendRuntime === "bun"
              ? `if (-not (Test-Path -LiteralPath '${remoteRuntimeExecutable}')) { exit 1 }`
              : 'if (-not (Get-Command node -ErrorAction SilentlyContinue)) { exit 1 }';
            const encodedRuntimeCheck = Buffer.from(runtimeCheckScript, "utf16le").toString("base64");
            return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encodedRuntimeCheck}`;
          })()
        : frontendRuntime === "bun"
          ? "command -v bun >/dev/null 2>&1 && bun --version"
          : "command -v node >/dev/null 2>&1 && node --version";
      const checkResult = spawnSync(
        "ssh",
        [...sshPortArgs, remote, runtimeCheckCmd],
        { stdio: "inherit" },
      );
      if (checkResult.status !== 0) {
        log(`Remote ${frontendRuntime} preflight check returned a non-zero status; the uploaded remote script will perform the final absolute-path check before stopping the service.`, "warn");
      }
    }
  }

  let frontendArchive = "";
  let frontendArchiveStage = "";
  let remoteScriptFile = "";
  let skipFrontendTransfer = false;
  let frontendFingerprint = "";

  if (!options.dryRun) {
    frontendFingerprint = computeDeploymentFingerprint(distPath);
    log(`Computed Nitro deployment fingerprint: ${frontendFingerprint}`, "info");
    const remoteFingerprint = readRemoteFrontendFingerprint(
      remote,
      sshPortArgs,
      remoteBackupDir,
      remoteOs,
    );
    if (remoteFingerprint === null) {
      log("Could not read the remote Nitro fingerprint; a full archive upload will be used.", "warn");
    } else if (isNitroFingerprintUnchanged(frontendFingerprint, remoteFingerprint)) {
      log("Nitro output fingerprint is unchanged; skipping archive, upload, service restart, and directory replacement.", "ok");
      try {
        checkRemoteFrontendHealth(remote, sshPortArgs, frontendService, remoteOs);
      } catch (error) {
        restoreFrontendDev();
        throw error;
      }
      skipFrontendTransfer = true;
      log("Remote Nitro health check passed; no deployment work is required.", "ok");
      restoreFrontendDev();
      return;
    } else {
      log(remoteFingerprint ? "Nitro output changed; a new archive will be uploaded." : "No remote Nitro fingerprint found; a full archive upload will be used.", "info");
    }
  }

  try {
    if (remoteOs === "windows") {
      const remoteTmp = `C:\\Windows\\Temp\\ctk-system-deploy-${stamp}`;
      const remoteZipTmp = path
        .join(remoteTmp, "frontend.zip")
        .replace(/\\/g, "/");

      log(`Preparing remote temporary directory: ${remoteTmp}`, "info");
      const remoteLockPath = remotePathJoin(remoteBackupDir, REMOTE_FRONTEND_LOCK_FILE);
      const mkdirScript = `New-Item -ItemType Directory -Force -Path '${remoteTmp}','${remoteBackupDir}' | Out-Null; if (Test-Path -LiteralPath '${remoteLockPath}') { Remove-Item -LiteralPath '${remoteLockPath}' -Force -ErrorAction SilentlyContinue }`;
      const mkdirEncoded = Buffer.from(mkdirScript, "utf16le").toString("base64");
      runLocal("ssh", [
        ...sshPortArgs,
        remote,
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${mkdirEncoded}`,
      ]);

      if (!skipFrontendTransfer) {
        log("Archiving frontend assets to zip...", "info");
        frontendArchive = path.join(os.tmpdir(), `app-frontend-${stamp}.zip`);
        if (options.dryRun) {
          log(`[DRY-RUN] Would archive frontend assets to ${frontendArchive}`, "info");
        } else if (process.platform === "win32" && windowsBsdTarPath()) {
          const bsdTar = windowsBsdTarPath();
          log(`Using Windows bsdtar (${bsdTar}) and excluding server/node_modules from the Nitro archive.`, "info");
          runLocal(bsdTar, [
            "-a",
            "-cf",
            frontendArchive,
            "--exclude=server/node_modules",
            "-C",
            distPath,
            ".",
          ]);
        } else if (process.platform === "win32") {
          frontendArchiveStage = path.join(os.tmpdir(), `app-nitro-stage-${stamp}`);
          copyNitroTreeWithoutDependencies(distPath, frontendArchiveStage);
          log("Excluded Nitro server/node_modules; production dependencies will be installed remotely.", "info");
          runLocal("powershell", [
            "-NoProfile",
            "-Command",
            `Compress-Archive -Path '${frontendArchiveStage}\\*' -DestinationPath '${frontendArchive}' -Force`,
          ]);
        } else {
          // BSD tar (macOS 自带) 与 Windows 分支行为一致：排除 server/node_modules，
          // 远端 Expand-Archive 受 260 字符路径限制无法解压深层 node_modules；生产依赖由远端安装步骤补齐。
          log("Using bsdtar and excluding server/node_modules from the Nitro archive.", "info");
          runLocal("tar", [
            "-a",
            "-cf",
            frontendArchive,
            "--exclude=server/node_modules",
            "-C",
            distPath,
            ".",
          ]);
        }

        log("Uploading frontend zip...", "info");
        runLocal("scp", [
          ...scpPortArgs,
          frontendArchive,
          `${remote}:${remoteZipTmp}`,
        ]);
      }

      // Generate Remote Execution Commands
      const remoteSteps = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        '$ErrorActionPreference = "Stop"',
        '$ProgressPreference = "SilentlyContinue"',
      ];
      const frontendDeploymentEnabled = !skipFrontendTransfer;
      if (frontendDeploymentEnabled) {
        remoteSteps.push(`$deployLock = '${remoteLockPath}'; $deployLockDir = [System.IO.Path]::GetDirectoryName($deployLock); if (-not [System.IO.Directory]::Exists($deployLockDir)) { [System.IO.Directory]::CreateDirectory($deployLockDir) | Out-Null }; $lockHandle = $null; try { $lockHandle = [System.IO.File]::Open($deployLock, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None) } catch [System.IO.IOException] { throw "Another Nitro deployment is already running: $deployLock" } catch { throw ("Failed to acquire deployment lock: " + $_.Exception.Message) }; try {`);
      }

      if (frontendDeploymentEnabled) {
        const frontendTarget = remoteNuxtDir;
        const remoteStaging = path.join(remoteTmp, "frontend-staging");
        const remoteSnapshot = path.join(remoteBackupDir, `${REMOTE_SNAPSHOT_PREFIX}${stamp}`);
        const remoteFingerprintPath = path.join(remoteBackupDir, REMOTE_FRONTEND_FINGERPRINT_FILE);
        const remoteNuxtNodeModulesDir = path.join(frontendTarget, "server", "node_modules");
        const preservedNodeModulesDir = path.join(remoteTmp, "server-node_modules");
        const frontendServerDir = path.join(frontendTarget, "server");

        remoteSteps.push(`New-Item -ItemType Directory -Force -Path '${remoteBackupDir}','${path.dirname(frontendTarget)}' | Out-Null`);
        remoteSteps.push(`if (Test-Path -LiteralPath '${remoteStaging}') { Remove-Item -LiteralPath '${remoteStaging}' -Recurse -Force }; New-Item -ItemType Directory -Force -Path '${remoteStaging}' | Out-Null`);
        remoteSteps.push(`Expand-Archive -LiteralPath '${remoteZipTmp}' -DestinationPath '${remoteStaging}' -Force`);
        remoteSteps.push(`if (-not (Test-Path -LiteralPath '${path.join(remoteStaging, "server", "index.mjs")}')) { throw "Nitro staging output is incomplete: server/index.mjs is missing" }`);
        remoteSteps.push(`if (-not (Test-Path -LiteralPath '${path.join(remoteStaging, "server", "package.json")}')) { throw "Nitro staging output is incomplete: server/package.json is missing" }`);
        if (frontendRuntime === "bun") {
          remoteSteps.push(`if (-not (Test-Path -LiteralPath '${remoteRuntimeExecutable}')) { throw "Bun runtime not found: ${remoteRuntimeExecutable}" }`);
          remoteSteps.push(`if (-not (Test-Path -LiteralPath '${remoteServiceConfig}')) { throw "Nitro service config not found: ${remoteServiceConfig}" }`);
        }
        remoteSteps.push(`$nuxtSvc = $null; $swapped = $false; $snapshotPath = '${remoteSnapshot}'; $preservedNodeModules = '${preservedNodeModulesDir}'`);
        remoteSteps.push(`try {`);
        if (!options.noRestart) {
          remoteSteps.push(`$nuxtSvc = Get-Service -Name "${frontendService}" -ErrorAction Stop; if ($nuxtSvc.Status -ne "Stopped") { Stop-Service -InputObject $nuxtSvc -Force; $nuxtSvc.WaitForStatus("Stopped", "00:01:30") }`);
        }
        if (frontendRuntime === "bun") {
          const serviceXmlBackup = path.join(remoteBackupDir, `${frontendService}.${stamp}.xml`);
          const runtimeScriptPath = path.join(frontendTarget, "server", "index.mjs");
          if (!options.skipBackup) {
            remoteSteps.push(`Copy-Item -LiteralPath '${remoteServiceConfig}' -Destination '${serviceXmlBackup}' -Force`);
          }
          remoteSteps.push(
            `$serviceXml = Get-Content -LiteralPath '${remoteServiceConfig}' -Raw; $serviceXml = [regex]::Replace($serviceXml, '<executable>.*?</executable>', '<executable>${remoteRuntimeExecutable}</executable>'); $serviceXml = [regex]::Replace($serviceXml, '<arguments>.*?</arguments>', '<arguments>${runtimeScriptPath}</arguments>'); if ($serviceXml -match '<env name="NITRO_PRESET"') { $serviceXml = [regex]::Replace($serviceXml, '<env name="NITRO_PRESET" value="[^"]*"\\s*/>', '<env name="NITRO_PRESET" value="bun" />') } else { $serviceXml = $serviceXml.Replace('</service>', ('  <env name="NITRO_PRESET" value="bun" />' + [Environment]::NewLine + '</service>')) }; Set-Content -LiteralPath '${remoteServiceConfig}' -Value $serviceXml -Encoding utf8`,
          );
        }
        remoteSteps.push(`if (Test-Path -LiteralPath '${remoteNuxtNodeModulesDir}') { Move-Item -LiteralPath '${remoteNuxtNodeModulesDir}' -Destination '${preservedNodeModulesDir}' -Force }`);
        if (!options.skipBackup) {
          remoteSteps.push(`if (Test-Path -LiteralPath '${frontendTarget}') { if (Test-Path -LiteralPath '${remoteSnapshot}') { Remove-Item -LiteralPath '${remoteSnapshot}' -Recurse -Force }; Move-Item -LiteralPath '${frontendTarget}' -Destination '${remoteSnapshot}' -Force }`);
        } else {
          remoteSteps.push(`if (Test-Path -LiteralPath '${frontendTarget}') { Remove-Item -LiteralPath '${frontendTarget}' -Recurse -Force }`);
        }
        remoteSteps.push(`Move-Item -LiteralPath '${remoteStaging}' -Destination '${frontendTarget}' -Force; $swapped = $true`);
        remoteSteps.push(`if (Test-Path -LiteralPath '${preservedNodeModulesDir}') { New-Item -ItemType Directory -Force -Path '${frontendServerDir}' | Out-Null; Move-Item -LiteralPath '${preservedNodeModulesDir}' -Destination '${remoteNuxtNodeModulesDir}' -Force }`);
        if (!options.skipRemoteInstall) {
          const remotePackageFile = path.join(frontendServerDir, "package.json");
          const remoteNodeModulesDir = path.join(frontendServerDir, "node_modules");
          const remoteInstallMarker = path.join(remoteBackupDir, "nuxt-server-package.sha256");
          remoteSteps.push(
            `$packageFile = '${remotePackageFile}'; $nodeModulesDir = '${remoteNodeModulesDir}'; $installMarker = '${remoteInstallMarker}'; $packageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $packageFile).Hash; $needsInstall = -not (Test-Path -LiteralPath $nodeModulesDir) -or -not (Test-Path -LiteralPath $installMarker) -or ((Get-Content -LiteralPath $installMarker -Raw).Trim() -ne $packageHash); if ($needsInstall) { Push-Location '${frontendServerDir}'; try { & '${remoteRuntimeExecutable}' install --production --no-save --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw \"Remote Nitro dependency install failed with exit code $LASTEXITCODE\" }; Set-Content -LiteralPath $installMarker -Value $packageHash -NoNewline } finally { Pop-Location } }`,
          );
        } else {
          log('Skipping remote Nitro dependency install by request.', 'warn');
        }
        if (!options.noRestart) {
          remoteSteps.push(`Start-Service -InputObject $nuxtSvc; $nuxtSvc.WaitForStatus("Running", "00:01:30")`);
        }
        remoteSteps.push(`Set-Content -LiteralPath '${remoteFingerprintPath}' -Value '${frontendFingerprint}' -NoNewline`);
        if (!options.skipBackup && !options.preserveSnapshots) {
          remoteSteps.push(`Get-ChildItem -LiteralPath '${remoteBackupDir}' -Directory -Filter '${REMOTE_SNAPSHOT_PREFIX}*' | Sort-Object Name -Descending | Select-Object -Skip ${REMOTE_SNAPSHOT_LIMIT} | Remove-Item -Recurse -Force`);
        }
        if (webServerReloadCommand) {
          remoteSteps.push(webServerReloadCommand);
        }
        const rollbackSnapshotExpression = options.skipBackup ? "$false" : "$true";
        const serviceXmlRollback = frontendRuntime === "bun" && !options.skipBackup
          ? `if (Test-Path -LiteralPath '${path.join(remoteBackupDir, `${frontendService}.${stamp}.xml`)}') { Copy-Item -LiteralPath '${path.join(remoteBackupDir, `${frontendService}.${stamp}.xml`)}' -Destination '${remoteServiceConfig}' -Force }`
          : "$null = $true";
        remoteSteps.push(`} catch { try { if ($swapped -and (Test-Path -LiteralPath '${frontendTarget}')) { Remove-Item -LiteralPath '${frontendTarget}' -Recurse -Force }; if (${rollbackSnapshotExpression} -and (Test-Path -LiteralPath '${remoteSnapshot}')) { Move-Item -LiteralPath '${remoteSnapshot}' -Destination '${frontendTarget}' -Force }; if (Test-Path -LiteralPath '${preservedNodeModulesDir}') { New-Item -ItemType Directory -Force -Path '${path.join(frontendTarget, "server")}' | Out-Null; Move-Item -LiteralPath '${preservedNodeModulesDir}' -Destination '${remoteNuxtNodeModulesDir}' -Force }; ${serviceXmlRollback}; if ($nuxtSvc -and ((Get-Service -Name "${frontendService}").Status -ne "Running")) { Start-Service -InputObject $nuxtSvc; $nuxtSvc.WaitForStatus("Running", "00:01:30") } } catch { Write-Error ("Nitro rollback failed: " + $_.Exception.Message) }; throw }`);
      }

      let remoteScript = remoteSteps.join("; ");
      if (frontendDeploymentEnabled) {
        remoteScript += `; } finally { if ($lockHandle) { $lockHandle.Dispose() }; Remove-Item -LiteralPath '${remoteTmp}' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '${remoteLockPath}' -Force -ErrorAction SilentlyContinue }`;
      } else {
        remoteScript += `; Remove-Item -LiteralPath '${remoteTmp}' -Recurse -Force -ErrorAction SilentlyContinue`;
      }
      log(`Remote execution Script Block:\n${remoteScript}`, "info");
      remoteScriptFile = path.join(os.tmpdir(), `app-remote-deploy-${stamp}.ps1`);
      fs.writeFileSync(remoteScriptFile, `\uFEFF${remoteScript}`, "utf8");
      const remoteScriptTmp = path
        .join(remoteTmp, "deploy.ps1")
        .replace(/\\/g, "/");

      log("Executing remote deployment steps on Windows Server...", "info");
      runLocal("scp", [
        ...scpPortArgs,
        remoteScriptFile,
        `${remote}:${remoteScriptTmp}`,
      ]);
      runLocal("ssh", [
        ...sshPortArgs,
        remote,
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${remoteScriptTmp}"`,
      ]);
    } else {
      // Linux Remote OS
      const remoteTmp = `/tmp/ctk-system-deploy-${stamp}`;

      log(`Preparing remote directories: ${remoteTmp}`, "info");
      runLocal("ssh", [
        ...sshPortArgs,
        remote,
        `mkdir -p '${remoteTmp}' '${remoteBackupDir}'`,
      ]);

      if (!skipFrontendTransfer) {
        log("Archiving frontend assets to tar.gz...", "info");
        frontendArchive = path.join(
          os.tmpdir(),
          `app-frontend-${stamp}.tar.gz`,
        );
        runLocal("tar", ["--exclude=./server/node_modules", "-czf", frontendArchive, "-C", distPath, "."]);

        log("Uploading frontend archive...", "info");
        runLocal("scp", [
          ...scpPortArgs,
          frontendArchive,
          `${remote}:${remoteTmp}/frontend.tar.gz`,
        ]);
      }

      const remoteSteps = ["set -e"];
      const frontendDeploymentEnabled = !skipFrontendTransfer;
      const remoteLockPath = remotePathJoin(remoteBackupDir, REMOTE_FRONTEND_LOCK_FILE, "linux");
      if (frontendDeploymentEnabled) {
        remoteSteps.push(`deploy_lock='${remoteLockPath}'; if [ -e "$deploy_lock" ]; then echo "Another Nitro deployment is already running: $deploy_lock" >&2; exit 1; fi; mkdir "$deploy_lock"; trap 'rm -rf "${remoteTmp}" "$deploy_lock"' EXIT`);
      }

      if (frontendDeploymentEnabled) {
        const frontendTarget = remoteNuxtDir;
        const remoteStaging = path.posix.join(remoteTmp, "frontend-staging");
        const remoteSnapshot = path.posix.join(remoteBackupDir, `${REMOTE_SNAPSHOT_PREFIX}${stamp}`);
        const remoteFingerprintPath = path.posix.join(remoteBackupDir, REMOTE_FRONTEND_FINGERPRINT_FILE);
        const remoteNuxtNodeModulesDir = path.posix.join(frontendTarget, "server", "node_modules");
        const preservedNodeModulesDir = path.posix.join(remoteTmp, "server-node_modules");
        const frontendServerDir = path.posix.join(frontendTarget, "server");
        const remotePackageFile = path.posix.join(frontendServerDir, "package.json");
        const remoteNodeModulesDir = path.posix.join(frontendServerDir, "node_modules");
        const remoteInstallMarker = path.posix.join(remoteBackupDir, "nuxt-server-package.sha256");

        remoteSteps.push(`frontend_target='${frontendTarget}'; frontend_staging='${remoteStaging}'; frontend_snapshot='${remoteSnapshot}'; preserved_node_modules='${preservedNodeModulesDir}'; mkdir -p '${path.posix.dirname(frontendTarget)}' '${remoteBackupDir}'; rm -rf "$frontend_staging"; mkdir -p "$frontend_staging"; tar -xzf '${path.posix.join(remoteTmp, "frontend.tar.gz")}' -C "$frontend_staging"`);
        remoteSteps.push(`test -f "$frontend_staging/server/index.mjs" && test -f "$frontend_staging/server/package.json"`);
        remoteSteps.push(`frontend_swapped=0; frontend_snapshot_created=0; rollback_frontend() { rc=$?; trap - ERR; if [ "$frontend_swapped" = "1" ]; then rm -rf "$frontend_target"; fi; if [ "$frontend_snapshot_created" = "1" ] && [ -e "$frontend_snapshot" ]; then mv "$frontend_snapshot" "$frontend_target"; fi; if [ -d "$preserved_node_modules" ]; then mkdir -p '${frontendServerDir}'; mv "$preserved_node_modules" '${remoteNuxtNodeModulesDir}'; fi; if [ -n '${frontendService || ""}' ] && ! systemctl is-active --quiet '${frontendService}'; then sudo systemctl start '${frontendService}'; fi; exit "$rc"; }; trap rollback_frontend ERR`);
        if (!options.noRestart) {
          remoteSteps.push(`sudo systemctl stop '${frontendService}'`);
        }
        remoteSteps.push(`if [ -d '${remoteNuxtNodeModulesDir}' ]; then mv '${remoteNuxtNodeModulesDir}' '${preservedNodeModulesDir}'; fi`);
        if (!options.skipBackup) {
          remoteSteps.push(`if [ -e "$frontend_target" ]; then rm -rf "$frontend_snapshot"; mv "$frontend_target" "$frontend_snapshot"; frontend_snapshot_created=1; fi`);
        } else {
          remoteSteps.push(`rm -rf "$frontend_target"`);
        }
        remoteSteps.push(`mv "$frontend_staging" "$frontend_target"; frontend_swapped=1`);
        remoteSteps.push(`if [ -d "$preserved_node_modules" ]; then mkdir -p '${frontendServerDir}'; mv "$preserved_node_modules" '${remoteNuxtNodeModulesDir}'; fi`);
        if (!options.skipRemoteInstall) {
          remoteSteps.push(
            `package_file='${remotePackageFile}'; node_modules_dir='${remoteNodeModulesDir}'; install_marker='${remoteInstallMarker}'; package_hash="$(sha256sum "$package_file" | awk '{print $1}')"; if [ ! -d "$node_modules_dir" ] || [ ! -f "$install_marker" ] || [ "$(cat "$install_marker")" != "$package_hash" ]; then (cd '${frontendServerDir}' && bun install --production --no-save --ignore-scripts); printf '%s' "$package_hash" > "$install_marker"; fi`,
          );
        } else {
          log('Skipping remote Nitro dependency install by request.', 'warn');
        }
        if (!options.noRestart) {
          remoteSteps.push(`sudo systemctl start '${frontendService}'`);
        }
        remoteSteps.push(`printf '%s' '${frontendFingerprint}' > '${remoteFingerprintPath}'`);
        if (!options.skipBackup && !options.preserveSnapshots) {
          remoteSteps.push(`find '${remoteBackupDir}' -mindepth 1 -maxdepth 1 -type d -name '${REMOTE_SNAPSHOT_PREFIX}*' -printf '%f\\n' | sort -r | tail -n +$(( ${REMOTE_SNAPSHOT_LIMIT} + 1 )) | while read snapshot_name; do rm -rf '${remoteBackupDir}/'$snapshot_name; done`);
        }
        if (webServerReloadCommand) {
          remoteSteps.push(webServerReloadCommand);
        }
        remoteSteps.push(`trap - ERR`);
      }

      if (!frontendDeploymentEnabled) {
        remoteSteps.push(`rm -rf '${remoteTmp}'`);
      }

      const remoteScript = remoteSteps.join("\n");
      log(`Remote execution script:\n${remoteScript}`, "info");

      log("Executing remote deployment steps on Linux Server...", "info");
      runLocal("ssh", [...sshPortArgs, remote, remoteScript]);
    }

    log(`Deploy completed successfully to ${server}.`, "ok");
    restoreFrontendDev();
  } finally {
    if (frontendArchive && fs.existsSync(frontendArchive)) {
      fs.unlinkSync(frontendArchive);
    }
    if (frontendArchiveStage && fs.existsSync(frontendArchiveStage)) {
      fs.rmSync(frontendArchiveStage, { recursive: true, force: true });
    }
    if (remoteScriptFile && fs.existsSync(remoteScriptFile)) {
      fs.unlinkSync(remoteScriptFile);
    }
    restoreFrontendDev();
  }
}

module.exports = {
  isRepositoryNuxtDevProcess,
  listeningPortsForPid,
  collectDeploymentFiles,
  computeDeploymentFingerprint,
  validateReusableNitroOutput,
  buildRemoteFrontendHealthScript,
  buildRemoteFrontendHealthCommand,
  isNitroFingerprintUnchanged,
  readRemoteFrontendFingerprint,
  shouldIncludeDeploymentPath,
  REMOTE_FRONTEND_FINGERPRINT_FILE,
  REMOTE_FRONTEND_LOCK_FILE,
  REMOTE_SNAPSHOT_PREFIX,
  REMOTE_SNAPSHOT_LIMIT,
};

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (e) {
    log(e && e.message ? e.message : String(e), "err");
    process.exit(1);
  }
}
