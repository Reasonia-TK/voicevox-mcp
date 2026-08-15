import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(repositoryRoot, 'dist', 'index.js');
const child = spawn(process.execPath, [entryPath], {
  env: {
    ...process.env,
    VOICEVOX_MCP_DATA_DIR: join(repositoryRoot, 'build', 'stdio-smoke-runtime'),
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

const writeMessage = (message) => {
  child.stdin.write(`${JSON.stringify(message)}\n`);
};

const result = await new Promise((resolveResult, reject) => {
  let buffer = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error(`STDIO smoke test timed out. stderr=${stderr}`));
  }, 10_000);

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      const message = JSON.parse(line);
      if (message.id === 1) {
        if (typeof message.result?.instructions !== 'string') {
          clearTimeout(timer);
          reject(new Error('initialize応答にserver instructionsがありません。'));
          return;
        }
        writeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        writeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      }
      if (message.id === 2) {
        clearTimeout(timer);
        resolveResult(message.result);
        return;
      }
    }
  });
  child.once('error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.once('exit', (code) => {
    if (code !== null && code !== 0) {
      clearTimeout(timer);
      reject(new Error(`MCP server exited before tools/list (code=${String(code)}). stderr=${stderr}`));
    }
  });

  writeMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'voicevox-mcp-smoke', version: '0.1.0' },
      protocolVersion: '2025-06-18',
    },
  });
});

child.kill();
const names = result.tools?.map((tool) => tool.name).sort() ?? [];
const expected = ['list_voices', 'speak', 'stop_speaking', 'voicevox_status'];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`MCP tool list mismatch: ${JSON.stringify(names)}`);
}
process.stdout.write(`STDIO MCP smoke test passed: ${names.join(', ')}\n`);
