#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10_000;

function usage() {
  return [
    'Usage:',
    '  snip add <url>    Create a short link',
    '  snip ls           List links and hit counts',
    '  snip open <code>  Open a short link in your browser',
    '  snip help         Show this help',
    '',
    'Set SNIP_API to use a backend other than http://localhost:3000.',
  ].join('\n');
}

function apiBase() {
  const value = process.env.SNIP_API || DEFAULT_API;
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }

  return value.replace(/\/+$/, '');
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`Could not reach the Snip API: ${error.message}`);
  }

  if (!response.ok && response.status !== 302) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && typeof body.error === 'string' ? body.error : '';
    } catch {
      // The API may return a non-JSON error body.
    }
    throw new Error(detail || `Snip API returned HTTP ${response.status}.`);
  }

  return response;
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Please provide a valid HTTP(S) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Please provide a valid HTTP(S) URL.');
  }

  return parsed.href;
}

async function addLink(value) {
  if (!value) {
    throw new Error('Usage: snip add <url>');
  }

  const url = validateUrl(value);
  const response = await request('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (response.status !== 201) {
    throw new Error(`Snip API returned unexpected HTTP ${response.status}.`);
  }

  const link = await response.json();
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('Snip API returned an invalid link response.');
  }
  console.log(link.shortUrl);
}

async function listLinks() {
  const response = await request('/api/links');
  const links = await response.json();
  if (!Array.isArray(links)) {
    throw new Error('Snip API returned an invalid links response.');
  }
  if (links.length === 0) {
    console.log('No links yet.');
    return;
  }

  const codeWidth = Math.max(4, ...links.map((link) => String(link.code ?? '').length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits ?? '').length));
  console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
  for (const link of links) {
    console.log(
      `${String(link.code ?? '').padEnd(codeWidth)}  ${String(link.hits ?? '').padStart(hitsWidth)}  ${String(link.url ?? '')}`,
    );
  }
}

function openInBrowser(url) {
  const browser = process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/c', 'start', '""', url] }
    : process.platform === 'darwin'
      ? { command: 'open', args: [url] }
      : { command: 'xdg-open', args: [url] };

  return new Promise((resolve, reject) => {
    const child = spawn(browser.command, browser.args, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', (error) => reject(new Error(`Could not open browser: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function openLink(code) {
  if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
    throw new Error('Usage: snip open <code>');
  }

  const response = await request(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status !== 302) {
    throw new Error(`Snip API returned unexpected HTTP ${response.status} for code "${code}".`);
  }

  const target = response.headers.get('location');
  if (!target) {
    throw new Error('Snip API redirect did not include a Location header.');
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('Snip API returned an invalid redirect URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Snip API returned an invalid redirect URL.');
  }

  await openInBrowser(parsed.href);
}

async function main(args) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  if (command === 'add') {
    await addLink(rest[0]);
  } else if (command === 'ls') {
    if (rest.length) throw new Error('Usage: snip ls');
    await listLinks();
  } else if (command === 'open') {
    await openLink(rest[0]);
  } else {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
