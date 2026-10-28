// Local static preview with the same personalized-link rewrite and headers as Cloudflare Pages.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4321;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const baseHeaders = {};
for (const line of (await readFile(resolve(root, '_headers'), 'utf8')).split(/\r?\n/)) {
  if (line === '/*') continue;
  if (line && !line.startsWith(' ')) break;
  const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
  if (match) baseHeaders[match[1]] = match[2];
}
createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.startsWith('/i/')) pathname = '/i/index.html';
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { ...baseHeaders, 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404, baseHeaders); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
