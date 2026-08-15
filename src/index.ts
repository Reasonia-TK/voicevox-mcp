#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './constants.js';
import { errorMessage } from './errors.js';
import { runPlaybackWorker } from './playback/worker.js';
import { createMcpServer } from './server.js';
import { VoicevoxService } from './service.js';

const entryPath = fileURLToPath(import.meta.url);

function printHelp(): void {
  process.stdout.write(`${PACKAGE_NAME} ${PACKAGE_VERSION}\n\n`);
  process.stdout.write('使い方:\n');
  process.stdout.write('  voicevox-mcp             STDIO MCPサーバーを起動\n');
  process.stdout.write('  voicevox-mcp doctor      接続・パス・キューを診断（自動起動なし）\n');
  process.stdout.write('  voicevox-mcp --version   バージョンを表示\n');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }

  const config = loadConfig();
  if (command === 'doctor') {
    const service = new VoicevoxService(config, entryPath);
    process.stdout.write(`${JSON.stringify(await service.status(), undefined, 2)}\n`);
    return;
  }
  if (command === 'player-worker') {
    await runPlaybackWorker(config.dataDir, entryPath);
    return;
  }
  if (command !== undefined && command !== 'serve') {
    throw new Error(`不明なコマンドです: ${command}`);
  }

  const handle = serveStdio(() => createMcpServer(config, entryPath));
  console.error(`${PACKAGE_NAME} ${PACKAGE_VERSION} is listening on stdio`);
  const close = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

void main().catch((error: unknown) => {
  console.error(`${PACKAGE_NAME}: ${errorMessage(error)}`);
  process.exitCode = 1;
});
