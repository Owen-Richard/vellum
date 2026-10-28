import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('artifacts', { recursive: true });
execFileSync('zip', ['-q', '-r', '-FS', '../artifacts/vellum.zip', '.'], { cwd: 'dist' });
console.log('Created artifacts/vellum.zip');
