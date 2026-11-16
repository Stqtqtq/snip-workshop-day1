import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const push = process.argv.includes('--push');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function git(args, cwd = root, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', ...options }).trim();
}

function hasStagedChanges(cwd) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd, stdio: 'ignore' });
  if (result.error) throw result.error;
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`git diff --cached --quiet failed with exit code ${result.status}`);
}

if (git(['branch', '--show-current']) !== 'main') {
  throw new Error('Run this script from the main branch checkout.');
}

run('git', ['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
run('npm', ['install'], path.join(root, 'frontend'));
run('npx', ['ng', 'build'], path.join(root, 'frontend'));

const frontendBuild = path.join(root, 'frontend', 'dist', 'snip-frontend', 'browser');
const indexFile = path.join(frontendBuild, 'index.html');
if (!existsSync(indexFile)) {
  throw new Error(`Angular build output is missing: ${indexFile}`);
}

const bundle = path.join(root, 'bundle');
const publicDir = path.join(bundle, 'public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(path.join(root, 'backend', 'server.js'), path.join(bundle, 'server.js'));
cpSync(path.join(root, 'cli', 'cli.js'), path.join(bundle, 'cli.js'));
cpSync(frontendBuild, publicDir, { recursive: true });
writeFileSync(path.join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(
  path.join(bundle, 'package.json'),
  `${JSON.stringify({ name: 'snip-bundle', private: true, scripts: { start: 'bun server.js' } }, null, 2)}\n`,
);
writeFileSync(
  path.join(bundle, 'Dockerfile'),
  'FROM oven/bun:1-alpine\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n',
);
writeFileSync(
  path.join(bundle, '.dockerignore'),
  '.git\nnode_modules\n',
);
writeFileSync(
  path.join(bundle, 'railway.json'),
  `${JSON.stringify({ '$schema': 'https://railway.com/railway.schema.json', build: { builder: 'DOCKERFILE' } }, null, 2)}\n`,
);

run('git', ['add', '-A'], bundle);
const bundleChanged = hasStagedChanges(bundle);
if (bundleChanged) {
  run('git', ['commit', '-m', 'Build generated Snip release bundle', '-m',
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>'], bundle);
}

run('git', ['add', 'backend', 'frontend', 'cli', 'bundle']);
const mainChanged = hasStagedChanges(root);
if (mainChanged) {
  run('git', ['commit', '-m', 'Update source and bundle submodule pointers', '-m',
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>']);
}

if (push) {
  run('git', ['fetch', 'origin', 'bundle'], bundle);
  run('git', ['fetch', 'origin', 'main']);
  if (Number(git(['rev-list', '--count', 'origin/bundle..HEAD'], bundle)) > 0) {
    run('git', ['push', 'origin', 'HEAD:bundle'], bundle);
  }
  if (Number(git(['rev-list', '--count', 'origin/main..HEAD'])) > 0) {
    run('git', ['push', 'origin', 'HEAD:main']);
  }
}

if (!bundleChanged && !mainChanged) {
  console.log('unchanged');
} else {
  console.log(`bundle ${bundleChanged ? 'updated' : 'unchanged'}; main ${mainChanged ? 'updated' : 'unchanged'}`);
}
