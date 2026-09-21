import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { build } from 'esbuild';

await build({
  entryPoints: ['tests/fixtures/react-page.tsx'],
  outfile: 'artifacts/react-page.js',
  bundle: true,
  define: { 'process.env.NODE_ENV': '"development"' },
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const route = pathname === '/react' ? '/react.html'
    : pathname === '/board' ? '/state-board.html'
    : pathname === '/react-page.js' ? '/react-page.js'
    : /^\/(fixture|other|csp)$/.test(pathname) ? '/page.html' : pathname;
  const directory = ['/react-page.js', '/state-board.html'].includes(route) ? 'artifacts'
    : route.startsWith('/dist/') ? '.' : 'tests/fixtures';
  const path = resolve(directory, `.${route}`);
  if (!path.startsWith(resolve(directory) + '/')) {
    res.writeHead(403).end(); return;
  }
  try {
    const data = await readFile(path);
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    if (pathname === '/csp') {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'");
    }
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') res.writeHead(404).end('Not found');
    else { console.error(error); res.writeHead(500).end('Preview failed'); }
  }
});
server.listen(5198, '127.0.0.1', () => console.log('Vellum test fixture: http://127.0.0.1:5198/fixture'));
