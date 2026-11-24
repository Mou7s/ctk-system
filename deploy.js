const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");
const zlib = require("zlib");

const rootDir = __dirname;
const appDir = rootDir;

const REMOTE_FRONTEND_FINGERPRINT_FILE = "nuxt-current.sha256";
const REMOTE_DOCKER_FINGERPRINT_FILE = ".deploy-source.sha256";
const REMOTE_FRONTEND_LOCK_FILE = "nuxt-deploy.lock";
const REMOTE_DOCKER_LOCK_FILE = "ctk-system-docker-deploy.lock";
const REMOTE_SNAPSHOT_PREFIX = "nuxt-snapshot-";
const REMOTE_SNAPSHOT_LIMIT = 3;

const DOCKER_ROOT_FILES = [
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  ".env.docker.example",
  ".env.production",
  "local.env.example",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "nuxt.config.ts",
  "app.config.ts",
  "patch.cjs",
  "eslint.config.mjs",
  "vitest.config.js",
  "deploy.js",
  "deploy.config.example.json",
  "README.md",
  "AGENTS.md",
];

const DOCKER_SYNC_DIRS = [
  "app",
  "server",
  "vite",
  "types",
  "public",
  "deploy",
  "docs",
];

const DOCKER_FINGERPRINT_PREFIXES = [
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  ".env.production",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "nuxt.config.ts",
  "app.config.ts",
  "patch.cjs",
  "app/",
  "server/",
  "vite/",
  "types/",
  "public/",
  "deploy/docker/",
];

const EXCLUDED_DOCKER_BASENAMES = new Set([
  ".git",
  ".nuxt",
  ".output",
  "node_modules",
  "logs",
  "output",
  "outputs",
  "runtime",
  "scratch",
  "coverage",
  ".DS_Store",
  "Thumbs.db",
]);

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

const args = process.argv.slice(2);
const options = {
  skipBuild: args.includes("--skip-build"),
  fast: !args.includes("--full-build"),
  cleanBuild: args.includes("--clean-build") || args.includes("--clean-frontend") || args.includes("--no-cache"),
  cleanFrontend: args.includes("--clean-frontend") || args.includes("--clean-build"),
  force: args.includes("--force") || args.includes("--rebuild"),
  skipChecks: args.includes("--skip-checks"),
  verifyOnly: args.includes("--verify-only"),
  forceDuringPlayback: args.includes("--force-during-playback"),
  skipBackup: args.includes("--skip-backup"),
  preserveSnapshots: args.includes("--preserve-snapshots"),
  noRestart: args.includes("--no-restart"),
  dryRun: args.includes("--dry-run"),
  skipBunCheck: args.includes("--skip-bun-check"),
  skipRemoteInstall: args.includes("--skip-remote-install"),
  legacy: args.includes("--legacy"),
  nitro: true,
};

function shellJoinDisplay(cmd, argsList) {
  return [cmd, ...argsList]
    .map((item) => (/\s/.test(item) ? `"${item}"` : item))
    .join(" ");
}

function resolveWindowsExecutable(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "bun") {
    const candidate = path.join(os.homedir(), ".bun", "bin", "bun.exe");
    if (fs.existsSync(candidate)) return candidate;
    return "bun.exe";
  }
  return cmd;
}

function runLocal(cmd, argsList, cwd = rootDir) {
  const display = shellJoinDisplay(cmd, argsList);
  log(display, "run");
  if (options.dryRun) return true;

  const executable = resolveWindowsExecutable(cmd);
  const result = spawnSync(executable, argsList, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) {
    throw new Error(`Failed to execute "${cmd}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${display}`);
  }
  return true;
}

function runLocalQuiet(cmd, argsList, cwd = rootDir) {
  const executable = resolveWindowsExecutable(cmd);
  return spawnSync(executable, argsList, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
}

function windowsBsdTarPath() {
  if (process.platform !== "win32") return "";
  const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const candidate = path.join(systemRoot, "System32", "tar.exe");
  return fs.existsSync(candidate) ? candidate : "";
}

function createUstarHeader(name, size, mtimeSec, mode, typeflag) {
  const header = Buffer.alloc(512, 0);
  Buffer.from(name, "utf8").copy(header, 0, 0, 100);
  Buffer.from(`${mode.toString(8).padStart(7, "0")}\0`, "ascii").copy(header, 100);
  Buffer.from("0000000\0", "ascii").copy(header, 108);
  Buffer.from("0000000\0", "ascii").copy(header, 116);
  Buffer.from(`${size.toString(8).padStart(11, "0")}\0`, "ascii").copy(header, 124);
  Buffer.from(`${Math.max(0, Math.floor(mtimeSec)).toString(8).padStart(11, "0")}\0`, "ascii").copy(header, 136);
  header.fill(0x20, 148, 156);
  header.write(typeflag, 156, 1, "ascii");
  Buffer.from("ustar\0", "ascii").copy(header, 257);
  Buffer.from("00", "ascii").copy(header, 263);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i];
  Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148);
  return header;
}

function createPaxPathRecord(relPath) {
  const payload = ` path=${relPath}\n`;
  const bodyBytes = Buffer.byteLength(payload, "utf8");
  let totalLen = bodyBytes + String(bodyBytes).length;
  while (totalLen !== bodyBytes + String(totalLen).length) {
    totalLen = bodyBytes + String(totalLen).length;
  }
  return Buffer.from(`${totalLen}${payload}`, "utf8");
}

function padTarBlock(buf) {
  const rem = buf.length % 512;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(512 - rem, 0)]);
}

function createTarGzFromFileList(_sourceRoot, files, archivePath) {
  const chunks = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const stat = fs.statSync(file.sourcePath);
    const data = fs.readFileSync(file.sourcePath);
    const mode = stat.mode & 0o777 ? (stat.mode & 0o777) : 0o644;
    const mtimeSec = stat.mtimeMs / 1000;
    const pathBytes = Buffer.byteLength(file.path, "utf8");
    const needsPax = pathBytes > 99 || /[^\x20-\x7e]/.test(file.path);

    if (needsPax) {
      const paxData = createPaxPathRecord(file.path);
      chunks.push(createUstarHeader(`PaxHeaders/${i}`, paxData.length, mtimeSec, 0o644, "x"));
      chunks.push(padTarBlock(paxData));
    }

    const headerName = needsPax ? `entry-${i}` : file.path;
    chunks.push(createUstarHeader(headerName, data.length, mtimeSec, mode, "0"));
    if (data.length > 0) chunks.push(padTarBlock(data));
  }
  chunks.push(Buffer.alloc(1024, 0));
  const tarBuffer = Buffer.concat(chunks);
  fs.writeFileSync(archivePath, zlib.gzipSync(tarBuffer, { level: 6 }));
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isSensitiveEnvPath(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  const base = path.posix.basename(rel);
  if (base === "deploy.config.json") return true;
  if (base === "local.env" || (base.startsWith("local.env.") && base !== "local.env.example")) return true;
  if (base === ".env.docker" || (base.startsWith(".env.docker.") && base !== ".env.docker.example")) return true;
  if (base.endsWith(".log")) return true;
  return false;
}

function shouldIncludeDockerPath(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) return true;
  const parts = rel.split("/");
  if (parts.some((part) => EXCLUDED_DOCKER_BASENAMES.has(part))) return false;
  return !isSensitiveEnvPath(rel);
}

function isDockerFingerprintPath(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  return DOCKER_FINGERPRINT_PREFIXES.some((prefix) => (
    prefix.endsWith("/") ? rel.startsWith(prefix) : rel === prefix
  ));
}

function walkFilteredFiles(baseDir, subRelative, filterFn, acc) {
  const fullPath = path.join(baseDir, subRelative);
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.lstatSync(fullPath);
  if (stat.isSymbolicLink()) return;
  const normalized = normalizeRelativePath(subRelative);
  if (!filterFn(normalized)) return;

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(fullPath).sort()) {
      walkFilteredFiles(baseDir, path.join(subRelative, entry), filterFn, acc);
    }
    return;
  }
  if (stat.isFile()) {
    acc.push({ path: normalized, sourcePath: fullPath });
  }
}

function collectDockerDeploymentFiles(sourceRoot = rootDir) {
  const files = [];
  for (const fileName of DOCKER_ROOT_FILES) {
    const full = path.join(sourceRoot, fileName);
    if (fs.existsSync(full) && fs.lstatSync(full).isFile() && shouldIncludeDockerPath(fileName)) {
      files.push({ path: normalizeRelativePath(fileName), sourcePath: full });
    }
  }
  for (const dirName of DOCKER_SYNC_DIRS) {
    walkFilteredFiles(sourceRoot, dirName, shouldIncludeDockerPath, files);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function hashDeploymentEntries(entries) {
  const digest = crypto.createHash("sha256");
  for (const file of entries) {
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

function computeDockerDeploymentFingerprint(sourceRoot = rootDir, allFiles = collectDockerDeploymentFiles(sourceRoot)) {
  const buildInputs = allFiles.filter((file) => isDockerFingerprintPath(file.path));
  if (buildInputs.length === 0) {
    throw new Error(`No Docker build source files found under ${sourceRoot}`);
  }
  return hashDeploymentEntries(buildInputs);
}

function sshCommonArgs(sshPort) {
  return ["-p", String(sshPort || "22"), "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30"];
}

function scpCommonArgs(sshPort) {
  return ["-P", String(sshPort || "22"), "-o", "ConnectTimeout=10"];
}

function runRemoteBash(remote, sshPort, scriptText, { capture = false } = {}) {
  const encoded = Buffer.from(scriptText, "utf8").toString("base64");
  const cmd = `echo ${encoded} | base64 -d | bash -s`;
  const sshArgs = [...sshCommonArgs(sshPort), remote, cmd];
  if (capture) {
    const res = runLocalQuiet("ssh", sshArgs, rootDir);
    if (res.status !== 0) {
      return { ok: false, stdout: String(res.stdout || ""), stderr: String(res.stderr || ""), status: res.status };
    }
    return { ok: true, stdout: String(res.stdout || ""), stderr: String(res.stderr || ""), status: 0 };
  }
  runLocal("ssh", sshArgs, rootDir);
  return { ok: true, stdout: "", stderr: "", status: 0 };
}

function buildDockerVerifyScript(config) {
  const appContainer = config.appContainerName || "ctk-system-app";
  const webContainer = config.webContainerName || "ctk-caddy";
  const dbContainer = config.dbContainerName || "ctk-mysql";
  const envFile = config.dockerEnvFile || ".env.docker";
  const profiles = Array.isArray(config.dockerProfiles) ? config.dockerProfiles : ["local-db"];
  const profileFlags = profiles.map((p) => `--profile '${p}'`).join(" ");
  const healthUrl = config.healthUrl || "http://127.0.0.1/app-version";
  return [
    "set -euo pipefail",
    `cd '${config.remoteAppDir}'`,
    `docker compose --env-file '${envFile}' ${profileFlags} ps`,
    `app_health="$(docker inspect -f '{{.State.Health.Status}}' '${appContainer}' 2>/dev/null || echo missing)"`,
    `db_health="$(docker inspect -f '{{.State.Health.Status}}' '${dbContainer}' 2>/dev/null || echo missing)"`,
    `web_status="$(docker inspect -f '{{.State.Status}}' '${webContainer}' 2>/dev/null || echo missing)"`,
    `echo "HEALTH_SUMMARY app=$app_health db=$db_health caddy=$web_status"`,
    `test "$app_health" = "healthy"`,
    `test "$db_health" = "healthy" || test "$db_health" = "missing"`,
    `test "$web_status" = "running"`,
    `curl -fsS '${healthUrl}' && echo`,
    `if pgrep -x mpv >/dev/null 2>&1; then echo "MPV_ACTIVE=yes"; else echo "MPV_ACTIVE=no"; fi`,
  ].join("\n");
}

function buildDockerDeployScript(config, {
  stamp,
  remoteArchive,
  fingerprint,
  skipSourceSync,
  cleanBuild,
  forceDuringPlayback,
  syncDirs = DOCKER_SYNC_DIRS,
}) {
  const appDirRemote = config.remoteAppDir;
  const envFile = config.dockerEnvFile || ".env.docker";
  const buildService = config.dockerBuildService || "app";
  const appContainer = config.appContainerName || "ctk-system-app";
  const webContainer = config.webContainerName || "ctk-caddy";
  const profiles = Array.isArray(config.dockerProfiles) ? config.dockerProfiles : ["local-db"];
  const profileFlags = profiles.map((p) => `--profile '${p}'`).join(" ");
  const healthUrl = config.healthUrl || "http://127.0.0.1/app-version";
  const fingerprintPath = path.posix.join(appDirRemote, REMOTE_DOCKER_FINGERPRINT_FILE);
  const lockDir = `/tmp/${REMOTE_DOCKER_LOCK_FILE}`;
  const stageDir = `/tmp/ctk-src-stage-${stamp}`;
  const noCacheFlag = cleanBuild ? "--no-cache" : "";
  const guardPlayback = config.guardAudioPlayback !== false && !forceDuringPlayback;

  const lines = [
    "set -euo pipefail",
    `LOCK_DIR='${lockDir}'`,
    `STAGE_DIR='${stageDir}'`,
    `ARCHIVE='${remoteArchive}'`,
    `APP_DIR='${appDirRemote}'`,
    `if ! mkdir "$LOCK_DIR" 2>/dev/null; then echo "[ERROR] Another Docker deploy is already in progress ($LOCK_DIR)" >&2; exit 1; fi`,
    `cleanup() { rm -rf "$LOCK_DIR" "$STAGE_DIR" "$ARCHIVE"; }`,
    `trap cleanup EXIT`,
    `mkdir -p "$APP_DIR"`,
    `test -f "$APP_DIR/${envFile}" || { echo "[ERROR] Missing $APP_DIR/${envFile} on target host" >&2; exit 1; }`,
  ];

  if (!skipSourceSync) {
    lines.push(
      `rm -rf "$STAGE_DIR" && mkdir -p "$STAGE_DIR"`,
      `tar -xzf "$ARCHIVE" -C "$STAGE_DIR"`,
      `test -f "$STAGE_DIR/Dockerfile" && test -f "$STAGE_DIR/docker-compose.yml" && test -f "$STAGE_DIR/package.json"`,
      `test -d "$STAGE_DIR/app" && test -d "$STAGE_DIR/server"`,
      `if command -v rsync >/dev/null 2>&1; then`,
      ...syncDirs.map((dir) => `  if [ -d "$STAGE_DIR/${dir}" ]; then mkdir -p "$APP_DIR/${dir}"; rsync -a --delete "$STAGE_DIR/${dir}/" "$APP_DIR/${dir}/"; fi`),
      `else`,
      ...syncDirs.map((dir) => `  if [ -d "$STAGE_DIR/${dir}" ]; then rm -rf "$APP_DIR/${dir}"; cp -a "$STAGE_DIR/${dir}" "$APP_DIR/${dir}"; fi`),
      `fi`,
      `for f in "$STAGE_DIR"/* "$STAGE_DIR"/.[!.]*; do`,
      `  [ -e "$f" ] || continue`,
      `  base="$(basename "$f")"`,
      `  case "$base" in .env.docker|.env.docker.*|${REMOTE_DOCKER_FINGERPRINT_FILE}|${syncDirs.join("|")}) continue ;; esac`,
      `  if [ -f "$f" ]; then cp -f "$f" "$APP_DIR/$base"; fi`,
      `done`,
    );
  }

  lines.push(
    `cd "$APP_DIR"`,
    `echo "[STEP] Building Docker image (existing container remains online)..."`,
    `docker compose --env-file '${envFile}' ${profileFlags} build ${noCacheFlag} '${buildService}'`.replace(/\s+/g, " "),
  );

  if (guardPlayback) {
    lines.push(
      `if pgrep -x mpv >/dev/null 2>&1; then`,
      `  echo "[ERROR] Workshop jukebox mpv is currently playing; image pre-built, skipping container swap. Pass --force-during-playback to override." >&2`,
      `  exit 2`,
      `fi`,
    );
  }

  lines.push(
    `echo "[STEP] Recreating updated containers..."`,
    `docker compose --env-file '${envFile}' ${profileFlags} up -d`,
    `for i in $(seq 1 45); do`,
    `  st="$(docker inspect -f '{{.State.Health.Status}}' '${appContainer}' 2>/dev/null || echo starting)"`,
    `  if [ "$st" = "healthy" ]; then`,
    `    echo "Container ${appContainer} became healthy (attempt $i)"`,
    `    break`,
    `  fi`,
    `  if [ "$st" = "unhealthy" ]; then`,
    `    docker logs --tail 50 '${appContainer}' >&2 || true`,
    `    exit 1`,
    `  fi`,
    `  sleep 2`,
    `done`,
    `final_st="$(docker inspect -f '{{.State.Health.Status}}' '${appContainer}' 2>/dev/null || echo missing)"`,
    `if [ "$final_st" != "healthy" ]; then`,
    `  docker logs --tail 50 '${appContainer}' >&2 || true`,
    `  exit 1`,
    `fi`,
    `web_st="$(docker inspect -f '{{.State.Status}}' '${webContainer}' 2>/dev/null || echo missing)"`,
    `test "$web_st" = "running"`,
    `curl -fsS '${healthUrl}' && echo`,
    `printf '%s' '${fingerprint}' > '${fingerprintPath}'`,
    `docker image prune -f >/dev/null 2>&1 || true`,
    `docker compose --env-file '${envFile}' ${profileFlags} ps`,
  );

  return lines.join("\n");
}

function runDockerPrechecks() {
  if (options.skipChecks) {
    log("Skipping local lint & SQL checks (--skip-checks).", "warn");
    return;
  }
  log("Running pre-deploy checks (check:sql + lint)...", "info");
  runLocal("bun", ["run", "check:sql"], rootDir);
  runLocal("bun", ["run", "lint"], rootDir);
}

function deployDocker(config) {
  const remote = `${config.user}@${config.server}`;
  const sshPort = config.sshPort || "22";

  if (options.verifyOnly) {
    log(`Verifying Docker stack on ${remote} (${config.remoteAppDir})...`, "info");
    if (options.dryRun) {
      log("[DRY-RUN] Would run remote Docker health verification.", "info");
      return;
    }
    runRemoteBash(remote, sshPort, buildDockerVerifyScript(config));
    log("Docker stack health verification passed.", "ok");
    return;
  }

  runDockerPrechecks();

  const sourceFiles = collectDockerDeploymentFiles(rootDir);
  const fingerprint = computeDockerDeploymentFingerprint(rootDir, sourceFiles);
  log(`Collected ${sourceFiles.length} Docker deploy files (fingerprint=${fingerprint.slice(0, 12)}...).`, "info");

  if (!options.force && !options.cleanBuild && !options.dryRun) {
    const fingerprintPath = path.posix.join(config.remoteAppDir, REMOTE_DOCKER_FINGERPRINT_FILE);
    const probe = runRemoteBash(
      remote,
      sshPort,
      `if [ -f '${fingerprintPath}' ]; then cat '${fingerprintPath}'; fi`,
      { capture: true },
    );
    const remoteFingerprint = probe.ok ? probe.stdout.trim().toLowerCase() : "";
    if (isNitroFingerprintUnchanged(fingerprint, remoteFingerprint)) {
      log("Docker build source fingerprint unchanged; checking remote container health only...", "ok");
      runRemoteBash(remote, sshPort, buildDockerVerifyScript(config));
      log("Remote Docker stack is healthy and up-to-date; no rebuild needed.", "ok");
      return;
    }
  }

  const stamp = `${getTimestamp()}-${process.pid}`;
  const localArchive = path.join(os.tmpdir(), `ctk-docker-src-${stamp}.tar.gz`);
  const remoteArchive = `/tmp/ctk-src-${stamp}.tar.gz`;
  const remoteScript = buildDockerDeployScript(config, {
    stamp,
    remoteArchive,
    fingerprint,
    skipSourceSync: false,
    cleanBuild: options.cleanBuild,
    forceDuringPlayback: options.forceDuringPlayback,
  });

  if (options.dryRun) {
    log(`[DRY-RUN] Target: ${remote}:${config.remoteAppDir} (mode=docker, profiles=${(config.dockerProfiles || []).join(",")})`, "info");
    log(`[DRY-RUN] Would pack ${sourceFiles.length} source files into ${localArchive}`, "info");
    log(`[DRY-RUN] Remote bash pipeline preview:\n${remoteScript}`, "info");
    return;
  }

  try {
    log("Packing filtered source files into tar.gz (excluding .env.docker / node_modules / .nuxt / .output)...", "info");
    createTarGzFromFileList(rootDir, sourceFiles, localArchive);
    const archiveSizeMb = (fs.statSync(localArchive).size / (1024 * 1024)).toFixed(2);
    log(`Uploading source bundle (${archiveSizeMb} MB)...`, "info");
    runLocal("scp", [...scpCommonArgs(sshPort), localArchive, `${remote}:${remoteArchive}`], rootDir);
    log("Executing zero-downtime Docker build and rolling container check on remote host...", "info");
    runRemoteBash(remote, sshPort, remoteScript);
    log(`Docker deploy completed cleanly on ${config.server}.`, "ok");
  } finally {
    if (fs.existsSync(localArchive)) fs.unlinkSync(localArchive);
  }
}

// Legacy Nuxt dev server & raw-Nitro deployment helpers (kept for --legacy or deployMode="legacy")
function isRepositoryNuxtDevProcess(entry, sourceRoot = rootDir) {
  const pid = Number(entry?.ProcessId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const cliPath = path.join(sourceRoot, "node_modules", "@nuxt", "cli", "dist", "dev", "index.mjs").replace(/\\/g, "/").toLowerCase();
  const command = String(entry.CommandLine || "").replace(/\\/g, "/").toLowerCase();
  const argsList = command.match(/"[^"]*"|[^\s]+/g) || [];
  return argsList.some((arg) => arg.replace(/^"|"$/g, "") === cliPath);
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
  const child = spawn(resolveWindowsExecutable("bun"), ["run", "dev"], {
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
  return hashDeploymentEntries(collectDeploymentFiles(sourcePath));
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
    { cwd: rootDir, encoding: "utf8", shell: false, windowsHide: true },
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
          shell: false,
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
          shell: false,
          windowsHide: true,
        });
      })()
    : spawnSync("ssh", [...sshPortArgs, remote, command], {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
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

function deployLegacy(config) {
  const frontendDevEnv = { ...process.env };
  let shouldRestartFrontendDev = false;
  const restoreFrontendDev = () => {
    if (!shouldRestartFrontendDev) return;
    startFrontendDev(frontendDevEnv);
    shouldRestartFrontendDev = false;
  };

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

  if (!remoteNuxtDir || !frontendService) {
    throw new Error('Legacy Nitro deployment requires "remoteNuxtDir" and "frontendService" in configuration.');
  }
  if (!["bun", "node"].includes(frontendRuntime)) {
    throw new Error(`Unsupported frontendRuntime "${frontendRuntime}". Use "bun" or "node".`);
  }
  if (frontendRuntime === "bun" && remoteOs === "windows" && (!remoteRuntimeExecutable || !remoteServiceConfig)) {
    throw new Error('Bun Nitro deployment requires "remoteRuntimeExecutable" and "remoteServiceConfig" in configuration.');
  }

  log("Deployment mode: Legacy Nuxt 4 + Nitro artifact replacement.", "info");

  if (!options.skipBuild) {
    log("Building Nuxt 4 + Nitro application...", "info");
    if (!options.dryRun) {
      shouldRestartFrontendDev = stopLocalNuxtDevProcesses();
      if (shouldRestartFrontendDev) {
        log("Detected a running local Nuxt dev server; it will be restored after a successful deploy.", "info");
      }
    }

    if (!options.dryRun && (!options.fast || options.cleanFrontend)) {
      const nuxtCache = path.join(appDir, ".nuxt");
      const outputCache = path.join(appDir, ".output");
      if (fs.existsSync(nuxtCache)) fs.rmSync(nuxtCache, { recursive: true, force: true });
      if (fs.existsSync(outputCache)) fs.rmSync(outputCache, { recursive: true, force: true });
    }

    process.env.NODE_ENV = "production";
    process.env.BABEL_ENV = "production";
    process.env.NUXT_TELEMETRY_DISABLED = "1";
    const rawNuxtHeapMb = process.env.CTK_NUXT_MAX_OLD_SPACE_SIZE_MB || "5120";
    const nuxtHeapMb = Number(rawNuxtHeapMb);
    if (!Number.isInteger(nuxtHeapMb) || nuxtHeapMb < 1024 || nuxtHeapMb > 32768) {
      throw new Error(`CTK_NUXT_MAX_OLD_SPACE_SIZE_MB must be an integer between 1024 and 32768, got: ${rawNuxtHeapMb}`);
    }
    const preservedNodeOptions = String(process.env.NODE_OPTIONS || "").replace(/(?:^|\s)--max-old-space-size=\d+/g, " ").trim();
    const patchRequire = `--require=${path.join(appDir, "patch.cjs").replace(/\\/g, "/")}`;
    process.env.NODE_OPTIONS = [preservedNodeOptions, `--max-old-space-size=${nuxtHeapMb}`, patchRequire].filter(Boolean).join(" ");

    if (!options.fast || shouldInstallFrontendDependencies()) {
      runLocal("bun", ["install", "--frozen-lockfile"], appDir);
      if (!options.dryRun) markFrontendDependenciesInstalled();
    }
    process.env.NITRO_PRESET = frontendRuntime;
    runLocal("bun", ["run", "--bun", "nuxt", "build"], appDir);
  }

  let distPath = "";
  if (!options.dryRun || options.skipBuild) {
    const candidate = path.join(appDir, ".output");
    if (fs.existsSync(candidate) && fs.readdirSync(candidate).length > 0) distPath = candidate;
    if (!distPath) throw new Error("Nuxt Nitro output not found in .output.");
    if (options.skipBuild) validateReusableNitroOutput(distPath);
  }

  const stamp = `${getTimestamp()}-${process.pid}`;
  const remote = `${user}@${server}`;
  const scpPortArgs = ["-P", sshPort];
  const sshPortArgs = ["-p", sshPort];

  let frontendArchive = "";
  let frontendArchiveStage = "";
  let remoteScriptFile = "";
  let skipFrontendTransfer = false;
  let frontendFingerprint = "";

  if (!options.dryRun && !options.force) {
    frontendFingerprint = computeDeploymentFingerprint(distPath);
    const remoteFingerprint = readRemoteFrontendFingerprint(remote, sshPortArgs, remoteBackupDir, remoteOs);
    if (remoteFingerprint !== null && isNitroFingerprintUnchanged(frontendFingerprint, remoteFingerprint)) {
      try {
        checkRemoteFrontendHealth(remote, sshPortArgs, frontendService, remoteOs);
      } catch (error) {
        restoreFrontendDev();
        throw error;
      }
      skipFrontendTransfer = true;
      restoreFrontendDev();
      return;
    }
  } else if (!options.dryRun) {
    frontendFingerprint = computeDeploymentFingerprint(distPath);
  }

  try {
    if (remoteOs === "windows") {
      const remoteTmp = `C:\\Windows\\Temp\\ctk-system-deploy-${stamp}`;
      const remoteZipTmp = path.join(remoteTmp, "frontend.zip").replace(/\\/g, "/");
      const remoteLockPath = remotePathJoin(remoteBackupDir, REMOTE_FRONTEND_LOCK_FILE);
      const mkdirScript = `New-Item -ItemType Directory -Force -Path '${remoteTmp}','${remoteBackupDir}' | Out-Null; if (Test-Path -LiteralPath '${remoteLockPath}') { Remove-Item -LiteralPath '${remoteLockPath}' -Force -ErrorAction SilentlyContinue }`;
      runLocal("ssh", [...sshPortArgs, remote, `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodePowerShell(mkdirScript)}`]);

      if (!skipFrontendTransfer) {
        frontendArchive = path.join(os.tmpdir(), `ctk-frontend-${stamp}.zip`);
        if (!options.dryRun) {
          const bsdTar = windowsBsdTarPath();
          if (process.platform === "win32" && bsdTar) {
            runLocal(bsdTar, ["-a", "-cf", frontendArchive, "--exclude=server/node_modules", "-C", distPath, "."]);
          } else if (process.platform === "win32") {
            frontendArchiveStage = path.join(os.tmpdir(), `ctk-nitro-stage-${stamp}`);
            copyNitroTreeWithoutDependencies(distPath, frontendArchiveStage);
            runLocal("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${frontendArchiveStage}\\*' -DestinationPath '${frontendArchive}' -Force`]);
          } else {
            runLocal("tar", ["-a", "-cf", frontendArchive, "--exclude=server/node_modules", "-C", distPath, "."]);
          }
        }
        runLocal("scp", [...scpPortArgs, frontendArchive, `${remote}:${remoteZipTmp}`]);
      }

      const frontendTarget = remoteNuxtDir;
      const remoteStaging = path.join(remoteTmp, "frontend-staging");
      const remoteSnapshot = path.join(remoteBackupDir, `${REMOTE_SNAPSHOT_PREFIX}${stamp}`);
      const remoteFingerprintPath = path.join(remoteBackupDir, REMOTE_FRONTEND_FINGERPRINT_FILE);
      const remoteNuxtNodeModulesDir = path.join(frontendTarget, "server", "node_modules");
      const preservedNodeModulesDir = path.join(remoteTmp, "server-node_modules");
      const frontendServerDir = path.join(frontendTarget, "server");
      const remoteSteps = [
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "$OutputEncoding = [System.Text.Encoding]::UTF8",
        '$ErrorActionPreference = "Stop"',
        '$ProgressPreference = "SilentlyContinue"',
        `$deployLock = '${remoteLockPath}'; $deployLockDir = [System.IO.Path]::GetDirectoryName($deployLock); if (-not [System.IO.Directory]::Exists($deployLockDir)) { [System.IO.Directory]::CreateDirectory($deployLockDir) | Out-Null }; $lockHandle = $null; try { $lockHandle = [System.IO.File]::Open($deployLock, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None) } catch [System.IO.IOException] { throw "Another Nitro deployment is already running: $deployLock" }; try {`,
        `New-Item -ItemType Directory -Force -Path '${remoteBackupDir}','${path.dirname(frontendTarget)}' | Out-Null`,
        `if (Test-Path -LiteralPath '${remoteStaging}') { Remove-Item -LiteralPath '${remoteStaging}' -Recurse -Force }; New-Item -ItemType Directory -Force -Path '${remoteStaging}' | Out-Null`,
        `Expand-Archive -LiteralPath '${remoteZipTmp}' -DestinationPath '${remoteStaging}' -Force`,
        `$nuxtSvc = $null; $swapped = $false; try {`,
      ];
      if (!options.noRestart) {
        remoteSteps.push(`$nuxtSvc = Get-Service -Name "${frontendService}" -ErrorAction Stop; if ($nuxtSvc.Status -ne "Stopped") { Stop-Service -InputObject $nuxtSvc -Force; $nuxtSvc.WaitForStatus("Stopped", "00:01:30") }`);
      }
      remoteSteps.push(`if (Test-Path -LiteralPath '${remoteNuxtNodeModulesDir}') { Move-Item -LiteralPath '${remoteNuxtNodeModulesDir}' -Destination '${preservedNodeModulesDir}' -Force }`);
      if (!options.skipBackup) {
        remoteSteps.push(`if (Test-Path -LiteralPath '${frontendTarget}') { Move-Item -LiteralPath '${frontendTarget}' -Destination '${remoteSnapshot}' -Force }`);
      } else {
        remoteSteps.push(`if (Test-Path -LiteralPath '${frontendTarget}') { Remove-Item -LiteralPath '${frontendTarget}' -Recurse -Force }`);
      }
      remoteSteps.push(`Move-Item -LiteralPath '${remoteStaging}' -Destination '${frontendTarget}' -Force; $swapped = $true`);
      remoteSteps.push(`if (Test-Path -LiteralPath '${preservedNodeModulesDir}') { New-Item -ItemType Directory -Force -Path '${frontendServerDir}' | Out-Null; Move-Item -LiteralPath '${preservedNodeModulesDir}' -Destination '${remoteNuxtNodeModulesDir}' -Force }`);
      if (!options.noRestart) {
        remoteSteps.push(`Start-Service -InputObject $nuxtSvc; $nuxtSvc.WaitForStatus("Running", "00:01:30")`);
      }
      remoteSteps.push(`Set-Content -LiteralPath '${remoteFingerprintPath}' -Value '${frontendFingerprint}' -NoNewline`);
      if (!options.skipBackup && !options.preserveSnapshots) {
        remoteSteps.push(`Get-ChildItem -LiteralPath '${remoteBackupDir}' -Directory -Filter '${REMOTE_SNAPSHOT_PREFIX}*' | Sort-Object Name -Descending | Select-Object -Skip ${REMOTE_SNAPSHOT_LIMIT} | Remove-Item -Recurse -Force`);
      }
      if (webServerReloadCommand) remoteSteps.push(webServerReloadCommand);
      remoteSteps.push(`} catch { if ($swapped -and (Test-Path -LiteralPath '${frontendTarget}')) { Remove-Item -LiteralPath '${frontendTarget}' -Recurse -Force }; if (Test-Path -LiteralPath '${remoteSnapshot}') { Move-Item -LiteralPath '${remoteSnapshot}' -Destination '${frontendTarget}' -Force }; throw }`);
      const remoteScript = `${remoteSteps.join("; ")}; } finally { if ($lockHandle) { $lockHandle.Dispose() }; Remove-Item -LiteralPath '${remoteTmp}' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '${remoteLockPath}' -Force -ErrorAction SilentlyContinue }`;
      remoteScriptFile = path.join(os.tmpdir(), `ctk-remote-deploy-${stamp}.ps1`);
      fs.writeFileSync(remoteScriptFile, `\uFEFF${remoteScript}`, "utf8");
      const remoteScriptTmp = path.join(remoteTmp, "deploy.ps1").replace(/\\/g, "/");
      runLocal("scp", [...scpPortArgs, remoteScriptFile, `${remote}:${remoteScriptTmp}`]);
      runLocal("ssh", [...sshPortArgs, remote, `powershell -NoProfile -ExecutionPolicy Bypass -File "${remoteScriptTmp}"`]);
    } else {
      throw new Error("Non-Docker Linux legacy deployment is deprecated; use deployMode=docker.");
    }
    log(`Legacy deploy completed successfully to ${server}.`, "ok");
    restoreFrontendDev();
  } finally {
    if (frontendArchive && fs.existsSync(frontendArchive)) fs.unlinkSync(frontendArchive);
    if (frontendArchiveStage && fs.existsSync(frontendArchiveStage)) fs.rmSync(frontendArchiveStage, { recursive: true, force: true });
    if (remoteScriptFile && fs.existsSync(remoteScriptFile)) fs.unlinkSync(remoteScriptFile);
    restoreFrontendDev();
  }
}

function loadDeployConfig(sourceRoot = rootDir) {
  const defaultConfig = {
    deployMode: "docker",
    server: "192.0.2.182",
    user: "deploy",
    sshPort: "22",
    remoteOs: "linux",
    remoteAppDir: "/srv/ctk-system/app",
    dockerEnvFile: ".env.docker",
    dockerProfiles: ["local-db"],
    dockerBuildService: "app",
    appContainerName: "ctk-system-app",
    webContainerName: "ctk-caddy",
    dbContainerName: "ctk-mysql",
    healthUrl: "http://127.0.0.1/app-version",
    guardAudioPlayback: true,
  };
  let config = { ...defaultConfig };
  const configPath = path.join(sourceRoot, "deploy.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config = { ...config, ...localConfig };
      log(`Loaded configuration from: ${configPath}`, "info");
    } catch (error) {
      throw new Error(`Failed to parse ${configPath}: ${error.message}`);
    }
  }
  return config;
}

function main() {
  const config = loadDeployConfig(rootDir);
  if (!config.server || !config.user) {
    throw new Error('Deploy config must specify "server" and "user".');
  }
  const mode = options.legacy ? "legacy" : String(config.deployMode || "docker").toLowerCase();
  if (mode === "docker") {
    deployDocker(config);
    return;
  }
  if (mode === "legacy") {
    deployLegacy(config);
    return;
  }
  throw new Error(`Unsupported deployMode "${mode}". Expected "docker" or "legacy".`);
}

module.exports = {
  isRepositoryNuxtDevProcess,
  listeningPortsForPid,
  collectDeploymentFiles,
  computeDeploymentFingerprint,
  collectDockerDeploymentFiles,
  computeDockerDeploymentFingerprint,
  createTarGzFromFileList,
  buildDockerDeployScript,
  buildDockerVerifyScript,
  shouldIncludeDockerPath,
  isDockerFingerprintPath,
  validateReusableNitroOutput,
  buildRemoteFrontendHealthScript,
  buildRemoteFrontendHealthCommand,
  isNitroFingerprintUnchanged,
  readRemoteFrontendFingerprint,
  shouldIncludeDeploymentPath,
  loadDeployConfig,
  REMOTE_FRONTEND_FINGERPRINT_FILE,
  REMOTE_DOCKER_FINGERPRINT_FILE,
  REMOTE_FRONTEND_LOCK_FILE,
  REMOTE_DOCKER_LOCK_FILE,
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
