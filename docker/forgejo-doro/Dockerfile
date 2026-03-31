# syntax=docker/dockerfile:1.7

# ── forgejo-coder ──────────────────────────────────────────────────
# A self-contained image for running the OpenManbo Forgejo coder agent
# in daemon mode. Includes a basic dev environment and Claude Code CLI.

FROM node:22-bookworm AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ── System dev tools ───────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      openssh-client \
      ca-certificates \
      curl \
      build-essential \
      python3 \
    && rm -rf /var/lib/apt/lists/*

# Configure git for the container
RUN git config --system init.defaultBranch main \
 && git config --system user.name "doro" \
 && git config --system user.email "doro@noreply.localhost"

# ── Claude Code CLI ───────────────────────────────────────────────
RUN npm install -g @anthropic-ai/claude-code

# ── File Browser ──────────────────────────────────────────────────
ARG FILEBROWSER_VERSION=2.62.2
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) fb_arch='amd64' ;; \
      arm64) fb_arch='arm64' ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/filebrowser/filebrowser/releases/download/v${FILEBROWSER_VERSION}/linux-${fb_arch}-filebrowser.tar.gz" \
      -o /tmp/filebrowser.tar.gz; \
    tar -xzf /tmp/filebrowser.tar.gz -C /usr/local/bin filebrowser; \
    chmod +x /usr/local/bin/filebrowser; \
    rm -f /tmp/filebrowser.tar.gz

# ── App dependencies ──────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Runtime ───────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

COPY --chown=node:node .openmanbo ./.openmanbo
COPY --chown=node:node docker/forgejo-doro/IDENTITY.md ./.openmanbo/IDENTITY.md
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chmod=755 docker/forgejo-doro/entrypoint.sh /usr/local/bin/openmanbo-doro-entrypoint

# Workspace directory for cloning repos (writable by node user)
RUN mkdir -p /workspace /workspace/.filebrowser && chown -R node:node /workspace
ENV OPENMANBO_WORKSPACE_DIR=/workspace

USER node

ENV OPENMANBO_LOG_LEVEL=debug \
  OPENMANBO_FILEBROWSER_ROOT=/app/.openmanbo \
  OPENMANBO_FILEBROWSER_ADDRESS=0.0.0.0 \
  OPENMANBO_FILEBROWSER_PORT=8081 \
  OPENMANBO_FILEBROWSER_DATABASE=/workspace/.filebrowser/filebrowser.db

ENTRYPOINT ["openmanbo-doro-entrypoint"]
CMD ["--forgejo-poll-interval", "1m"]
