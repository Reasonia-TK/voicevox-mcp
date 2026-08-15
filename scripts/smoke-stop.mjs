import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../dist/config.js';
import { VoicevoxService } from '../dist/service.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(repositoryRoot, 'dist', 'index.js');
const dataDir = join(repositoryRoot, 'build', 'stop-smoke-runtime');
const config = loadConfig({ ...process.env, VOICEVOX_MCP_DATA_DIR: dataDir });
const service = new VoicevoxService(config, entryPath);

await service.speak({
  text: 'これは停止機能のテストなのだ。読み上げは途中で止まり、残りの文章は再生されない予定だよ。キューも空になることを確認するのだ。',
});

const startDeadline = Date.now() + 10_000;
while ((await service.queue.readCurrent()) === undefined && Date.now() < startDeadline) {
  await delay(50);
}
if ((await service.queue.readCurrent()) === undefined) {
  throw new Error('再生が10秒以内に開始されませんでした。');
}

await delay(300);
const stopResult = await service.stop();
if (!stopResult.signaledWorker) {
  throw new Error('再生ワーカーへ停止要求を送れませんでした。');
}

const stopDeadline = Date.now() + 10_000;
while (Date.now() < stopDeadline) {
  const status = await service.queue.status();
  if (status.pending === 0 && !status.workerRunning && status.current === undefined) {
    process.stdout.write(`${JSON.stringify(stopResult)}\n`);
    process.stdout.write('Active playback stop smoke test passed.\n');
    process.exit(0);
  }
  await delay(100);
}

throw new Error(`停止後も再生状態が残っています: ${JSON.stringify(await service.queue.status())}`);
