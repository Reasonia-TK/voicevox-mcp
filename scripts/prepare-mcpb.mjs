import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageDirectory = join(repositoryRoot, 'build', 'mcpb');

await rm(stageDirectory, { force: true, recursive: true });
await mkdir(stageDirectory, { recursive: true });

await Promise.all([
  cp(join(repositoryRoot, 'dist'), join(stageDirectory, 'dist'), { recursive: true }),
  cp(join(repositoryRoot, 'scripts', 'play-wav.ps1'), join(stageDirectory, 'scripts', 'play-wav.ps1'), {
    recursive: true,
  }),
  cp(join(repositoryRoot, 'templates'), join(stageDirectory, 'templates'), { recursive: true }),
  cp(join(repositoryRoot, 'examples'), join(stageDirectory, 'examples'), { recursive: true }),
  cp(join(repositoryRoot, 'docs'), join(stageDirectory, 'docs'), { recursive: true }),
  cp(join(repositoryRoot, 'README.md'), join(stageDirectory, 'README.md')),
  cp(join(repositoryRoot, 'LICENSE'), join(stageDirectory, 'LICENSE')),
  cp(join(repositoryRoot, 'mcpb', 'manifest.json'), join(stageDirectory, 'manifest.json')),
  cp(join(repositoryRoot, 'package-lock.json'), join(stageDirectory, 'package-lock.json')),
]);

const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const bundlePackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  private: true,
  type: 'module',
  engines: packageJson.engines,
  dependencies: packageJson.dependencies,
};
await writeFile(join(stageDirectory, 'package.json'), `${JSON.stringify(bundlePackageJson, undefined, 2)}\n`, 'utf8');

const npmExecutable = process.env.npm_execpath;
if (npmExecutable === undefined || npmExecutable === '') {
  throw new Error('npm_execpathが見つかりません。npm.cmd run mcpb:stageから実行してください。');
}
const install = spawnSync(
  process.execPath,
  [npmExecutable, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: stageDirectory, encoding: 'utf8', stdio: 'inherit' },
);
if (install.status !== 0) {
  throw new Error(`MCPB用の本番依存関係を準備できませんでした (exit=${String(install.status)})`);
}

process.stdout.write(`MCPB staging directory: ${stageDirectory}\n`);
