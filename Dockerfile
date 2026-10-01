# syntax=docker/dockerfile:1
#
# ENW n8n PT-BR
#
#   n8n oficial X.Y.Z (código-fonte na tag n8n@X.Y.Z, commit verificado)
#     + locale/pt.json
#     + patches/load-pt-locale.patch
#     -> build SOMENTE do frontend (editor-ui)
#     -> copiado sobre a imagem oficial n8nio/n8n:X.Y.Z@digest
#
# O backend, os nodes e todo o resto continuam byte a byte iguais à imagem oficial.
# Os valores padrão vêm de n8n-version.json; o GitHub Actions passa todos explicitamente.

ARG N8N_VERSION=2.1.1
ARG N8N_COMMIT=ec8f1a56cbd702355b05d8c25827d61a957b2170
ARG N8N_IMAGE_DIGEST=sha256:0f10214f8f9484581288861f682eb73482f923c2c697d57fa300568433bb9ff1
ARG NODE_VERSION=22.21.1

# ------------------------------------------------------------------------------
# Etapa 1: build do frontend com o locale pt
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm AS builder
ARG N8N_VERSION
ARG N8N_COMMIT

ENV CI=true \
    DO_NOT_TRACK=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /src
RUN git clone --depth 1 --branch "n8n@${N8N_VERSION}" https://github.com/n8n-io/n8n.git n8n \
 && cd n8n \
 && test "$(git rev-parse HEAD)" = "${N8N_COMMIT}" \
 || (echo "ERRO: a tag n8n@${N8N_VERSION} não aponta para o commit esperado ${N8N_COMMIT}" && exit 1)

WORKDIR /src/n8n
COPY scripts/ /enw/scripts/
COPY patches/ /enw/patches/
COPY locale/pt.json packages/frontend/@n8n/i18n/src/locales/pt.json

# 1) valida o pt.json contra o en.json desta versão exata
# 2) aplica o patch mínimo de carregamento do locale
# 3) gera o arquivo de idioma do design-system a partir do pt.json (artefato de build)
RUN node /enw/scripts/check-locale.mjs \
      --version "${N8N_VERSION}" \
      --en packages/frontend/@n8n/i18n/src/locales/en.json \
      --ds packages/frontend/@n8n/design-system/src/locale/lang/en.ts \
      --pt packages/frontend/@n8n/i18n/src/locales/pt.json \
 && git apply --check /enw/patches/load-pt-locale.patch \
 && git apply /enw/patches/load-pt-locale.patch \
 && node /enw/scripts/generate-design-locale.mjs \
      --pt packages/frontend/@n8n/i18n/src/locales/pt.json \
      --ds packages/frontend/@n8n/design-system/src/locale/lang/en.ts \
      --out packages/frontend/@n8n/design-system/src/locale/lang/pt.ts \
 && git status --short

RUN pnpm install --frozen-lockfile

# Compila apenas o editor-ui e as dependências de workspace que ele exige.
RUN pnpm turbo run build --filter=n8n-editor-ui \
 && test -f packages/frontend/editor-ui/dist/index.html

# ------------------------------------------------------------------------------
# Etapa 2: imagem oficial + frontend traduzido
# ------------------------------------------------------------------------------
FROM n8nio/n8n:${N8N_VERSION}@${N8N_IMAGE_DIGEST}
ARG N8N_VERSION
ARG N8N_COMMIT
ARG N8N_IMAGE_DIGEST
ARG TRANSLATION_VERSION=dev

USER root
COPY --from=builder /src/n8n/packages/frontend/editor-ui/dist /tmp/enw-editor-ui-dist

# Mesmo caminho que o n8n usa (EDITOR_UI_DIST_DIR = dirname(require.resolve('n8n-editor-ui'))/dist).
RUN set -e; \
    DEST="$(cd /usr/local/lib/node_modules/n8n && node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('n8n-editor-ui')),'dist'))")"; \
    test -f "$DEST/index.html"; \
    rm -rf "$DEST"; \
    mv /tmp/enw-editor-ui-dist "$DEST"; \
    echo "editor-ui substituído em $DEST"
USER node

LABEL org.opencontainers.image.title="enw-n8n-ptbr" \
      org.opencontainers.image.description="n8n ${N8N_VERSION} oficial com interface em Português do Brasil (locale pt)" \
      org.opencontainers.image.source="https://github.com/Christopher-Loureiro/enw-n8n-ptbr" \
      org.opencontainers.image.version="${N8N_VERSION}-${TRANSLATION_VERSION}" \
      org.opencontainers.image.base.name="docker.io/n8nio/n8n:${N8N_VERSION}" \
      org.opencontainers.image.base.digest="${N8N_IMAGE_DIGEST}" \
      com.enw.n8n.version="${N8N_VERSION}" \
      com.enw.n8n.commit="${N8N_COMMIT}" \
      com.enw.translation.version="${TRANSLATION_VERSION}"
