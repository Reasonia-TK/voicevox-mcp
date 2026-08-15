import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  DEFAULT_CHARACTER,
  DEFAULT_HOST,
  DEFAULT_MAX_TEXT_LENGTH,
  DEFAULT_PORT,
  DEFAULT_SPEED_SCALE,
  DEFAULT_STYLE,
} from './constants.js';
import { VoicevoxMcpError } from './errors.js';

export interface AppConfig {
  autoStart: boolean;
  dataDir: string;
  defaultCharacter: string;
  defaultSpeakerId?: number;
  defaultSpeedScale: number;
  defaultStyle: string;
  endpoint: URL;
  enginePath?: string;
  maxTextLength: number;
  requestTimeoutMs: number;
  startTimeoutMs: number;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  if (/^(1|true|yes|on)$/iu.test(value)) {
    return true;
  }
  if (/^(0|false|no|off)$/iu.test(value)) {
    return false;
  }
  throw new VoicevoxMcpError('CONFIG_INVALID', `真偽値として解釈できません: ${value}`);
}

function readNumber(
  value: string | undefined,
  fallback: number,
  name: string,
  limits: { integer?: boolean; max: number; min: number },
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  const validInteger = limits.integer !== true || Number.isInteger(parsed);
  if (!Number.isFinite(parsed) || !validInteger || parsed < limits.min || parsed > limits.max) {
    throw new VoicevoxMcpError(
      'CONFIG_INVALID',
      `${name} は ${limits.min}〜${limits.max}${limits.integer === true ? 'の整数' : ''}で指定してください。`,
    );
  }
  return parsed;
}

function optionalInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return readNumber(value, 0, name, { integer: true, min: 0, max: 99_999 });
}

function defaultDataDir(env: NodeJS.ProcessEnv): string {
  const base = env.LOCALAPPDATA?.trim();
  if (base !== undefined && base !== '') {
    return join(base, 'voicevox-mcp');
  }
  const home = homedir();
  return home === '' ? join(tmpdir(), 'voicevox-mcp') : join(home, '.voicevox-mcp');
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const configuredEndpoint = env.VOICEVOX_ENGINE_URL?.trim();
  let endpointText: string;
  if (configuredEndpoint !== undefined && configuredEndpoint !== '') {
    endpointText = configuredEndpoint;
  } else {
    const host = env.VOICEVOX_HOST?.trim() || DEFAULT_HOST;
    const port = readNumber(env.VOICEVOX_PORT, DEFAULT_PORT, 'VOICEVOX_PORT', {
      integer: true,
      min: 1,
      max: 65_535,
    });
    endpointText = `http://${host}:${String(port)}`;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointText);
  } catch (error) {
    throw new VoicevoxMcpError('CONFIG_INVALID', 'VOICEVOX_ENGINE_URL が有効なURLではありません。', {
      cause: error,
    });
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new VoicevoxMcpError('CONFIG_INVALID', 'VOICEVOX_ENGINE_URL は http または https で指定してください。');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/u, '');

  const configuredDataDir = env.VOICEVOX_MCP_DATA_DIR?.trim();
  const configuredEnginePath = env.VOICEVOX_ENGINE_PATH?.trim();
  const defaultSpeakerId = optionalInteger(env.VOICEVOX_SPEAKER_ID, 'VOICEVOX_SPEAKER_ID');

  return {
    autoStart: readBoolean(env.VOICEVOX_AUTO_START, true),
    dataDir: resolve(configuredDataDir === undefined || configuredDataDir === '' ? defaultDataDir(env) : configuredDataDir),
    defaultCharacter: env.VOICEVOX_CHARACTER?.trim() || DEFAULT_CHARACTER,
    ...(defaultSpeakerId === undefined ? {} : { defaultSpeakerId }),
    defaultSpeedScale: readNumber(
      env.VOICEVOX_SPEED_SCALE,
      DEFAULT_SPEED_SCALE,
      'VOICEVOX_SPEED_SCALE',
      { min: 0.5, max: 2 },
    ),
    defaultStyle: env.VOICEVOX_STYLE?.trim() || DEFAULT_STYLE,
    endpoint,
    ...(configuredEnginePath === undefined || configuredEnginePath === ''
      ? {}
      : { enginePath: resolve(configuredEnginePath) }),
    maxTextLength: readNumber(
      env.VOICEVOX_MAX_TEXT_LENGTH,
      DEFAULT_MAX_TEXT_LENGTH,
      'VOICEVOX_MAX_TEXT_LENGTH',
      { integer: true, min: 1, max: 10_000 },
    ),
    requestTimeoutMs: readNumber(
      env.VOICEVOX_REQUEST_TIMEOUT_MS,
      15_000,
      'VOICEVOX_REQUEST_TIMEOUT_MS',
      { integer: true, min: 500, max: 120_000 },
    ),
    startTimeoutMs: readNumber(
      env.VOICEVOX_START_TIMEOUT_MS,
      45_000,
      'VOICEVOX_START_TIMEOUT_MS',
      { integer: true, min: 1_000, max: 180_000 },
    ),
  };
}
