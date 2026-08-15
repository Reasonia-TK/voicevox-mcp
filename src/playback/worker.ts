import { appendFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { errorMessage } from '../errors.js';
import { acquireDirectoryLock } from '../runtime/file-lock.js';
import { PlaybackQueue, type PlaybackJob } from './queue.js';
import { playWav } from './windows-player.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopRequested(queue: PlaybackQueue): Promise<boolean> {
  try {
    await readFile(queue.paths.stopRequest);
    return true;
  } catch {
    return false;
  }
}

async function clearStopRequest(queue: PlaybackQueue): Promise<void> {
  await rm(queue.paths.stopRequest, { force: true });
}

async function logPlaybackError(queue: PlaybackQueue, error: unknown): Promise<void> {
  const line = `${new Date().toISOString()} ${errorMessage(error)}\n`;
  await appendFile(join(queue.paths.logsDir, 'playback.log'), line, 'utf8').catch(() => undefined);
}

async function playJob(queue: PlaybackQueue, job: PlaybackJob): Promise<void> {
  await queue.writeCurrentState({ ...job, playbackStartedAt: new Date().toISOString() });
  try {
    await playWav(queue.entryPath, queue.wavPath(job.id), () => stopRequested(queue));
  } catch (error) {
    await logPlaybackError(queue, error);
  } finally {
    await clearStopRequest(queue);
    await rm(queue.paths.currentState, { force: true });
    await queue.removeJob(job);
  }
}

export async function runPlaybackWorker(dataDir: string, entryPath: string): Promise<void> {
  const queue = new PlaybackQueue(dataDir, entryPath);
  await queue.initialize();
  const lock = await acquireDirectoryLock(queue.paths.playbackLock, {
    pollMs: 100,
    staleAfterMs: 10 * 60_000,
    timeoutMs: 15_000,
  });
  try {
    await queue.writeWorkerState({ pid: process.pid, startedAt: new Date().toISOString() });
    let emptyChecks = 0;
    while (emptyChecks < 2) {
      if (await stopRequested(queue)) {
        await clearStopRequest(queue);
      }
      const [job] = await queue.listJobs();
      if (job === undefined) {
        emptyChecks += 1;
        await sleep(500);
        continue;
      }
      emptyChecks = 0;
      await playJob(queue, job);
    }
  } finally {
    await Promise.allSettled([
      rm(queue.paths.currentState, { force: true }),
      rm(queue.paths.workerState, { force: true }),
    ]);
    await lock.release();
  }

  // ロック解放直前に追加されたジョブを取り残さないため、最後にもう一度確認する。
  if ((await queue.listJobs()).length > 0) {
    queue.ensureWorker();
  }
}
