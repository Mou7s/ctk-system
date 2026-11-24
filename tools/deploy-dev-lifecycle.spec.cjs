const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { isRepositoryNuxtDevProcess, listeningPortsForPid } = require('../deploy.js');

test('local dev ownership requires this checkout Nuxt CLI argument and a valid PID', () => {
  const root = path.resolve('checkout with spaces');
  const cli = path.join(root, 'node_modules/@nuxt/cli/dist/dev/index.mjs');
  const entry = { ProcessId: 123, CommandLine: `bun --enable-source-maps "${cli}"` };
  assert.equal(isRepositoryNuxtDevProcess(entry, root), true);
  const simpleRoot = path.resolve('checkout');
  assert.equal(isRepositoryNuxtDevProcess({ ProcessId: 123, CommandLine: `bun --enable-source-maps ${path.join(simpleRoot, 'node_modules/@nuxt/cli/dist/dev/index.mjs')}` }, simpleRoot), true);
  assert.equal(isRepositoryNuxtDevProcess({ ...entry, CommandLine: entry.CommandLine.replace(/\\/g, '/') }, root), true);
  assert.equal(isRepositoryNuxtDevProcess({ ...entry, ProcessId: 0 }, root), false);
  assert.equal(isRepositoryNuxtDevProcess({ ...entry, CommandLine: `bun "${cli}.backup"` }, root), false);
  assert.equal(isRepositoryNuxtDevProcess(entry, path.resolve('another checkout')), false);
  assert.equal(isRepositoryNuxtDevProcess({ ProcessId: 123, CommandLine: 'bun run dev --port 5173' }, root), false);
  assert.equal(isRepositoryNuxtDevProcess({ ProcessId: 123 }, root), false);
});

test('restart readiness reads the matched PID actual listening port, including fallback ports', () => {
  const output = [
    '  TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    999',
    '  TCP    [::]:3001       [::]:0       LISTENING    123',
    '  TCP    127.0.0.1:3000 127.0.0.1:80 ESTABLISHED  123',
    '  UDP    0.0.0.0:3002   *:*          123',
  ].join('\r\n');
  assert.deepEqual(listeningPortsForPid(output, 123), [3001]);
  assert.deepEqual(listeningPortsForPid(output, 456), []);
});
