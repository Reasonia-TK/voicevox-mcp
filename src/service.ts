import type { AppConfig } from './config.js';
import { VoicevoxMcpError } from './errors.js';
import { PlaybackQueue, type QueueStatus, type StopResult } from './playback/queue.js';
import { VoicevoxClient } from './voicevox/client.js';
import { EngineManager } from './voicevox/engine-manager.js';
import { resolveVoice } from './voicevox/speaker-resolver.js';
import type { EngineProbe, VoiceSelection, VoicevoxSpeaker } from './voicevox/types.js';

export interface SpeakRequest {
  character?: string | undefined;
  speakerId?: number | undefined;
  speedScale?: number | undefined;
  style?: string | undefined;
  text: string;
}

export interface SpeakResult {
  engineStarted: boolean;
  jobId: string;
  queued: true;
  speedScale: number;
  voice: VoiceSelection;
}

export interface ServiceStatus {
  defaults: {
    character: string;
    speakerId?: number;
    speedScale: number;
    style: string;
  };
  endpoint: string;
  enginePath?: string;
  enginePathCandidates: string[];
  probe: EngineProbe;
  queue: QueueStatus;
}

export class VoicevoxService {
  readonly client: VoicevoxClient;
  readonly config: AppConfig;
  readonly engineManager: EngineManager;
  readonly queue: PlaybackQueue;

  constructor(
    config: AppConfig,
    entryPath: string,
    dependencies?: {
      client?: VoicevoxClient;
      engineManager?: EngineManager;
      queue?: PlaybackQueue;
    },
  ) {
    this.config = config;
    this.client = dependencies?.client ?? new VoicevoxClient(config.endpoint, config.requestTimeoutMs);
    this.engineManager = dependencies?.engineManager ?? new EngineManager(config, this.client);
    this.queue = dependencies?.queue ?? new PlaybackQueue(config.dataDir, entryPath);
  }

  async status(): Promise<ServiceStatus> {
    const [probe, queue] = await Promise.all([this.engineManager.probe(), this.queue.status()]);
    const enginePath = this.engineManager.resolveEnginePath();
    return {
      defaults: {
        character: this.config.defaultCharacter,
        ...(this.config.defaultSpeakerId === undefined ? {} : { speakerId: this.config.defaultSpeakerId }),
        speedScale: this.config.defaultSpeedScale,
        style: this.config.defaultStyle,
      },
      endpoint: this.config.endpoint.origin,
      ...(enginePath === undefined ? {} : { enginePath }),
      enginePathCandidates: this.engineManager.enginePathCandidates(),
      probe,
      queue,
    };
  }

  private async requireRunningEngine(): Promise<void> {
    const probe = await this.engineManager.probe();
    if (probe.ready) {
      return;
    }
    if (probe.reachable) {
      throw new VoicevoxMcpError(
        'ENGINE_ENDPOINT_INVALID',
        `${this.config.endpoint.origin} はVOICEVOX Engineとして応答していません。`,
        { guidance: 'VOICEVOX_ENGINE_URLまたはVOICEVOX_PORTを確認してください。' },
      );
    }
    throw new VoicevoxMcpError('ENGINE_NOT_RUNNING', 'VOICEVOX Engineが起動していません。', {
      guidance: '読み上げ時は自動起動します。手動確認ではVOICEVOXを起動してから、もう一度list_voicesを呼んでください。',
    });
  }

  async listVoices(character?: string): Promise<VoicevoxSpeaker[]> {
    await this.requireRunningEngine();
    const speakers = await this.client.listSpeakers();
    if (character === undefined || character.trim() === '') {
      return speakers;
    }
    const normalized = character.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
    return speakers.filter(
      (speaker) => speaker.name.normalize('NFKC').trim().toLocaleLowerCase('ja-JP') === normalized,
    );
  }

  async speak(request: SpeakRequest): Promise<SpeakResult> {
    const text = request.text.trim();
    if (text === '') {
      throw new VoicevoxMcpError('CONFIG_INVALID', '読み上げるtextが空です。');
    }
    if (text.length > this.config.maxTextLength) {
      throw new VoicevoxMcpError(
        'CONFIG_INVALID',
        `textは${String(this.config.maxTextLength)}文字以内にしてください。`,
      );
    }
    const speedScale = request.speedScale ?? this.config.defaultSpeedScale;
    if (!Number.isFinite(speedScale) || speedScale < 0.5 || speedScale > 2) {
      throw new VoicevoxMcpError('CONFIG_INVALID', 'speedScaleは0.5〜2で指定してください。');
    }

    const engine = await this.engineManager.ensureReady();
    const speakers = await this.client.listSpeakers();
    const speakerId = request.speakerId ?? this.config.defaultSpeakerId;
    const voice = resolveVoice(speakers, {
      character: request.character ?? this.config.defaultCharacter,
      ...(speakerId === undefined ? {} : { speakerId }),
      style: request.style ?? this.config.defaultStyle,
    });
    const query = await this.client.createAudioQuery(text, voice.speakerId);
    query.speedScale = speedScale;
    const wav = await this.client.synthesize(query, voice.speakerId);
    if (wav.byteLength < 12 || new TextDecoder('ascii').decode(wav.slice(0, 4)) !== 'RIFF') {
      throw new VoicevoxMcpError('ENGINE_API_ERROR', 'VOICEVOX Engineから有効なWAVが返りませんでした。');
    }
    const job = await this.queue.enqueue(wav, voice);
    return {
      engineStarted: engine.startedByMcp,
      jobId: job.id,
      queued: true,
      speedScale,
      voice,
    };
  }

  async stop(): Promise<StopResult> {
    return this.queue.requestStop();
  }
}
