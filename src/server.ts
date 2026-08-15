import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { AppConfig } from './config.js';
import { PACKAGE_NAME, PACKAGE_VERSION, SERVER_INSTRUCTIONS } from './constants.js';
import { formatToolError } from './errors.js';
import { VoicevoxService } from './service.js';

function asText(value: unknown): string {
  return JSON.stringify(value, undefined, 2);
}

function success(value: unknown) {
  return { content: [{ type: 'text' as const, text: asText(value) }] };
}

function failure(error: unknown) {
  return { content: [{ type: 'text' as const, text: formatToolError(error) }], isError: true };
}

export function createMcpServer(config: AppConfig, entryPath: string): McpServer {
  const service = new VoicevoxService(config, entryPath);
  const server = new McpServer(
    { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    'speak',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        '短い日本語をVOICEVOXで非同期再生する。通常の途中経過には使わず、最終回答・完了・エラー・確認待ちの直前に、画面と同じ結論を2〜4文・180文字以内で渡す。',
      inputSchema: z.object({
        text: z
          .string()
          .min(1)
          .max(config.maxTextLength)
          .describe('読み上げる本文。コード、URL、秘密情報、長いパスを含めない。推奨180文字以内。'),
        character: z.string().min(1).optional().describe('キャラクター名。既定はずんだもん。'),
        style: z.string().min(1).optional().describe('スタイル名。既定はノーマル。'),
        speakerId: z.number().int().nonnegative().optional().describe('VOICEVOXのスタイルID。指定時は名前より優先。'),
        speedScale: z.number().min(0.5).max(2).optional().describe('話速。既定は1.1。'),
      }),
      title: 'VOICEVOXで読み上げる',
    },
    async (input) => {
      try {
        return success(await service.speak(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'voicevox_status',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: 'VOICEVOX Engine、実行ファイル候補、再生キューの状態を確認する。Engineは自動起動しない。',
      inputSchema: z.object({}),
      title: 'VOICEVOXの状態を確認する',
    },
    async () => {
      try {
        return success(await service.status());
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'list_voices',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: '起動済みVOICEVOX EngineからキャラクターとスタイルIDを取得する。Engineは自動起動しない。',
      inputSchema: z.object({
        character: z.string().min(1).optional().describe('完全一致で絞り込むキャラクター名。'),
      }),
      title: 'VOICEVOXの音声一覧を取得する',
    },
    async ({ character }) => {
      try {
        const speakers = await service.listVoices(character);
        return success(
          speakers.map((speaker) => ({
            character: speaker.name,
            speakerUuid: speaker.speaker_uuid,
            styles: speaker.styles.map((style) => ({ id: style.id, name: style.name, type: style.type })),
          })),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'stop_speaking',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: '現在の音声再生を停止し、待機中の読み上げをすべて取り消す。',
      inputSchema: z.object({}),
      title: 'VOICEVOXの読み上げを停止する',
    },
    async () => {
      try {
        return success(await service.stop());
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
