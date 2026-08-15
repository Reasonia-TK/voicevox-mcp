import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaybackQueue } from '../src/playback/queue.js';

const temporaryDirectories: string[] = [];

async function createQueue(launcher = vi.fn()) {
  const directory = await mkdtemp(join(tmpdir(), 'voicevox-mcp-queue-test-'));
  temporaryDirectories.push(directory);
  return { launcher, queue: new PlaybackQueue(directory, 'C:\\package\\dist\\index.js', launcher) };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('PlaybackQueue', () => {
  it('本文を保存せずWAVジョブをFIFOへ追加する', async () => {
    const { launcher, queue } = await createQueue();
    const first = await queue.enqueue(new TextEncoder().encode('RIFF12345678'), {
      character: 'ずんだもん',
      speakerId: 3,
      style: 'ノーマル',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await queue.enqueue(new TextEncoder().encode('RIFF87654321'), {
      character: 'ずんだもん',
      speakerId: 3,
      style: 'ノーマル',
    });

    const jobs = await queue.listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.id).toBe(first.id);
    expect(await readFile(queue.jobPath(first.id), 'utf8')).not.toContain('読み上げ本文');
    expect(launcher).toHaveBeenCalledTimes(2);
  });

  it('ワーカー不在時は待機ジョブをすべて削除する', async () => {
    const { queue } = await createQueue();
    await queue.enqueue(new TextEncoder().encode('RIFF12345678'), {
      character: 'ずんだもん',
      speakerId: 3,
      style: 'ノーマル',
    });

    await expect(queue.requestStop()).resolves.toEqual({ cleared: 1, signaledWorker: false });
    await expect(queue.listJobs()).resolves.toEqual([]);
  });

  it('同時追加でもプロセス間ロック用の連番を割り当てる', async () => {
    const { queue } = await createQueue();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        queue.enqueue(new TextEncoder().encode(`RIFF${String(index).padStart(8, '0')}`), {
          character: 'ずんだもん',
          speakerId: 3,
          style: 'ノーマル',
        }),
      ),
    );

    const jobs = await queue.listJobs();
    expect(jobs.map((job) => job.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
