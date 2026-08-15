import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { loadConfig } from '../dist/config.js';
import { VoicevoxService } from '../dist/service.js';
import { resolveVoice } from '../dist/voicevox/speaker-resolver.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(repositoryRoot, 'dist', 'index.js');
const config = loadConfig({
  ...process.env,
  VOICEVOX_MCP_DATA_DIR: join(repositoryRoot, 'build', 'live-smoke-runtime'),
});
const service = new VoicevoxService(config, entryPath);
const status = await service.status();
if (!status.probe.ready) {
  throw new Error('VOICEVOX Engineが起動していません。音を鳴らさない実機テストを中止します。');
}

const speakers = await service.listVoices();
const voice = resolveVoice(speakers, { character: 'ずんだもん', style: 'ノーマル' });
const query = await service.client.createAudioQuery('接続テストなのだ', voice.speakerId);
query.speedScale = 1.1;
const wav = await service.client.synthesize(query, voice.speakerId);
const riff = new TextDecoder('ascii').decode(wav.slice(0, 4));
if (riff !== 'RIFF') {
  throw new Error('合成結果がWAV形式ではありません。');
}

process.stdout.write(
  `${JSON.stringify(
    {
      engineVersion: status.probe.version,
      speakerId: voice.speakerId,
      voice: `${voice.character}（${voice.style}）`,
      wavBytes: wav.byteLength,
    },
    undefined,
    2,
  )}\n`,
);
