import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(repositoryRoot, 'mcpb', 'manifest.json'), 'utf8'));
const constants = await readFile(join(repositoryRoot, 'src', 'constants.ts'), 'utf8');
const sourceVersion = /PACKAGE_VERSION = '([^']+)'/u.exec(constants)?.[1];

const versions = {
  'mcpb/manifest.json': manifest.version,
  'package.json': packageJson.version,
  'src/constants.ts': sourceVersion,
};
const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1 || uniqueVersions.has(undefined)) {
  throw new Error(`バージョンが一致しません: ${JSON.stringify(versions)}`);
}
process.stdout.write(`Version consistency check passed: ${String(packageJson.version)}\n`);
