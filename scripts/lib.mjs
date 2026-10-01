// Funções compartilhadas pelos scripts de manutenção do locale.
// Sem dependências externas: apenas Node.js 20+.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PT_PATH = join(ROOT, 'locale', 'pt.json');
export const EN_REPO_PATH = 'packages/frontend/@n8n/i18n/src/locales/en.json';
export const DS_REPO_PATH = 'packages/frontend/@n8n/design-system/src/locale/lang/en.ts';

export function readVersionInfo() {
	return JSON.parse(readFileSync(join(ROOT, 'n8n-version.json'), 'utf8'));
}

/** Lê argumentos no formato --chave valor / --flag. */
export function parseArgs(argv = process.argv.slice(2)) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) args[key] = true;
		else {
			args[key] = next;
			i++;
		}
	}
	return args;
}

/**
 * Obtém um arquivo do repositório oficial n8n-io/n8n na tag n8n@<versão>.
 * Usa cache em work/n8n-<versão>/ para funcionar offline depois do primeiro download.
 */
export async function getOfficialFile(version, repoPath) {
	const cacheFile = join(ROOT, 'work', `n8n-${version}`, repoPath.replaceAll('/', '__'));
	if (existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
	const url = `https://raw.githubusercontent.com/n8n-io/n8n/n8n%40${version}/${repoPath}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
	const text = await res.text();
	mkdirSync(dirname(cacheFile), { recursive: true });
	writeFileSync(cacheFile, text);
	return text;
}

/** Carrega en.json e en.ts (design-system) a partir de caminhos locais ou da versão oficial. */
export async function loadOfficial(args) {
	const version = args.version ?? readVersionInfo().version;
	const enText = args.en ? readFileSync(args.en, 'utf8') : await getOfficialFile(version, EN_REPO_PATH);
	const dsText = args.ds ? readFileSync(args.ds, 'utf8') : await getOfficialFile(version, DS_REPO_PATH);
	return { version, enText, dsText };
}

/** Achata objetos aninhados em chaves com ponto (como o vue-i18n resolve). */
export function flatten(obj, prefix = '', out = {}) {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
		else out[key] = v;
	}
	return out;
}

/**
 * Extrai as chaves do en.ts do design-system.
 * Retorna { chave: { value: string|null, isFunction: boolean } }.
 */
export function parseDesignSystemLocale(tsText) {
	const body = tsText.slice(tsText.indexOf('export default {'));
	const re = /^\t'([^']+)':\s*([\s\S]*?),\r?\n(?=\t'|\}\s*as)/gm;
	const out = {};
	let m;
	while ((m = re.exec(body))) {
		const raw = m[2].trim();
		const str = raw.match(/^(['"])([\s\S]*)\1$/);
		out[m[1]] = str
			? { value: str[2].replace(/\\'/g, "'").replace(/\\"/g, '"'), isFunction: false }
			: { value: null, isFunction: true };
	}
	if (Object.keys(out).length === 0) throw new Error('Nenhuma chave encontrada no en.ts do design-system');
	return out;
}

/**
 * Parser JSON mínimo que detecta chaves duplicadas no mesmo objeto
 * (JSON.parse aceita duplicadas silenciosamente e mantém a última).
 */
export function findDuplicateKeys(text) {
	const dups = [];
	let i = 0;
	const ws = () => {
		while (/\s/.test(text[i])) i++;
	};
	const str = () => {
		const start = i;
		i++;
		while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
		i++;
		return JSON.parse(text.slice(start, i));
	};
	const value = (path) => {
		ws();
		if (text[i] === '{') return obj(path);
		if (text[i] === '[') {
			i++;
			ws();
			let n = 0;
			while (text[i] !== ']') {
				value(`${path}[${n++}]`);
				ws();
				if (text[i] === ',') i++;
				ws();
			}
			i++;
			return;
		}
		if (text[i] === '"') return str();
		while (i < text.length && !/[,\]}\s]/.test(text[i])) i++;
	};
	const obj = (path) => {
		i++;
		const seen = new Set();
		ws();
		while (text[i] !== '}') {
			ws();
			const key = str();
			const full = path ? `${path}.${key}` : key;
			if (seen.has(key)) dups.push(full);
			seen.add(key);
			ws();
			i++; // :
			value(full);
			ws();
			if (text[i] === ',') i++;
			ws();
		}
		i++;
	};
	value('');
	return dups;
}

/** Placeholders de interpolação nomeada do vue-i18n: {name}, { count }. */
export const placeholdersOf = (s) =>
	typeof s === 'string' ? [...s.matchAll(/\{\s*([A-Za-z0-9_]+)\s*\}/g)].map((m) => m[1]).sort() : [];

/** Mensagens vinculadas do vue-i18n: @:caminho.da.chave */
export const linksOf = (s) =>
	typeof s === 'string' ? [...s.matchAll(/@[.a-z]*:[\w.]+/g)].map((m) => m[0]).sort() : [];

/** Quantidade de formas de plural (separadas por " | "). */
export const pluralFormsOf = (s) => (typeof s === 'string' ? s.split(' | ').length : 0);

/** Tags HTML (abertura e fechamento), sem atributos. */
export const htmlTagsOf = (s) =>
	typeof s === 'string' ? [...s.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)].map((m) => m[0].startsWith('</') ? `/${m[1]}` : m[1]).sort() : [];

/** Valores de href/src/data-key, que devem ser preservados. */
export const attrValuesOf = (s) =>
	typeof s === 'string' ? [...s.matchAll(/\b(href|src|data-key|target)=(["'])(.*?)\2/g)].map((m) => `${m[1]}=${m[3]}`).sort() : [];

export const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export const fmt = (n) => n.toLocaleString('pt-BR');
