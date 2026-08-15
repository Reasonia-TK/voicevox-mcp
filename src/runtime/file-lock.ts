import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface LockOwner {
  createdAt: string;
  pid: number;
}

export interface DirectoryLock {
  release: () => Promise<void>;
}

export interface LockOptions {
  pollMs?: number;
  staleAfterMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function canRemoveStaleLock(lockDir: string, staleAfterMs: number): Promise<boolean> {
  let owner: LockOwner | undefined;
  try {
    owner = JSON.parse(await readFile(join(lockDir, 'owner.json'), 'utf8')) as LockOwner;
  } catch {
    // mkdir直後に別プロセスがowner.jsonを書いている可能性があるため、mtimeも確認する。
  }

  if (owner !== undefined) {
    return !isProcessAlive(owner.pid);
  }

  try {
    const metadata = await stat(lockDir);
    return Date.now() - metadata.mtimeMs >= staleAfterMs;
  } catch {
    return false;
  }
}

export async function acquireDirectoryLock(
  lockDir: string,
  options: LockOptions = {},
): Promise<DirectoryLock> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollMs = options.pollMs ?? 100;
  const staleAfterMs = options.staleAfterMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;

  await mkdir(dirname(lockDir), { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir);
      const owner: LockOwner = { createdAt: new Date().toISOString(), pid: process.pid };
      try {
        await writeFile(join(lockDir, 'owner.json'), JSON.stringify(owner), 'utf8');
      } catch (error) {
        await rm(lockDir, { force: true, recursive: true });
        throw error;
      }
      let released = false;
      return {
        release: async () => {
          if (released) {
            return;
          }
          released = true;
          await rm(lockDir, { force: true, recursive: true });
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }
    }

    if (await canRemoveStaleLock(lockDir, staleAfterMs)) {
      await rm(lockDir, { force: true, recursive: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`ロックの取得がタイムアウトしました: ${lockDir}`);
    }
    await sleep(pollMs);
  }
}
