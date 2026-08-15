import { VoicevoxMcpError, errorMessage } from '../errors.js';
import type { AudioQuery, EngineProbe, VoicevoxSpeaker } from './types.js';

export type FetchImplementation = typeof fetch;

export class VoicevoxClient {
  readonly endpoint: URL;
  readonly requestTimeoutMs: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(endpoint: URL, requestTimeoutMs: number, fetchImplementation: FetchImplementation = fetch) {
    this.endpoint = new URL(endpoint.href);
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImplementation = fetchImplementation;
  }

  private url(pathname: string, parameters?: URLSearchParams): URL {
    const base = this.endpoint.href.endsWith('/') ? this.endpoint.href : `${this.endpoint.href}/`;
    const url = new URL(pathname.replace(/^\//u, ''), base);
    if (parameters !== undefined) {
      url.search = parameters.toString();
    }
    return url;
  }

  private async request(pathname: string, init: RequestInit = {}, parameters?: URLSearchParams): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.url(pathname, parameters), {
        ...init,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw new VoicevoxMcpError('ENGINE_API_ERROR', `VOICEVOX Engineへ接続できません: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new VoicevoxMcpError(
        'ENGINE_API_ERROR',
        `VOICEVOX Engine APIがHTTP ${String(response.status)}を返しました${body === '' ? '。' : `: ${body}`}`,
      );
    }
    return response;
  }

  async probe(timeoutMs = 1_500): Promise<EngineProbe> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.url('/version'), {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { error: errorMessage(error), reachable: false, ready: false };
    }

    if (!response.ok) {
      return {
        error: `HTTP ${String(response.status)}`,
        reachable: true,
        ready: false,
      };
    }

    try {
      const value: unknown = await response.json();
      if (typeof value !== 'string' || value.trim() === '') {
        return { error: '/versionの応答がVOICEVOX形式ではありません。', reachable: true, ready: false };
      }
      return { reachable: true, ready: true, version: value };
    } catch (error) {
      return { error: errorMessage(error), reachable: true, ready: false };
    }
  }

  async getVersion(): Promise<string> {
    const value: unknown = await (await this.request('/version')).json();
    if (typeof value !== 'string') {
      throw new VoicevoxMcpError('ENGINE_API_ERROR', 'VOICEVOX Engineのバージョン応答が不正です。');
    }
    return value;
  }

  async listSpeakers(): Promise<VoicevoxSpeaker[]> {
    const value: unknown = await (await this.request('/speakers')).json();
    if (!Array.isArray(value)) {
      throw new VoicevoxMcpError('ENGINE_API_ERROR', 'VOICEVOX Engineの話者一覧応答が不正です。');
    }
    return value as VoicevoxSpeaker[];
  }

  async createAudioQuery(text: string, speakerId: number): Promise<AudioQuery> {
    const parameters = new URLSearchParams({ speaker: String(speakerId), text });
    const value: unknown = await (
      await this.request('/audio_query', { method: 'POST' }, parameters)
    ).json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new VoicevoxMcpError('ENGINE_API_ERROR', 'audio_queryの応答が不正です。');
    }
    return value as AudioQuery;
  }

  async synthesize(query: AudioQuery, speakerId: number): Promise<Uint8Array> {
    const parameters = new URLSearchParams({ speaker: String(speakerId) });
    const response = await this.request(
      '/synthesis',
      {
        body: JSON.stringify(query),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      parameters,
    );
    return new Uint8Array(await response.arrayBuffer());
  }
}
