export type VoicevoxMcpErrorCode =
  | 'CONFIG_INVALID'
  | 'ENGINE_NOT_RUNNING'
  | 'ENGINE_NOT_FOUND'
  | 'ENGINE_ENDPOINT_INVALID'
  | 'ENGINE_START_FAILED'
  | 'ENGINE_API_ERROR'
  | 'VOICE_NOT_FOUND'
  | 'PLAYBACK_ERROR'
  | 'PLATFORM_UNSUPPORTED';

export class VoicevoxMcpError extends Error {
  readonly code: VoicevoxMcpErrorCode;
  readonly guidance: string | undefined;

  constructor(
    code: VoicevoxMcpErrorCode,
    message: string,
    options?: { cause?: unknown; guidance?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'VoicevoxMcpError';
    this.code = code;
    this.guidance = options?.guidance;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function formatToolError(error: unknown): string {
  if (error instanceof VoicevoxMcpError) {
    return [
      `エラーコード: ${error.code}`,
      error.message,
      error.guidance === undefined ? undefined : `設定方法: ${error.guidance}`,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }
  return `予期しないエラーが発生しました: ${errorMessage(error)}`;
}
