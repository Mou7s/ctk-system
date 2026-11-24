import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const deploy = require('../../deploy.js')

describe('deploy.js Docker Compose target & helpers', () => {
  let root

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ctk-deploy-test-'))
    for (const file of ['Dockerfile', 'docker-compose.yml', '.dockerignore', 'package.json', 'bun.lock', 'nuxt.config.ts']) {
      writeFileSync(join(root, file), `${file}-content\n`)
    }
    mkdirSync(join(root, 'app', 'pages'), { recursive: true })
    mkdirSync(join(root, 'server', 'utils'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(join(root, '.nuxt'), { recursive: true })
    mkdirSync(join(root, '.output'), { recursive: true })

    writeFileSync(join(root, 'app', 'pages', 'index.vue'), '<template/>')
    writeFileSync(join(root, 'server', 'utils', 'ping.ts'), 'export const ping = 1')
    writeFileSync(join(root, 'docs', 'notes.md'), '# docs')
    writeFileSync(join(root, '.env.docker'), 'MYSQL_ROOT_PASSWORD=secret')
    writeFileSync(join(root, 'local.env'), 'TOKEN_SECRET=secret')
    writeFileSync(join(root, 'deploy.config.json'), '{"server":"192.0.2.182"}')
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'ignored')
    writeFileSync(join(root, '.nuxt', 'cache.mjs'), 'ignored')
    writeFileSync(join(root, '.output', 'server.mjs'), 'ignored')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('defaults to placeholder Docker Compose target when deploy.config.json is absent', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'ctk-deploy-empty-'))
    try {
      const config = deploy.loadDeployConfig(emptyDir)
      expect(config.deployMode).toBe('docker')
      expect(config.server).toBe('192.0.2.182')
      expect(config.user).toBe('deploy')
      expect(config.remoteAppDir).toBe('/srv/ctk-system/app')
      expect(config.dockerProfiles).toEqual(['local-db'])
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it('never collects .env.docker, local.env, deploy.config.json, node_modules, .nuxt, or .output', () => {
    const files = deploy.collectDockerDeploymentFiles(root).map((item) => item.path)
    expect(files).toContain('Dockerfile')
    expect(files).toContain('app/pages/index.vue')
    expect(files).toContain('server/utils/ping.ts')
    expect(files).toContain('docs/notes.md')
    expect(files.some((p) => p.includes('.env.docker') && p !== '.env.docker.example')).toBe(false)
    expect(files.some((p) => p.includes('local.env') && p !== 'local.env.example')).toBe(false)
    expect(files).not.toContain('deploy.config.json')
    expect(files.some((p) => p.startsWith('node_modules') || p.startsWith('.nuxt') || p.startsWith('.output'))).toBe(false)
  })

  it('ignores markdown docs edits in Docker build fingerprint while detecting source/Dockerfile edits', () => {
    const fp1 = deploy.computeDockerDeploymentFingerprint(root)
    writeFileSync(join(root, 'docs', 'notes.md'), '# updated docs only')
    const fp2 = deploy.computeDockerDeploymentFingerprint(root)
    expect(fp2).toBe(fp1)

    writeFileSync(join(root, 'server', 'utils', 'ping.ts'), 'export const ping = 2')
    const fp3 = deploy.computeDockerDeploymentFingerprint(root)
    expect(fp3).not.toBe(fp1)
  })

  it('generates remote Docker deploy script preserving .env.docker, building before stop, and guarding mpv', () => {
    const config = deploy.loadDeployConfig(root)
    const script = deploy.buildDockerDeployScript(config, {
      stamp: '20261117-1',
      remoteArchive: '/tmp/ctk-src-20261117-1.tar.gz',
      fingerprint: 'abc123',
      skipSourceSync: false,
      cleanBuild: true,
      forceDuringPlayback: false,
    })
    expect(script).toContain("test -f \"$APP_DIR/.env.docker\"")
    expect(script).toContain('rsync -a --delete "$STAGE_DIR/app/" "$APP_DIR/app/"')
    expect(script).toContain('.env.docker|.env.docker.*|.deploy-source.sha256')
    expect(script).toContain("docker compose --env-file '.env.docker' --profile 'local-db' build --no-cache 'app'")
    expect(script).toContain('pgrep -x mpv')
    expect(script).toContain("docker compose --env-file '.env.docker' --profile 'local-db' up -d")
    expect(script).toContain("curl -fsS 'http://127.0.0.1/app-version'")
  })

  it('packs UTF-8 Chinese filenames and long paths (>100 chars) into valid PAX tar.gz', () => {
    const deepDir = join(root, 'app', 'nested', 'very-deep-folder-segment-for-testing-long-posix-paths-over-100-bytes')
    mkdirSync(deepDir, { recursive: true })
    mkdirSync(join(root, 'server', 'templates'), { recursive: true })
    writeFileSync(join(root, 'server', 'templates', '内贸销售报价单模板.xlsx'), 'excel-bytes')
    writeFileSync(join(deepDir, '组件文件-测试.vue'), '<template>ok</template>')

    const files = deploy.collectDockerDeploymentFiles(root)
    const archivePath = join(root, 'bundle.tar.gz')
    deploy.createTarGzFromFileList(root, files, archivePath)

    const zlib = require('node:zlib')
    const rawTar = zlib.gunzipSync(require('node:fs').readFileSync(archivePath)).toString('utf8')
    expect(rawTar).toContain('path=server/templates/内贸销售报价单模板.xlsx')
    expect(rawTar).toContain('组件文件-测试.vue')
  })
})
