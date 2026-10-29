// Copy the shared core package into the edge functions folder. Supabase
// bundles each function from supabase/functions, so the core has to live
// there too. Run with --check in CI to fail when the copy is stale.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'packages/core/src');
const to = join(root, 'supabase/functions/_shared/core');
const check = process.argv.includes('--check');
const banner = '// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.\n';

const files = readdirSync(from).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
let stale = [];
if (!check) {
  if (existsSync(to)) rmSync(to, { recursive: true });
  mkdirSync(to, { recursive: true });
}
for (const file of files) {
  const content = banner + readFileSync(join(from, file), 'utf8');
  const target = join(to, file);
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(file);
  } else {
    writeFileSync(target, content);
  }
}
if (check) {
  const extra = existsSync(to) ? readdirSync(to).filter(f => !files.includes(f)) : [];
  if (stale.length || extra.length) {
    console.error(`Edge function core copy is stale: ${[...stale, ...extra].join(', ')}. Run: node scripts/sync-core.mjs`);
    process.exit(1);
  }
  console.log('Edge function core copy is up to date.');
} else {
  console.log(`Copied ${files.length} core files to supabase/functions/_shared/core.`);
}
