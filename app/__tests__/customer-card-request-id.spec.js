import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as requestIds from '../utils/requestId.js';

describe('HTTP 名片录入请求标识', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('HTTP 环境没有 randomUUID 时，点击录入仍能打开弹窗并生成合法标识', () => {
    const source = readFileSync(new URL('../pages/tk_custom/customerCard/index.vue', import.meta.url), 'utf8');
    const start = source.indexOf('function newCard()');
    const end = source.indexOf('async function recognize(', start);
    const ref = () => ({ value: '' });
    const context = {
      crypto: {}, createClientRequestUuid: requestIds.createClientRequestUuid,
      form: {}, customerCardFields: [['company', '公司名称']], matches: ref(), rawText: ref(), message: ref(),
      saveToken: ref(), editorOpen: ref(), recognitionStatus: ref(),
    };
    vi.stubGlobal('crypto', {});
    vm.runInNewContext(`${source.slice(start, end)}; newCard();`, context);
    expect(context.editorOpen.value).toBe(true);
    expect(context.saveToken.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it('HTTP 只有 getRandomValues 时生成36位 UUID，并保留版本与变体位', () => {
    vi.stubGlobal('crypto', { getRandomValues: bytes => { bytes.fill(255); return bytes; } });
    expect(requestIds.createClientRequestUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('缺少 crypto 时，即使时钟和随机值相同也不会生成相同请求标识', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(1720000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const first = requestIds.createClientRequestUuid(), second = requestIds.createClientRequestUuid();
    expect(first).toHaveLength(36); expect(second).not.toBe(first);
  });
  it('HTTPS 支持原生 UUID 时使用原生方法', () => {
    const uuid = '12345678-1234-4234-8234-123456789012';
    vi.stubGlobal('crypto', { randomUUID: () => uuid });
    expect(requestIds.createClientRequestUuid()).toBe(uuid);
  });
});
