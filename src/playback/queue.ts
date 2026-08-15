import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { errorMessage } from '../errors.js';
import { acquireDirectoryLock, isProcessAlive } from '../runtime/file-lock.js';
import { createPlaybackPaths, type PlaybackPaths } from './paths.js';

export interface PlaybackJob {
  character: string;
  createdAt: string;
  id: string;
  sequence: number;
  speakerId: number;
  style: string;
}

interface WorkerState {
  pid: number;
  startedAt: string;
}

interface CurrentState extends PlaybackJob {
  playbackStartedAt: string;
}

export interface QueueStatus {
  current?: CurrentState;
  pending: number;
  workerRunning: boolean;
}

export interface StopResult {
  cleared: number;
  signaledWorker: boolean;
}

export type WorkerLauncher = (entryPath: string, dataDir: string) => void;

function launchDetachedWorker(entryPath: string, dataDir: string): void {
  const child = spawn(process.execPath, [entryPath, 'player-worker'], {
    detached: true,
    env: {
      ...process.env,
      VOICEVOX_MCP_DATA_DIR: dataDir,
      VOICEVOX_MCP_PLAYER_WORKER: '1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', (error) => {
    console.error(`再生ワーカーを起動できません: ${errorMessage(error)}`);
  });
  child.unref();
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
}

function isPlaybackJob(value: unknown): value is PlaybackJob {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<PlaybackJob>;
  return (
    typeof candidate.id === 'string' &&
    /^[0-9a-f-]{36}$/u.test(candidate.id) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.character === 'string' &&
    typeof candidate.style === 'string' &&
    typeof candidate.sequence === 'number' &&
    Number.isSafeInteger(candidate.sequence) &&
    candidate.sequence > 0 &&
    typeof candidate.speakerId === 'number' &&
    Number.isInteger(candidate.speakerId)
  );
}

export class PlaybackQueue {
  readonly dataDir: string;
  readonly entryPath: string;
  readonly paths: PlaybackPaths;
  private readonly launchWorker: WorkerLauncher;

  constructor(dataDir: string, entryPath: string, launchWorker: WorkerLauncher = launchDetachedWorker) {
    this.dataDir = dataDir;
    this.entryPath = entryPath;
    this.paths = createPlaybackPaths(dataDir);
    this.launchWorker = launchWorker;
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.queueDir, { recursive: true }),
      mkdir(dirname(this.paths.workerState), { recursive: true }),
      mkdir(this.paths.locksDir, { recursive: true }),
      mkdir(this.paths.logsDir, { recursive: true }),
    ]);
  }

  jobPath(id: string): string {
    return join(this.paths.queueDir, `${id}.json`);
  }

  wavPath(id: string): string {
    return join(this.paths.queueDir, `${id}.wav`);
  }

  async enqueue(
    wav: Uint8Array,
    voice: { character: string; speakerId: number; style: string },
  ): Promise<PlaybackJob> {
    await this.initialize();
    const lock = await acquireDirectoryLock(this.paths.enqueueLock, {
      staleAfterMs: 60_000,
      timeoutMs: 10_000,
    });
    let job: PlaybackJob | undefined;
    let temporaryWav: string | undefined;
    try {
      const previous = await readJson<unknown>(this.paths.sequenceState);
      const sequence = typeof previous === 'number' && Number.isSafeInteger(previous) ? previous + 1 : 1;
      const id = randomUUID();
      job = {
        character: voice.character,
        createdAt: new Date().toISOString(),
        id,
        sequence,
        speakerId: voice.speakerId,
        style: voice.style,
      };
      const wavPath = this.wavPath(id);
      temporaryWav = `${wavPath}.${randomUUID()}.tmp`;
      // 先に番号を確定する。途中で失敗して番号が欠番になっても、重複するより安全である。
      await writeJsonAtomic(this.paths.sequenceState, sequence);
      await writeFile(temporaryWav, wav);
      await rename(temporaryWav, wavPath);
      await writeJsonAtomic(this.jobPath(id), job);
    } catch (error) {
      await Promise.allSettled([
        ...(temporaryWav === undefined ? [] : [rm(temporaryWav, { force: true })]),
        ...(job === undefined
          ? []
          : [rm(this.wavPath(job.id), { force: true }), rm(this.jobPath(job.id), { force: true })]),
      ]);
      throw error;
    } finally {
      await lock.release();
    }
    if (job === undefined) {
      throw new Error('再生ジョブを作成できませんでした。');
    }
    this.ensureWorker();
    return job;
  }

  ensureWorker(): void {
    this.launchWorker(this.entryPath, this.dataDir);
  }

  async listJobs(): Promise<PlaybackJob[]> {
    let directoryEntries: string[];
    try {
      directoryEntries = await readdir(this.paths.queueDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const files = directoryEntries.filter((file) => /^[0-9a-f-]{36}\.json$/u.test(file));
    const jobs = await Promise.all(
      files.map(async (file) => {
        const value = await readJson<unknown>(join(this.paths.queueDir, file));
        return isPlaybackJob(value) ? value : undefined;
      }),
    );
    return jobs
      .filter((job): job is PlaybackJob => job !== undefined)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async readCurrent(): Promise<CurrentState | undefined> {
    return readJson<CurrentState>(this.paths.currentState);
  }

  async readWorker(): Promise<WorkerState | undefined> {
    const state = await readJson<WorkerState>(this.paths.workerState);
    return state !== undefined && isProcessAlive(state.pid) ? state : undefined;
  }

  async status(): Promise<QueueStatus> {
    const [jobs, current, worker] = await Promise.all([this.listJobs(), this.readCurrent(), this.readWorker()]);
    return {
      ...(current === undefined ? {} : { current }),
      pending: jobs.filter((job) => job.id !== current?.id).length,
      workerRunning: worker !== undefined,
    };
  }

  async requestStop(): Promise<StopResult> {
    await this.initialize();
    const [worker, current, jobs] = await Promise.all([this.readWorker(), this.readCurrent(), this.listJobs()]);
    if (worker !== undefined) {
      await writeJsonAtomic(this.paths.stopRequest, {
        createdAt: new Date().toISOString(),
        requestedByPid: process.pid,
      });
    }

    const removable = jobs.filter((job) => job.id !== current?.id);
    await Promise.allSettled(
      removable.flatMap((job) => [
        rm(this.jobPath(job.id), { force: true }),
        rm(this.wavPath(job.id), { force: true }),
      ]),
    );
    if (worker === undefined) {
      await rm(this.paths.stopRequest, { force: true });
    }
    return { cleared: removable.length, signaledWorker: worker !== undefined };
  }

  async removeJob(job: PlaybackJob): Promise<void> {
    await Promise.allSettled([
      rm(this.jobPath(job.id), { force: true }),
      rm(this.wavPath(job.id), { force: true }),
    ]);
  }

  async writeWorkerState(value: WorkerState): Promise<void> {
    await writeJsonAtomic(this.paths.workerState, value);
  }

  async writeCurrentState(value: CurrentState): Promise<void> {
    await writeJsonAtomic(this.paths.currentState, value);
  }
}
