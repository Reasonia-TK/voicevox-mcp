import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VoicevoxMcpError } from '../src/errors.js';
import { EngineManager } from '../src/voicevox/engine-manager.js';
import type { EngineProbe } from '../src/voicevox/types.js';
import { testConfig } from './helpers.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'voicevox-mcp-engine-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('EngineManager', () => {
  it('起動済みなら新しいプロセスを作らない', async () => {
    const config = testConfig(await temporaryDirectory());
    const probe = vi.fn().mockResolvedValue({ reachable: true, ready: true, version: '0.25.2' });
    const spawnEngine = vi.fn();
    const manager = new EngineManager(config, { probe }, { exists: () => true, sleep: () => Promise.resolve(), spawnEngine });

    await expect(manager.ensureReady()).resolves.toEqual({ startedByMcp: false, version: '0.25.2' });
    expect(spawnEngine).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === 'win32')('停止中ならバックグラウンド起動して待つ', async () => {
    const dataDir = await temporaryDirectory();
    const config = { ...testConfig(dataDir), enginePath: join(dataDir, 'run.exe') };
    const results: EngineProbe[] = [
      { reachable: false, ready: false },
      { reachable: false, ready: false },
      { reachable: true, ready: true, version: '0.25.2' },
    ];
    const probe = vi.fn().mockImplementation(() => Promise.resolve(results.shift() ?? results.at(-1)));
    const spawnEngine = vi.fn().mockResolvedValue(undefined);
    const manager = new EngineManager(config, { probe }, { exists: () => true, sleep: () => Promise.resolve(), spawnEngine });

    await expect(manager.ensureReady()).resolves.toEqual({ startedByMcp: true, version: '0.25.2' });
    expect(spawnEngine).toHaveBeenCalledOnce();
    expect(spawnEngine.mock.calls[0]?.[1]).toContain('50021');
  });

  it('別アプリが応答するポートでは起動しない', async () => {
    const config = testConfig(await temporaryDirectory());
    const probe = vi.fn().mockResolvedValue({ reachable: true, ready: false, error: '形式違い' });
    const spawnEngine = vi.fn();
    const manager = new EngineManager(config, { probe }, { exists: () => true, sleep: () => Promise.resolve(), spawnEngine });

    await expect(manager.ensureReady()).rejects.toMatchObject({
      code: 'ENGINE_ENDPOINT_INVALID',
    });
    expect(spawnEngine).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === 'win32')('実行ファイルがなければ設定方法つきエラーにする', async () => {
    const dataDir = await temporaryDirectory();
    const config = { ...testConfig(dataDir), enginePath: join(dataDir, 'missing-run.exe') };
    const probe = vi.fn().mockResolvedValue({ reachable: false, ready: false });
    const spawnEngine = vi.fn();
    const manager = new EngineManager(config, { probe }, { exists: () => false, sleep: () => Promise.resolve(), spawnEngine });

    const error: unknown = await manager.ensureReady().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VoicevoxMcpError);
    if (!(error instanceof VoicevoxMcpError)) {
      throw new Error('VoicevoxMcpErrorではありません。');
    }
    expect(error.code).toBe('ENGINE_NOT_FOUND');
    expect(error.guidance).toContain('VOICEVOX_ENGINE_PATH');
    expect(spawnEngine).not.toHaveBeenCalled();
  });
});
