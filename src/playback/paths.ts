import { join } from 'node:path';

export interface PlaybackPaths {
  currentState: string;
  enqueueLock: string;
  locksDir: string;
  logsDir: string;
  playbackLock: string;
  queueDir: string;
  sequenceState: string;
  stopRequest: string;
  workerState: string;
}

export function createPlaybackPaths(dataDir: string): PlaybackPaths {
  const runtimeDir = join(dataDir, 'runtime');
  const locksDir = join(dataDir, 'locks');
  return {
    currentState: join(runtimeDir, 'current-playback.json'),
    enqueueLock: join(locksDir, 'queue-enqueue.lock'),
    locksDir,
    logsDir: join(dataDir, 'logs'),
    playbackLock: join(locksDir, 'playback.lock'),
    queueDir: join(dataDir, 'queue'),
    sequenceState: join(runtimeDir, 'queue-sequence.json'),
    stopRequest: join(runtimeDir, 'stop-playback.json'),
    workerState: join(runtimeDir, 'playback-worker.json'),
  };
}
