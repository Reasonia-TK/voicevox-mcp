import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppConfig } from '../src/config.js';

export function testConfig(dataDir = join(tmpdir(), 'voicevox-mcp-test')): AppConfig {
  return {
    autoStart: true,
    dataDir,
    defaultCharacter: 'ずんだもん',
    defaultSpeedScale: 1.1,
    defaultStyle: 'ノーマル',
    endpoint: new URL('http://127.0.0.1:50021'),
    maxTextLength: 1_000,
    requestTimeoutMs: 1_000,
    startTimeoutMs: 2_000,
  };
}
