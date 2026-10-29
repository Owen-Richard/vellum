import { readdir, readFile, writeFile } from 'node:fs/promises';
const files = (await readdir('artifacts/states')).filter(name => name.endsWith('.html')).sort();
const cards = await Promise.all(files.map(async file => {
  const title = file.replace('.html', '').replaceAll('-', ' ');
  return `<section><h2>${title}</h2>${await readFile(`artifacts/states/${file}`, 'utf8')}</section>`;
}));
await writeFile('artifacts/state-board.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Vellum / Verified browser states</title><style>
body{margin:0;padding:48px;background:#e9edf3;color:#172033;font:16px/1.5 system-ui,sans-serif}
h1{font-size:36px;margin:0}p{margin:8px 0 32px}h2{font-size:18px;margin:0 0 12px;text-transform:capitalize}
.grid{display:grid;grid-template-columns:repeat(3,1440px);gap:48px}
section{width:1440px}section>div{isolation:isolate}
</style>
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
</head><body><h1>Vellum / Verified browser states</h1>
<p>${files.length} states captured from the running Vellum extension. Source: Mini Foundry Vellum. Example content only.</p>
<div class="grid">${cards.join('')}</div></body></html>`);
console.log(`Created editable state board with ${files.length} captured states.`);
