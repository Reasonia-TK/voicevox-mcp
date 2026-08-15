import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

import type { AppConfig } from '../config.js';
import { isLoopbackHostname } from '../config.js';
import { VoicevoxMcpError, errorMessage } from '../errors.js';
import { acquireDirectoryLock } from '../runtime/file-lock.js';
import type { VoicevoxClient } from './client.js';
import type { EngineProbe } from './types.js';

export interface ReadyEngine {
  startedByMcp: boolean;
  version: string;
}

export interface EngineManagerDependencies {
  exists: (path: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  spawnEngine: (path: string, args: string[], logPath: string) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spawnEngine(path: string, args: string[], logPath: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  const logDescriptor = openSync(logPath, 'a');
  try {
    const child = spawn(path, args, {
      cwd: dirname(path),
      detached: true,
      stdio: ['ignore', logDescriptor, logDescriptor],
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', resolve);
    });
    child.unref();
  } finally {
    closeSync(logDescriptor);
  }
}

const DEFAULT_DEPENDENCIES: EngineManagerDependencies = {
  exists: existsSync,
  sleep,
  spawnEngine,
};

export class EngineManager {
  private readonly client: Pick<VoicevoxClient, 'probe'>;
  private readonly config: AppConfig;
  private readonly dependencies: EngineManagerDependencies;

  constructor(
    config: AppConfig,
    client: Pick<VoicevoxClient, 'probe'>,
    dependencies: EngineManagerDependencies = DEFAULT_DEPENDENCIES,
  ) {
    this.config = config;
    this.client = client;
    this.dependencies = dependencies;
  }

  async probe(): Promise<EngineProbe> {
    return this.client.probe();
  }

  enginePathCandidates(): string[] {
    if (this.config.enginePath !== undefined) {
      return [this.config.enginePath];
    }
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData === undefined || localAppData.trim() === '') {
      return [];
    }
    return [
      join(localAppData, 'Programs', 'VOICEVOX', 'vv-engine', 'run.exe'),
      join(localAppData, 'Programs', 'VOICEVOX', 'run.exe'),
    ];
  }

  resolveEnginePath(): string | undefined {
    return this.enginePathCandidates().find((candidate) => this.dependencies.exists(candidate));
  }

  private endpointProblem(probe: EngineProbe): VoicevoxMcpError {
    if (probe.reachable) {
      return new VoicevoxMcpError(
        'ENGINE_ENDPOINT_INVALID',
        `${this.config.endpoint.origin} には接続できましたが、VOICEVOX Engineではありません。別のアプリがポートを使用している可能性があります。`,
        { guidance: 'VOICEVOX_PORTまたはVOICEVOX_ENGINE_URLを、VOICEVOX Engineの待受先に合わせてください。' },
      );
    }
    return new VoicevoxMcpError('ENGINE_NOT_RUNNING', 'VOICEVOX Engineが起動していません。', {
      guidance: 'VOICEVOXをインストールするか、VOICEVOX_ENGINE_PATHにvv-engine\\run.exeの絶対パスを設定してください。',
    });
  }

  async ensureReady(): Promise<ReadyEngine> {
    const initial = await this.client.probe();
    if (initial.ready && initial.version !== undefined) {
      return { startedByMcp: false, version: initial.version };
    }
    if (initial.reachable) {
      throw this.endpointProblem(initial);
    }
    if (!this.config.autoStart) {
      throw this.endpointProblem(initial);
    }
    if (
      process.platform !== 'win32' ||
      this.config.endpoint.protocol !== 'http:' ||
      !isLoopbackHostname(this.config.endpoint.hostname)
    ) {
      throw new VoicevoxMcpError(
        'PLATFORM_UNSUPPORTED',
        'VOICEVOX Engineの自動起動はWindows上のローカルHTTP接続でのみ利用できます。',
        { guidance: 'VOICEVOX Engineを別途起動するか、VOICEVOX_AUTO_START=falseにしてください。' },
      );
    }

    const lock = await acquireDirectoryLock(join(this.config.dataDir, 'locks', 'engine-start.lock'), {
      staleAfterMs: this.config.startTimeoutMs * 2,
      timeoutMs: this.config.startTimeoutMs,
    });
    try {
      const afterLock = await this.client.probe();
      if (afterLock.ready && afterLock.version !== undefined) {
        return { startedByMcp: false, version: afterLock.version };
      }
      if (afterLock.reachable) {
        throw this.endpointProblem(afterLock);
      }

      const enginePath = this.resolveEnginePath();
      if (enginePath === undefined) {
        throw new VoicevoxMcpError('ENGINE_NOT_FOUND', 'VOICEVOX Engineの実行ファイルが見つかりません。', {
          guidance:
            'VOICEVOXを公式サイトからインストールし、必要ならVOICEVOX_ENGINE_PATHに「...\\VOICEVOX\\vv-engine\\run.exe」を設定してください。自動ダウンロードは行いません。',
        });
      }

      const port = this.config.endpoint.port || '80';
      const launchHost = this.config.endpoint.hostname.replace(/^\[|\]$/gu, '');
      const args = [
        '--host',
        launchHost,
        '--port',
        port,
        '--output_log_utf8',
      ];
      const logPath = join(this.config.dataDir, 'logs', 'voicevox-engine.log');
      try {
        await this.dependencies.spawnEngine(enginePath, args, logPath);
      } catch (error) {
        throw new VoicevoxMcpError('ENGINE_START_FAILED', `VOICEVOX Engineを起動できません: ${errorMessage(error)}`, {
          cause: error,
          guidance: `実行権限とVOICEVOX_ENGINE_PATHを確認してください。ログ: ${logPath}`,
        });
      }

      const deadline = Date.now() + this.config.startTimeoutMs;
      let lastProbe: EngineProbe = afterLock;
      while (Date.now() < deadline) {
        await this.dependencies.sleep(250);
        lastProbe = await this.client.probe();
        if (lastProbe.ready && lastProbe.version !== undefined) {
          return { startedByMcp: true, version: lastProbe.version };
        }
        if (lastProbe.reachable) {
          throw this.endpointProblem(lastProbe);
        }
      }
      throw new VoicevoxMcpError(
        'ENGINE_START_FAILED',
        `VOICEVOX Engineが${String(this.config.startTimeoutMs)}ms以内に応答しませんでした。${lastProbe.error === undefined ? '' : ` 最終エラー: ${lastProbe.error}`}`,
        { guidance: `VOICEVOX Engineのログを確認してください: ${logPath}` },
      );
    } finally {
      await lock.release().catch((error: unknown) => {
        console.error(`VOICEVOX起動ロックの解放に失敗しました: ${errorMessage(error)}`);
      });
    }
  }
}
