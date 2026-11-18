import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outdir = 'artifacts/playground';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ['src/playground/main.tsx'],
  outdir,
  bundle: true,
  format: 'esm',
  target: 'chrome131',
  minify: true,
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.module.css': 'local-css' },
  legalComments: 'linked',
});
for (const name of ['index.html', 'playground.css']) {
  await copyFile(resolve('src/playground', name), resolve(outdir, name));
}
console.log(`Built Vellum web playground in ${outdir}/`);
