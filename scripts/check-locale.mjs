#!/usr/bin/env node
/**
 * Valida locale/pt.json contra os arquivos oficiais do n8n (somente leitura).
 *
 * Uso:
 *   node scripts/check-locale.mjs                      # versão de n8n-version.json
 *   node scripts/check-locale.mjs --version 2.1.1
 *   node scripts/check-locale.mjs --en <en.json> --ds <en.ts> --pt <pt.json>
 *   node scripts/check-locale.mjs --strict             # também falha com faltantes/obsoletas
 *   node scripts/check-locale.mjs --list               # lista as chaves de cada problema
 *
 * Código de saída 1 em: JSON inválido, chave duplicada, placeholder/plural/link/HTML
 * incompatível, valor vazio indevido. Faltantes e obsoletas são avisos (ou erro com --strict).
 */
import { readFileSync } from 'node:fs';
import {
	PT_PATH, attrValuesOf, findDuplicateKeys, flatten, fmt, htmlTagsOf, linksOf, loadOfficial,
	parseArgs, parseDesignSystemLocale, placeholdersOf, pluralFormsOf, sameList,
} from './lib.mjs';

const args = parseArgs();
const ptPath = args.pt ?? PT_PATH;
const { version, enText, dsText } = await loadOfficial(args);

const errors = [];
const ptText = readFileSync(ptPath, 'utf8').replace(/^﻿/, '');
let ptRaw;
try {
	ptRaw = JSON.parse(ptText);
} catch (e) {
	console.error(`❌ JSON inválido em ${ptPath}: ${e.message}`);
	process.exit(1);
}
const duplicates = findDuplicateKeys(ptText);

const en = flatten(JSON.parse(enText));
const ds = parseDesignSystemLocale(dsText);
const pt = flatten(ptRaw);

// Fonte oficial = en.json + chaves do design-system (que não têm equivalente no en.json)
const official = { ...en };
const dsOnly = [];
for (const [k, v] of Object.entries(ds)) {
	if (k in official) continue;
	official[k] = v.isFunction ? null : v.value;
	dsOnly.push(k);
}
const dsFunctions = new Set(Object.entries(ds).filter(([, v]) => v.isFunction).map(([k]) => k));

const problems = {
	missing: [], obsolete: [], placeholders: [], plurals: [], links: [], html: [], empty: [], identical: [], translated: [],
};
for (const k of Object.keys(official)) {
	if (!(k in pt)) { problems.missing.push(k); continue; }
	const e = official[k];
	const p = pt[k];
	if (typeof p !== 'string') { problems.empty.push(k); continue; }
	if (p === '' && e !== '') { problems.empty.push(k); continue; }
	if (dsFunctions.has(k)) { problems.translated.push(k); continue; }
	if (!sameList(placeholdersOf(e), placeholdersOf(p))) problems.placeholders.push(k);
	if (pluralFormsOf(e) !== pluralFormsOf(p)) problems.plurals.push(k);
	if (!sameList(linksOf(e), linksOf(p))) problems.links.push(k);
	if (!sameList(htmlTagsOf(e), htmlTagsOf(p)) || !sameList(attrValuesOf(e), attrValuesOf(p))) problems.html.push(k);
	if (p === e && /[a-z]{3}/i.test(e) && !/^@[.a-z]*:/.test(e)) problems.identical.push(k);
	else problems.translated.push(k);
}
for (const k of Object.keys(pt)) if (!(k in official)) problems.obsolete.push(k);

const blocking = problems.placeholders.length + problems.plurals.length + problems.links.length +
	problems.html.length + problems.empty.length + duplicates.length;

console.log(`n8n base: ${version}\n`);
console.log(`Inglês (oficial):\n${fmt(Object.keys(official).length)} chaves  (${fmt(Object.keys(en).length)} en.json + ${fmt(dsOnly.length)} design-system)\n`);
console.log(`Português (${ptPath.replace(/\\/g, '/').split('/').slice(-2).join('/')}):\n${fmt(Object.keys(pt).length)} chaves\n`);
console.log(`✅ traduzidas: ${fmt(problems.translated.length)}`);
console.log(`ℹ️  iguais ao inglês (marcas, termos técnicos, URLs): ${fmt(problems.identical.length)}`);
console.log(`⚠️  faltando (usam fallback em inglês): ${fmt(problems.missing.length)}`);
console.log(`🗑️  obsoletas: ${fmt(problems.obsolete.length)}`);
console.log(`❌ placeholders incompatíveis: ${fmt(problems.placeholders.length)}`);
console.log(`❌ formas de plural incompatíveis: ${fmt(problems.plurals.length)}`);
console.log(`❌ links @: incompatíveis: ${fmt(problems.links.length)}`);
console.log(`❌ HTML incompatível: ${fmt(problems.html.length)}`);
console.log(`❌ valores vazios/inválidos: ${fmt(problems.empty.length)}`);
console.log(`❌ chaves duplicadas: ${fmt(duplicates.length)}`);

const show = (title, keys, withValues = true) => {
	if (!keys.length) return;
	console.log(`\n--- ${title} (${keys.length})`);
	for (const k of args.list ? keys : keys.slice(0, 10)) {
		console.log(withValues ? `  ${k}\n    EN: ${JSON.stringify(official[k])}\n    PT: ${JSON.stringify(pt[k])}` : `  ${k}`);
	}
	if (!args.list && keys.length > 10) console.log(`  ... (+${keys.length - 10}, use --list)`);
};
show('placeholders incompatíveis', problems.placeholders);
show('plural incompatível', problems.plurals);
show('links incompatíveis', problems.links);
show('HTML incompatível', problems.html);
show('valores vazios/inválidos', problems.empty);
show('chaves duplicadas', duplicates, false);
if (args.list || args.strict) {
	show('faltando', problems.missing, false);
	show('obsoletas', problems.obsolete, false);
}

const failed = blocking > 0 || (args.strict && (problems.missing.length + problems.obsolete.length) > 0);
console.log(failed ? '\nResultado: ❌ FALHOU' : '\nResultado: ✅ OK');
process.exit(failed ? 1 : 0);
