const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const deploy = require(path.join(__dirname, "..", "deploy.js"));

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createNitroOutput(root) {
  const output = path.join(root, "output");
  writeFile(path.join(output, "server", "index.mjs"), "export default {};");
  writeFile(path.join(output, "server", "package.json"), '{"dependencies":{}}');
  writeFile(path.join(output, "public", "index.html"), "<html></html>");
  writeFile(path.join(output, "server", "node_modules", "platform-only.txt"), "do not ship");
  return output;
}

test("Nitro fingerprint excludes server/node_modules and changes with deployed files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-deploy-fingerprint-"));
  try {
    const output = createNitroOutput(root);
    const files = deploy.collectDeploymentFiles(output).map((file) => file.path);
    assert.ok(files.includes("server/index.mjs"));
    assert.ok(!files.some((file) => file.startsWith("server/node_modules/")));

    const first = deploy.computeDeploymentFingerprint(output);
    writeFile(path.join(output, "server", "node_modules", "platform-only.txt"), "changed dependency");
    assert.equal(deploy.computeDeploymentFingerprint(output), first);
    writeFile(path.join(output, "server", "index.mjs"), "export default { changed: true };");
    assert.notEqual(deploy.computeDeploymentFingerprint(output), first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("single archive excludes server/node_modules", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-deploy-archive-"));
  try {
    const output = createNitroOutput(root);
    const archive = path.join(root, "frontend.zip");
    const archiveResult = spawnSync("tar", [
      "-a",
      "-cf",
      archive,
      "--exclude=server/node_modules",
      "-C",
      output,
      ".",
    ], { encoding: "utf8", windowsHide: true });
    if (archiveResult.error || archiveResult.status !== 0) {
      t.skip("tar -a is not available in this environment");
      return;
    }
    const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8", windowsHide: true });
    assert.equal(listing.status, 0, listing.stderr);
    assert.match(listing.stdout, /server\/index\.mjs/);
    assert.doesNotMatch(listing.stdout, /server\/node_modules/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--skip-build validation rejects missing and stale Nitro output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-deploy-skip-build-"));
  try {
    const source = path.join(root, "frontend");
    const output = createNitroOutput(path.join(root, "build"));
    writeFile(path.join(source, "app", "index.vue"), "<template />");
    writeFile(path.join(source, "server", "index.ts"), "export default {};");
    writeFile(path.join(source, "nuxt.config.ts"), "export default {};");
    writeFile(path.join(source, "package.json"), "{}");

    const old = new Date(Date.now() - 60_000);
    for (const filePath of [source, path.join(source, "app"), path.join(source, "server"), path.join(source, "nuxt.config.ts"), path.join(source, "package.json")]) {
      fs.utimesSync(filePath, old, old);
    }
    assert.equal(deploy.validateReusableNitroOutput(output, source), output);

    const newer = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(source, "app", "index.vue"), newer, newer);
    assert.throws(
      () => deploy.validateReusableNitroOutput(output, source),
      /cannot reuse stale Nitro output/,
    );
    assert.throws(
      () => deploy.validateReusableNitroOutput(path.join(root, "missing"), source),
      /requires a complete Nitro output/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dry-run remote script contains staging, lock, snapshot retention and rollback", () => {
  const result = spawnSync(process.execPath, ["deploy.js", "--dry-run", "--skip-bun-check"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /nuxt-deploy\.lock/);
  assert.match(output, /frontend-staging/);
  assert.match(output, /nuxt-snapshot-/);
  assert.match(output, /Select-Object -Skip 3/);
  assert.match(output, /Nitro rollback failed/);
  assert.match(output, /Would archive frontend assets to/);

  const scriptMatch = output.match(/Remote execution Script Block:\r?\n([\s\S]*?)\r?\n.*Executing remote deployment steps/);
  assert.ok(scriptMatch, "dry-run should print the generated PowerShell script");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-deploy-script-"));
  try {
    const scriptPath = path.join(root, "remote.ps1");
    fs.writeFileSync(scriptPath, scriptMatch[1], "utf8");
    const parse = spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.ToString() }; exit 1 }`,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(parse.status, 0, parse.stdout || parse.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("health command differs by remote operating system", () => {
  assert.match(deploy.buildRemoteFrontendHealthCommand("nuxt-ssr", "windows"), /Get-Service/);
  assert.equal(deploy.buildRemoteFrontendHealthCommand("nuxt-ssr", "linux"), "systemctl is-active --quiet 'nuxt-ssr'");
  assert.equal(deploy.REMOTE_SNAPSHOT_LIMIT, 3);
});

test("matching fingerprints short-circuit the remote deployment decision", () => {
  const fingerprint = "ABC123";
  assert.equal(deploy.isNitroFingerprintUnchanged(fingerprint, "abc123"), true);
  assert.equal(deploy.isNitroFingerprintUnchanged(fingerprint, "abc124"), false);
  assert.equal(deploy.isNitroFingerprintUnchanged(fingerprint, ""), false);
});
