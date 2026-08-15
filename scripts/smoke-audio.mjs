import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../dist/config.js';
import { VoicevoxService } from '../dist/service.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(repositoryRoot, 'dist', 'index.js');
const dataDir = join(repositoryRoot, 'build', 'audio-smoke-runtime');
const config = loadConfig({ ...process.env, VOICEVOX_MCP_DATA_DIR: dataDir });
const service = new VoicevoxService(config, entryPath);

const result = await service.speak({ text: '音声テストは成功なのだ。これで読み上げ準備は完了だよ。' });
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const status = await service.queue.status();
  if (status.pending === 0 && !status.workerRunning) {
    process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
    process.stdout.write('Audible playback smoke test passed.\n');
    process.exit(0);
  }
  await delay(100);
}

throw new Error(`再生キューが30秒以内に完了しませんでした: ${JSON.stringify(await service.queue.status())}`);
