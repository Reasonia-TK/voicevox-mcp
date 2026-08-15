export interface VoicevoxStyle {
  id: number;
  name: string;
  type?: string;
}

export interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
  version?: string;
}

export interface VoiceSelection {
  character: string;
  speakerId: number;
  style: string;
}

export interface EngineProbe {
  error?: string;
  reachable: boolean;
  ready: boolean;
  version?: string;
}

export interface AudioQuery {
  speedScale: number;
  [key: string]: unknown;
}
