import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { VoicevoxMcpError, errorMessage } from '../errors.js';

export interface PlayResult {
  stopped: boolean;
}

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot;
  if (systemRoot !== undefined && systemRoot.trim() !== '') {
    return join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }
  return 'powershell.exe';
}

export function packageRootFromEntry(entryPath: string): string {
  return dirname(dirname(entryPath));
}

function waitForExit(child: ChildProcess, shouldStop: () => Promise<boolean>): Promise<PlayResult> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    let settled = false;
    const timer = setInterval(() => {
      void shouldStop()
        .then((requested) => {
          if (requested && !stopped) {
            stopped = true;
            child.kill();
          }
        })
        .catch((error: unknown) => {
          console.error(`停止要求の確認に失敗しました: ${errorMessage(error)}`);
        });
    }, 100);

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      callback();
    };

    child.once('error', (error) => {
      finish(() => reject(error));
    });
    child.once('exit', (code, signal) => {
      finish(() => {
        if (code === 0 || stopped) {
          resolve({ stopped });
          return;
        }
        reject(new Error(`PowerShell再生プロセスが異常終了しました (code=${String(code)}, signal=${String(signal)})`));
      });
    });
  });
}

export async function playWav(
  entryPath: string,
  wavPath: string,
  shouldStop: () => Promise<boolean>,
): Promise<PlayResult> {
  if (process.platform !== 'win32') {
    throw new VoicevoxMcpError('PLATFORM_UNSUPPORTED', 'WAV再生はWindowsでのみ対応しています。');
  }
  const scriptPath = join(packageRootFromEntry(entryPath), 'scripts', 'play-wav.ps1');
  if (!existsSync(scriptPath)) {
    throw new VoicevoxMcpError('PLAYBACK_ERROR', `再生スクリプトが見つかりません: ${scriptPath}`);
  }

  try {
    const child = spawn(
      powershellPath(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-WavPath',
        wavPath,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    return await waitForExit(child, shouldStop);
  } catch (error) {
    throw new VoicevoxMcpError('PLAYBACK_ERROR', `WAVを再生できません: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
