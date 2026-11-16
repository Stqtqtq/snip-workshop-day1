'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const cliPath = path.join(__dirname, '..', 'cli.js');
let server;
let api;
let links = [];

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/links') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { url } = JSON.parse(body);
      if (url.includes('reject')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL rejected by test API' }));
        return;
      }

      const link = {
        code: 'abc123',
        url,
        shortUrl: `${api}/abc123`,
        hits: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      links = [link];
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(link));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/links') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(links));
      return;
    }

    if (req.method === 'GET' && req.url === '/abc123') {
      res.writeHead(302, { location: 'https://example.com/destination' });
      res.end();
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown code' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  api = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: api, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('help prints usage without contacting the API', async () => {
  const result = await run(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /snip add <url>/);
  assert.equal(result.stderr, '');
});

test('add validates URLs, posts JSON, and prints the short URL', async () => {
  const invalid = await run(['add', 'file:///etc/passwd']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /valid HTTP\(S\) URL/);

  const added = await run(['add', 'https://example.com/path']);
  assert.equal(added.status, 0);
  assert.equal(added.stdout.trim(), `${api}/abc123`);
  assert.equal(added.stderr, '');

  const rejected = await run(['add', 'https://reject.example']);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /URL rejected by test API/);
});

test('ls reports empty results and formats link rows', async () => {
  links = [];
  const empty = await run(['ls']);
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout.trim(), 'No links yet.');

  links = [{ code: 'abc123', hits: 4, url: 'https://example.com/path' }];
  const listed = await run(['ls']);
  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /CODE\s+HITS\s+URL/);
  assert.match(listed.stdout, /abc123\s+4\s+https:\/\/example\.com\/path/);
});

test('open does not follow the redirect and launches its Location URL', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Uses the Linux xdg-open launcher stub.');
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-cli-test-'));
  const capturePath = path.join(tempDir, 'opened-url');
  const launcherPath = path.join(tempDir, 'xdg-open');
  await fs.writeFile(
    launcherPath,
    '#!/bin/sh\nprintf "%s" "$1" > "$SNIP_TEST_BROWSER_OUTPUT"\n',
    { mode: 0o755 },
  );

  const result = await run(['open', 'abc123'], {
    PATH: `${tempDir}${path.delimiter}${process.env.PATH}`,
    SNIP_TEST_BROWSER_OUTPUT: capturePath,
  });
  assert.equal(result.status, 0, result.stderr);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assert.equal(await fs.readFile(capturePath, 'utf8'), 'https://example.com/destination');
      await fs.rm(tempDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true });
  assert.fail('Browser launcher did not receive the redirect target.');
});

test('unknown commands and unreachable APIs fail with exit code 1', async () => {
  const unknown = await run(['wat']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown command/);

  const unavailable = await run(['ls'], { SNIP_API: 'http://127.0.0.1:1' });
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /Could not reach the Snip API/);
});
