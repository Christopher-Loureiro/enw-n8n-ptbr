# ENW n8n PT-BR

Camada de idioma Português do Brasil para o **n8n oficial**, sem fork.

```
n8n oficial X.Y.Z
      +
locale/pt.json          ← nossa única fonte de verdade
      +
patch mínimo (@n8n/i18n) ← registra o pt.json em produção
      +
build só do frontend
      =
n8n X.Y.Z em PT-BR
```

Este repositório contém **somente** tradução, scripts de manutenção, processo de build e documentação.
Ele não é lugar para alterações funcionais do n8n (veja [Features do n8n](#features-do-n8n)).

## Estrutura

```
enw-n8n-ptbr/
├── locale/pt.json                    ← ÚNICO arquivo de tradução editado por nós
├── patches/load-pt-locale.patch      ← patch de 3 linhas em @n8n/i18n/src/index.ts
├── scripts/
│   ├── check-locale.mjs              ← valida pt.json contra o inglês oficial (não altera nada)
│   ├── sync-locale.mjs               ← ajuda a atualizar para uma versão nova do n8n
│   ├── generate-design-locale.mjs    ← gera o pt.ts do design-system no build
│   └── lib.mjs                       ← funções compartilhadas
├── n8n-version.json                  ← versão, commit e digest oficiais fixados
├── Dockerfile
└── .github/workflows/build.yml       ← build manual (workflow_dispatch) e push no GHCR
```

## Como funciona

- **Locale:** `pt`. A documentação de i18n do n8n diz que variantes regionais como `pt-BR` não são suportadas, então seguimos o ISO 639-1. O conteúdo é Português do Brasil.
- **Por que existe um patch:** no n8n 2.1.1, o `App.vue` só chama `setLanguage()`. Nenhum código de produção carrega um JSON de idioma além do inglês, porque o carregamento só existe no HMR de desenvolvimento.
  - Além disso, vários rótulos são resolvidos no topo dos módulos (descritores de Data tables, MCP, Chat), antes de qualquer troca de idioma.
  - O patch importa `locales/pt.json`, registra o arquivo na criação da instância do vue-i18n e usa `pt` como locale inicial.
  - O `App.vue` oficial continua chamando `setLanguage(N8N_DEFAULT_LOCALE)` sem alteração.
- **Design-system:** os componentes do `@n8n/design-system` têm 80 strings próprias, em `lang/en.ts`. Essas chaves também ficam no nosso `pt.json`. Durante o build, `generate-design-locale.mjs` gera `lang/pt.ts` a partir dele. O `pt.ts` é **artefato de build**, nunca editado.
- **Fallback:** chaves ausentes no `pt.json` aparecem em inglês (`fallbackLocale: 'en'` do vue-i18n), sem quebrar a interface.
- **Imagem:** `FROM n8nio/n8n:X.Y.Z@sha256:…` mais a substituição de `n8n-editor-ui/dist`. Backend, nodes e runners ficam idênticos ao oficial.

## Editando traduções

1. Edite `locale/pt.json`, mantendo as chaves exatamente como no inglês.
2. Preserve:
   - placeholders (`{name}`, `{count}`, `{ limit }`);
   - formas de plural separadas por ` | ` (mesma quantidade do inglês);
   - links do vue-i18n (`@:_reusableBaseText.save`);
   - HTML, atributos e URLs;
   - o literal `{'@'}`.
3. Não traduza nomes de marcas, tecnologias e nodes (n8n, Webhook, HTTP Request, Redis, PostgreSQL, OpenAI, Gmail, Google Sheets, JSON, API, OAuth…).
4. Rode a validação:

```bash
node scripts/check-locale.mjs
```

Opções úteis:
- `--list` lista as chaves de cada problema;
- `--strict` também falha com chaves faltantes ou obsoletas.

Glossário adotado:

| Inglês | Português |
|---|---|
| Workflow(s) | Fluxo(s) de trabalho |
| Execution(s) | Execução(ões) |
| Credential(s) | Credencial(is) |
| Node | Nó |
| Trigger | Gatilho |
| Pin data | Fixar dados |
| Publish / Unpublish | Publicar / Despublicar |
| Templates | Modelos |
| Data table | Tabela de dados |
| Evaluation | Avaliação |
| Source control | Controle de versão |
| Settings | Configurações |
| Save / Delete / Cancel | Salvar / Excluir / Cancelar |
| Search / Filter | Pesquisar / Filtrar |

## Build da imagem

O build é feito **somente** pelo GitHub Actions, de forma manual. Não faça build na VPS de produção: o build do frontend usa 4–8 GB de RAM.

Para rodar: GitHub → **Actions** → **Build imagem n8n PT-BR** → **Run workflow**, com:

- `N8N_VERSION`: versão oficial, por exemplo `2.1.1`;
- `TRANSLATION_VERSION`: `test`, `test2`, `v1`, `v2`…;
- `N8N_IMAGE_DIGEST`: opcional. Se ficar vazio, usa o digest de `n8n-version.json` (quando a versão bate) ou o digest atual do Docker Hub.

O workflow faz o seguinte:
1. Resolve o commit exato da tag `n8n@X.Y.Z`.
2. Valida o `pt.json`.
3. Recusa tags que já existem.
4. Constrói e publica a imagem.

Tags geradas:

```
ghcr.io/christopher-loureiro/enw-n8n-ptbr:<versao-n8n>-test
ghcr.io/christopher-loureiro/enw-n8n-ptbr:<versao-n8n>-v1
```

Uma tag **nunca** é sobrescrita: cada build recebe um sufixo novo.

## Teste isolado (antes de produção)

Este teste usa um container temporário, volume próprio e SQLite. Não toca no banco, no Redis, nos webhooks nem no domínio de produção.

```bash
docker run -d --name n8n-ptbr-test -p 127.0.0.1:5699:5678 -v n8n_ptbr_test_data:/home/node/.n8n -e N8N_DEFAULT_LOCALE=pt -e GENERIC_TIMEZONE=America/Sao_Paulo -e TZ=America/Sao_Paulo -e N8N_SECURE_COOKIE=false ghcr.io/christopher-loureiro/enw-n8n-ptbr:2.1.1-test
```

Acesse por túnel SSH com `ssh -L 5699:127.0.0.1:5699 enw-vps` e abra `http://localhost:5699`.

Para remover depois, apague o container e o volume **de teste** (nunca os volumes de produção):

```bash
docker rm -f n8n-ptbr-test
```

```bash
docker volume rm n8n_ptbr_test_data
```

**Teste de fallback:** remova uma chave do `pt.json`, gere uma imagem `-testN` e confirme que o texto aparece em inglês.

## Produção

Só o serviço **main/editor** usa a imagem traduzida. Workers e runners continuam oficiais, na mesma versão.

```yaml
n8n:                     # main/editor
  image: ghcr.io/christopher-loureiro/enw-n8n-ptbr:2.1.1-v1
  environment:
    - N8N_DEFAULT_LOCALE=pt
    - GENERIC_TIMEZONE=America/Sao_Paulo
    - TZ=America/Sao_Paulo
n8n-worker-1:  { image: n8nio/n8n:2.1.1 }
n8n-worker-2:  { image: n8nio/n8n:2.1.1 }
runners:       { image: n8nio/runners:2.1.1 }
```

Não altere banco, Redis, encryption key, volumes, URLs, Traefik, workflows nem credenciais.

## Rollback

Imagem original documentada antes do deploy:

```
IMAGEM ORIGINAL: n8nio/n8n:2.1.1  (sha256:0f10214f8f9484581288861f682eb73482f923c2c697d57fa300568433bb9ff1)
```

Para voltar:
1. No serviço `n8n`, troque `image:` de volta para `n8nio/n8n:2.1.1`.
2. Remova `N8N_DEFAULT_LOCALE`, ou defina `en`.
3. Recrie **apenas** esse serviço.

Não é preciso restaurar o banco nem mexer em volumes. **Nunca** execute `docker compose down -v`.

## Atualização futura (nova versão do n8n)

```
obter en.json novo → check-locale → sync-locale → traduzir missing-translations.json
→ validar → build de teste → testar → produção
```

1. **Relatório:**

```bash
node scripts/sync-locale.mjs --to X.Y.Z --from 2.1.1
```

Ele gera três arquivos em `work/sync-X.Y.Z/`:
- `missing-translations.json`: chaves novas, a traduzir;
- `review-translations.json`: chaves cujo inglês mudou;
- `obsolete-keys.json`: chaves removidas.

2. **Traduzir** os valores de `missing-translations.json`, mantendo as chaves.

3. **Incorporar** as traduções e remover as obsoletas:

```bash
node scripts/sync-locale.mjs --to X.Y.Z --merge work/sync-X.Y.Z/missing-translations.json --prune
```

4. **Validar:**

```bash
node scripts/check-locale.mjs --version X.Y.Z --strict
```

5. Confira se o patch ainda se aplica, olhando o `packages/frontend/@n8n/i18n/src/index.ts` da nova tag. O build falha em `git apply --check` se não aplicar. Se a nova versão passar a carregar locales sozinha, o patch pode ser removido.
6. Atualize `n8n-version.json` (versão, commit, digest), rode o workflow com `TRANSLATION_VERSION=test`, teste, e depois rode com `v1`.

Nenhuma tradução é feita automaticamente: o `sync-locale` só escreve no `pt.json` com `--merge` ou `--prune`.

## Limitações conhecidas

Estas partes **não** passam pelo `pt.json`:
- Nomes, descrições e parâmetros dos nodes e dos formulários de credenciais: vêm das definições dos nodes. O n8n tem um mecanismo próprio para isso, mas fora do escopo deste projeto.
- Componentes internos do Element Plus (date picker, "No Data"): o locale deles não é configurado pelo n8n.
- Mensagens de erro vindas do backend, conteúdo de templates (api.n8n.io) e respostas do AI Assistant.
- Alguns textos fixos direto nos componentes Vue.

## Features do n8n

Para entender features novas, consulte o repositório oficial [n8n-io/n8n](https://github.com/n8n-io/n8n) na tag da versão correspondente.

Qualquer customização funcional precisa de uma decisão separada (um fork, por exemplo). Ela **não** entra aqui. Tradução e customização funcional ficam separadas.
