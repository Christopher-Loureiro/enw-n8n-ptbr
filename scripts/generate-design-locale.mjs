#!/usr/bin/env node
/**
 * Gera, NO BUILD, o arquivo de idioma do design-system a partir do locale/pt.json.
 *
 *   locale/pt.json  (fonte única de verdade, editada por nós)
 *        ↓
 *   packages/frontend/@n8n/design-system/src/locale/lang/pt.ts  (artefato, nunca editado)
 *
 * Uso (dentro do checkout oficial do n8n):
 *   node generate-design-locale.mjs --pt <pt.json> --ds <lang/en.ts> --out <lang/pt.ts>
 *
 * Chaves sem tradução continuam com o valor inglês (o arquivo gerado começa com ...en).
 * Entradas que são funções no en.ts viram funções que interpolam {placeholders}.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PT_PATH, flatten, parseArgs, parseDesignSystemLocale } from './lib.mjs';

const args = parseArgs();
if (!args.ds || !args.out) {
	console.error('Uso: generate-design-locale.mjs --ds <lang/en.ts> --out <lang/pt.ts> [--pt <pt.json>]');
	process.exit(2);
}
const pt = flatten(JSON.parse(readFileSync(args.pt ?? PT_PATH, 'utf8').replace(/^﻿/, '')));
const ds = parseDesignSystemLocale(readFileSync(args.ds, 'utf8'));

const lines = [];
let translated = 0;
for (const [key, { isFunction }] of Object.entries(ds)) {
	const value = pt[key];
	if (typeof value !== 'string' || value === '') continue;
	translated++;
	const k = JSON.stringify(key);
	const v = JSON.stringify(value);
	lines.push(isFunction ? `\t${k}: (...args: unknown[]) => fill(${v}, args),` : `\t${k}: ${v},`);
}

const out = `/* eslint-disable */
// ARQUIVO GERADO durante o build pelo enw-n8n-ptbr (scripts/generate-design-locale.mjs).
// Fonte: locale/pt.json. Não edite este arquivo.
import type { N8nLocale } from '@n8n/design-system/types';
import en from './en';

// O design-system chama entradas-função com a lista de argumentos: fn([opções]).
const fill = (template: string, args: unknown[]): string => {
	const inner = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
	const first = inner[0];
	const values: Record<string, unknown> =
		first !== null && typeof first === 'object' ? (first as Record<string, unknown>) : { count: first };
	return template.replace(/\\{\\s*([A-Za-z0-9_]+)\\s*\\}/g, (match, name: string) =>
		name in values ? String(values[name]) : match,
	);
};

export default {
	...en,
${lines.join('\n')}
} as N8nLocale;
`;
writeFileSync(args.out, out);
console.log(`design-system: ${translated}/${Object.keys(ds).length} chaves traduzidas -> ${args.out}`);
