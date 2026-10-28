import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const hashes = new Set();
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
        hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
      }
    }
  }
}
await inspect('dist');
const headers = await readFile('public/_headers', 'utf8');
await writeFile('dist/_headers', headers.replace("script-src 'self';", `script-src 'self' ${[...hashes].join(' ')};`));
console.log(`Security headers include ${hashes.size} hashes for Astro hydration scripts.`);
