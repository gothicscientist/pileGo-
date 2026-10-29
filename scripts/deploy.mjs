#!/usr/bin/env node
// Deploys pileGo's backend to a Supabase project over HTTPS, with no Docker
// and no database port: migrations, Vault secrets for the schedules, function
// secrets, auth redirect URLs and the edge functions.
//
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/deploy.mjs
//
// Optional environment:
//   GEMINI_API_KEY        AI scanning (free tier is enough to start)
//   PILEGO_APP_URL        where the web app lives, e.g. https://pilego.pages.dev
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME, EBAY_ENV (production|sandbox),
//   EBAY_VERIFICATION_TOKEN (for eBay's account-deletion notices)
//
// Flags:
//   --only=migrations,vault,secrets,auth,functions   run some steps
//   --dry-run                                        print what would happen
//
// At the end it prints the two values the web app is built with. Both are
// public (the anon key is meant for browsers); nothing secret is printed.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const want = step => !only || only.includes(step);

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN (supabase.com > Account > Access tokens) and SUPABASE_PROJECT_REF (the id in your project URL).');
  process.exit(1);
}

const API = 'https://api.supabase.com/v1';
const projectUrl = `https://${ref}.supabase.co`;
const appUrl = (process.env.PILEGO_APP_URL ?? '').replace(/\/+$/, '');

async function api(method, path, body) {
  if (dryRun && method !== 'GET') {
    console.log(`  (dry run) ${method} ${path}`);
    return null;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const sql = query => api('POST', `/projects/${ref}/database/query`, { query });
const literal = value => `'${String(value).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------

async function migrations() {
  console.log('Migrations');
  await sql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
  `);
  const applied = new Set(
    ((await sql('select version from supabase_migrations.schema_migrations')) ?? []).map(r => r.version),
  );
  const dir = join(root, 'supabase', 'migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
    if (applied.has(version)) {
      console.log(`  ${file} already applied`);
      continue;
    }
    const body = readFileSync(join(dir, file), 'utf8');
    // One request is one transaction, so a failing migration leaves nothing half done.
    await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name) values (${literal(version)}, ${literal(rest.join('_'))});\ncommit;`);
    console.log(`  applied ${file}`);
  }
}

async function apiKeys() {
  const keys = (await api('GET', `/projects/${ref}/api-keys?reveal=true`)) ?? [];
  const pick = name => keys.find(k => k.name === name)?.api_key;
  // Projects with the newer API keys hand edge functions the sb_secret_ key as
  // SUPABASE_SERVICE_ROLE_KEY, and isServiceCall compares against that, so the
  // schedules must send the same key or every cron call is turned away.
  const secret = keys.find(k => k.type === 'secret' && k.name === 'default') ?? keys.find(k => k.type === 'secret');
  return { anon: pick('anon'), service: secret?.api_key ?? pick('service_role') };
}

async function vault(keys) {
  console.log('Vault secrets for the schedules');
  if (!keys.service) throw new Error('Could not read the service role key for the schedules.');
  for (const [name, value] of [
    ['pilego_project_url', projectUrl],
    ['pilego_service_key', keys.service],
  ]) {
    await sql(`
      do $$
      declare v_id uuid;
      begin
        select id into v_id from vault.secrets where name = ${literal(name)};
        if v_id is null then perform vault.create_secret(${literal(value)}, ${literal(name)});
        else perform vault.update_secret(v_id, ${literal(value)}, ${literal(name)}); end if;
      end $$;`);
    console.log(`  ${name} stored`);
  }
}

async function secrets() {
  console.log('Function secrets');
  const pairs = [
    ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
    ['GEMINI_MODEL', process.env.GEMINI_MODEL],
    ['AI_PROVIDER', process.env.AI_PROVIDER],
    ['EBAY_CLIENT_ID', process.env.EBAY_CLIENT_ID],
    ['EBAY_CLIENT_SECRET', process.env.EBAY_CLIENT_SECRET],
    ['EBAY_RU_NAME', process.env.EBAY_RU_NAME],
    ['EBAY_ENV', process.env.EBAY_ENV],
    ['EBAY_VERIFICATION_TOKEN', process.env.EBAY_VERIFICATION_TOKEN],
    ['PILEGO_APP_URL', appUrl || undefined],
    ['PILEGO_ALLOWED_ORIGINS', process.env.PILEGO_ALLOWED_ORIGINS ?? (appUrl || undefined)],
  ].filter(([, v]) => v);
  if (!pairs.length) {
    console.log('  none set in this environment, skipped');
    return;
  }
  await api('POST', `/projects/${ref}/secrets`, pairs.map(([name, value]) => ({ name, value })));
  console.log(`  set ${pairs.map(([n]) => n).join(', ')}`);
  if (!process.env.GEMINI_API_KEY) console.log('  GEMINI_API_KEY is not set: scanning will ask sellers to fill items in by hand.');
}

async function auth() {
  console.log('Auth redirect URLs');
  if (!appUrl) {
    console.log('  PILEGO_APP_URL not set, skipped. Sign-in links will point at the Supabase default site URL.');
    return;
  }
  const allow = [`${appUrl}/**`, 'http://localhost:5173/**'].join(',');
  await api('PATCH', `/projects/${ref}/config/auth`, { site_url: appUrl, uri_allow_list: allow });
  console.log(`  site URL ${appUrl}`);
}

function functions() {
  console.log('Edge functions');
  const dir = join(root, 'supabase', 'functions');
  const names = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name);
  execFileSync(process.execPath, [join(root, 'scripts', 'sync-core.mjs'), '--check'], { stdio: 'inherit' });
  for (const name of names) {
    const cmd = ['--yes', 'supabase@2', 'functions', 'deploy', name, '--project-ref', ref, '--use-api'];
    if (dryRun) {
      console.log(`  (dry run) npx ${cmd.join(' ')}`);
      continue;
    }
    execFileSync('npx', cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: token } });
  }
}

// ---------------------------------------------------------------------------

try {
  if (want('migrations')) await migrations();
  const keys = want('vault') || !only ? await apiKeys() : {};
  if (want('vault')) await vault(keys);
  if (want('secrets')) await secrets();
  if (want('auth')) await auth();
  if (want('functions')) functions();

  if (keys.anon) {
    const env = `VITE_SUPABASE_URL=${projectUrl}\nVITE_SUPABASE_ANON_KEY=${keys.anon}\n`;
    if (!dryRun) writeFileSync(join(root, 'apps', 'web', '.env.production.local'), env);
    console.log('\nWeb app settings (public values, also written to apps/web/.env.production.local):');
    console.log(`  VITE_SUPABASE_URL=${projectUrl}`);
    console.log(`  VITE_SUPABASE_ANON_KEY=${keys.anon.slice(0, 12)}…`);
  }
  console.log('\nDone.');
} catch (err) {
  console.error(`\nDeploy stopped: ${err.message}`);
  process.exit(1);
}
