import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('dist', { recursive: true });
await Promise.all(['popup.html', 'popup.js', 'popup.css'].map(name => rm(resolve('dist', name), { force: true })));
const common = {
  bundle: true, target: 'chrome131', minify: true,
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.module.css': 'local-css' },
  legalComments: 'linked',
};
await Promise.all([
  build({ ...common, entryPoints: ['src/extension/page.tsx'], outfile: 'dist/page.js', format: 'iife' }),
  build({ ...common, entryPoints: ['src/extension/broker.ts'], outfile: 'dist/broker.js', format: 'iife' }),
  build({ ...common, entryPoints: ['src/extension/background.ts'], outfile: 'dist/background.js', format: 'iife' }),
]);
for (const name of ['manifest.json', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
  await copyFile(resolve('public', name), resolve('dist', name));
}
console.log('Built unpacked Chromium extension in dist/');
