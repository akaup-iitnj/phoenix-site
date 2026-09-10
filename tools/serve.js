// Tiny static server for local previews and tests (mirrors GitHub Pages behaviour: /404.html for misses).
// Usage: node tools/serve.js [dir=dist/site] [port=4173]
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.resolve(process.argv[2] || 'dist/site');
const port = +(process.argv[3] || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p.includes('\0')) { res.writeHead(400); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(dir, p);
  if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403); return res.end(); }   // never leave the site directory
  let status = 200;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = file + '.html';
    if (fs.existsSync(alt)) file = alt; else { file = path.join(dir, '404.html'); status = 404; }
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    const type = types[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    // GitHub Pages gzips text assets; do the same so local measurements match production
    const compressible = /^(text\/|application\/(json|xml|javascript)|image\/svg)/.test(type);
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(status, headers);
      return res.end(zlib.gzipSync(data));
    }
    res.writeHead(status, headers);
    res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`serving ${dir} at http://127.0.0.1:${port}/`));
