import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.gradle', 'coverage', '.next']);
const textExt = new Set(['.ts','.tsx','.js','.mjs','.cjs','.json','.jsonc','.yaml','.yml','.toml','.md','.txt','.kt','.kts','.swift','.sql','.sh','.ps1','.conf','.properties','.html','.css','.py','.xml','.env']);
const checks = [
  ['Telegram bot token', /\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/g],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['common cloud/API secret assignment', /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?(?:sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,})/gi],
];
const findings = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const file = join(dir, entry.name);
    const ext = extname(entry.name).toLowerCase();
    if (!textExt.has(ext) && !entry.name.startsWith('.env')) continue;
    const text = await readFile(file, 'utf8').catch(() => '');
    for (const [label, pattern] of checks) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) findings.push(`${relative(root, file)}: ${label}`);
    }
  }
}
await walk(root);
if (findings.length) {
  console.error(`Secret scan failed (${findings.length} finding(s)):\n${findings.map(item => ` - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log('Secret scan passed: no Telegram bot tokens, private-key blocks, or recognized API-key assignments were found in text files.');
