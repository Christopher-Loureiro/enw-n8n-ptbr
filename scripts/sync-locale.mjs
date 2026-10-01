#!/usr/bin/env node
/**
 * Ajuda a atualizar o locale/pt.json quando sai uma versão nova do n8n.
 * Nunca traduz nada automaticamente.
 *
 * 1) Relatório (não altera pt.json):
 *      node scripts/sync-locale.mjs --to 2.2.0 [--from 2.1.1]
 *    Gera em work/sync-<versão>/:
 *      missing-translations.json   { "chave.nova": "English text" }        ← traduzir
 *      review-translations.json    { chave: { oldEn, newEn, pt } }         ← inglês mudou (precisa --from)
 *      obsolete-keys.json          [ "chave.removida", ... ]
 *
 * 2) Incorporar traduções feitas (valida as chaves contra o inglês novo):
 *      node scripts/sync-locale.mjs --to 2.2.0 --merge work/sync-2.2.0/missing-translations.json
 *
 * 3) Remover obsoletas e reordenar como o en.json oficial:
 *      node scripts/sync-locale.mjs --to 2.2.0 --prune
 *
 * --merge e --prune podem ser usados juntos e são as ÚNICAS opções que escrevem no pt.json.
 * Valores de --merge ainda iguais ao inglês ou vazios são ignorados (não marcam como traduzido).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	DS_REPO_PATH, EN_REPO_PATH, PT_PATH, ROOT, flatten, fmt, getOfficialFile, parseArgs,
	parseDesignSystemLocale, readVersionInfo,
} from './lib.mjs';

const args = parseArgs();
const to = args.to ?? readVersionInfo().version;
const from = args.from;

async function officialFlat(version) {
	const en = flatten(JSON.parse(await getOfficialFile(version, EN_REPO_PATH)));
	const ds = parseDesignSystemLocale(await getOfficialFile(version, DS_REPO_PATH));
	const enRaw = JSON.parse(await getOfficialFile(version, EN_REPO_PATH));
	const all = { ...en };
	for (const [k, v] of Object.entries(ds)) if (!(k in all)) all[k] = v.isFunction ? '(função no design-system)' : v.value;
	return { all, enRaw, dsKeys: Object.keys(ds) };
}

const ptRaw = JSON.parse(readFileSync(PT_PATH, 'utf8').replace(/^﻿/, ''));
const pt = flatten(ptRaw);
const target = await officialFlat(to);
const previous = from ? await officialFlat(from) : null;

const missing = {};
const review = {};
const obsolete = [];
for (const [k, en] of Object.entries(target.all)) {
	if (!(k in pt)) missing[k] = en;
	else if (previous && k in previous.all && previous.all[k] !== en) review[k] = { oldEn: previous.all[k], newEn: en, pt: pt[k] };
}
for (const k of Object.keys(pt)) if (!(k in target.all)) obsolete.push(k);

const outDir = join(ROOT, 'work', `sync-${to}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'missing-translations.json'), JSON.stringify(missing, null, '\t') + '\n');
writeFileSync(join(outDir, 'obsolete-keys.json'), JSON.stringify(obsolete, null, '\t') + '\n');
if (previous) writeFileSync(join(outDir, 'review-translations.json'), JSON.stringify(review, null, '\t') + '\n');

console.log(`n8n alvo: ${to}${from ? ` (comparando com ${from})` : ''}`);
console.log(`Inglês: ${fmt(Object.keys(target.all).length)} chaves | Português: ${fmt(Object.keys(pt).length)} chaves`);
console.log(`✅ mantidas: ${fmt(Object.keys(target.all).length - Object.keys(missing).length)}`);
console.log(`🆕 novas sem tradução: ${fmt(Object.keys(missing).length)}  -> work/sync-${to}/missing-translations.json`);
if (previous) console.log(`✏️  inglês mudou (revisar): ${fmt(Object.keys(review).length)}  -> work/sync-${to}/review-translations.json`);
else console.log('✏️  inglês mudou: use --from <versão anterior> para detectar');
console.log(`🗑️  obsoletas: ${fmt(obsolete.length)}  -> work/sync-${to}/obsolete-keys.json`);

if (!args.merge && !args.prune) process.exit(0);

// ----- escrita (somente com --merge / --prune) -----
let merged = 0;
let skipped = 0;
if (args.merge) {
	const incoming = flatten(JSON.parse(readFileSync(args.merge, 'utf8').replace(/^﻿/, '')));
	for (const [k, v] of Object.entries(incoming)) {
		if (!(k in target.all)) throw new Error(`--merge: a chave "${k}" não existe no n8n ${to}`);
		if (typeof v !== 'string' || v === '' || v === target.all[k]) { skipped++; continue; }
		pt[k] = v;
		merged++;
	}
}

// Reconstrói na ordem/estrutura do en.json oficial + chaves exclusivas do design-system no fim.
const keep = (k) => k in pt && (args.prune ? k in target.all : true);
function build(node, prefix) {
	const out = {};
	for (const [k, v] of Object.entries(node)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object') {
			const child = build(v, key);
			if (Object.keys(child).length) out[k] = child;
		} else if (keep(key)) out[k] = pt[key];
	}
	return out;
}
const result = build(target.enRaw, '');
const written = new Set(Object.keys(flatten(result)));
for (const k of target.dsKeys) if (!written.has(k) && keep(k)) { result[k] = pt[k]; written.add(k); }
if (!args.prune) for (const k of Object.keys(pt)) if (!written.has(k)) result[k] = pt[k]; // preserva obsoletas

writeFileSync(PT_PATH, JSON.stringify(result, null, '\t') + '\n');
console.log(`\npt.json atualizado: ${fmt(merged)} traduções incorporadas, ${fmt(skipped)} ignoradas${args.prune ? `, ${fmt(obsolete.length)} obsoletas removidas` : ''}.`);
console.log('Agora rode: node scripts/check-locale.mjs --version ' + to);
