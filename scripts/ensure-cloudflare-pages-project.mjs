#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';

const [name, branch = 'main'] = process.argv.slice(2);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Usage: node scripts/ensure-cloudflare-pages-project.mjs <project-name> [production-branch]');
if (!accountId || !apiToken) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');

const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects`;
async function call(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Cloudflare API returned non-JSON for ${url} (HTTP ${response.status})`); }
  return { response, payload };
}

let { response, payload } = await call(`${base}/${encodeURIComponent(name)}`);
let project;
if (response.ok && payload.success && payload.result) {
  project = payload.result;
} else if (response.status === 404) {
  ({ response, payload } = await call(base, {
    method: 'POST',
    body: JSON.stringify({ name, production_branch: branch }),
  }));
  if (!response.ok || !payload.success || !payload.result) {
    throw new Error(`Could not create Pages project '${name}': ${JSON.stringify(payload.errors ?? payload)}`);
  }
  project = payload.result;
  console.log(`Created Direct Upload Pages project: ${name}`);
} else {
  throw new Error(`Could not inspect Pages project '${name}' (HTTP ${response.status}): ${JSON.stringify(payload.errors ?? payload)}`);
}

// Git-connected projects must be built by Cloudflare Workers Builds. Do not compete with that pipeline.
const mode = project.source?.type ? 'git' : 'direct';
console.log(`Pages project '${name}' mode: ${mode}${project.source?.type ? ` (${project.source.type})` : ''}`);
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) await appendFile(outputPath, `mode=${mode}\n`);
if (mode === 'git') console.log('Skipping Wrangler Direct Upload; configure native Cloudflare Git Builds for this project.');
