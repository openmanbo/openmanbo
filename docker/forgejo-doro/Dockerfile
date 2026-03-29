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

# Workspace directory for cloning repos (writable by node user)
RUN mkdir -p /workspace && chown node:node /workspace
ENV OPENMANBO_WORKSPACE_DIR=/workspace

USER node

ENV OPENMANBO_LOG_LEVEL=debug
ENTRYPOINT ["node", "dist/cli/index.js", "daemon"]
CMD ["--forgejo-poll-interval", "1m"]
