# OpenManbo

An intelligent CLI agent powered by LLMs. Supports any OpenAI-compatible API endpoint.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and edit your environment config
cp .env.example .env
# Edit .env to set your OPENAI_API_KEY (and optionally OPENAI_API_BASE_URL / OPENAI_MODEL)

# One-shot chat
pnpm dev chat "Hello, who are you?"

# Interactive REPL
pnpm dev interactive
```

## Forgejo Container

The Forgejo Doro and Manbo container images now start a File Browser instance alongside the daemon so you can inspect the bundled `.openmanbo` directory from a browser.

When you run `docker compose -f docker/docker-compose.yml up --build`, the `forgejo-manbo` service exposes File Browser on `http://localhost:8080`, and the `forgejo-doro` service exposes File Browser on `http://localhost:8081`. Both point at `/app/.openmanbo`.

The default setup uses `--noauth` for local convenience. Do not expose that port to untrusted networks without adding authentication or a reverse proxy in front of it.

## CLI Commands

| Command | Description |
|---|---|
| `manbo chat <prompt>` | Send a single prompt and get a streamed response |
| `manbo interactive` (or `manbo i`) | Start an interactive chat session |
| `manbo discord` | Start the agent as a Discord bot |
| `manbo daemon` | Start the background daemon (supervisor) for agent lifecycle management |

### Daemon Admin API

When `manbo daemon` is running, it exposes a localhost-only HTTP admin server on port `7777` by default. In addition to lifecycle controls, you can create and delete schedules dynamically.

Create or update a schedule:

```bash
curl -X POST http://127.0.0.1:7777/api/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "hourly-sync",
    "schedule": "1h",
    "enabled": true,
    "payload": {"kind": "sync"}
  }'
```

Delete a schedule:

```bash
curl -X DELETE http://127.0.0.1:7777/api/schedules/hourly-sync
```

Inspect current schedules via daemon status:

```bash
curl http://127.0.0.1:7777/api/status
```

Schedule payload fields:

- `id`: unique task identifier
- `schedule`: positive interval in milliseconds, or a shorthand string like `30s`, `5m`, `2h`
- `enabled`: optional boolean, defaults to `true`
- `payload`: optional JSON object forwarded to the agent when the task fires

### Global Options

| Option | Env Variable | Description |
|---|---|---|
| `--api-key <key>` | `OPENAI_API_KEY` | API key for the OpenAI-compatible service |
| `--api-base-url <url>` | `OPENAI_API_BASE_URL` | Base URL (default: `https://api.openai.com/v1`) |
| `--model <model>` | `OPENAI_MODEL` | Model name (default: `gpt-4o`) |
| `--data-dir <path>` | `OPENMANBO_DATA_DIR` | Path to the `.openmanbo` storage directory (default: `.openmanbo` in cwd) |

### Logging

OpenManbo now emits timestamped runtime logs with a module scope, for example `daemon:lifecycle` or `channel:discord`.

Use `OPENMANBO_LOG_LEVEL` to control verbosity:

- `debug`: include detailed routing, MCP connection, and scheduler delivery logs
- `info`: default level, includes lifecycle and operational events
- `warn`: only warnings and errors
- `error`: only errors

### Storage Directory (`.openmanbo`)

OpenManbo reads configuration files from a storage directory (`.openmanbo` in the current working directory by default). You can override this path with `--data-dir` or the `OPENMANBO_DATA_DIR` environment variable.

#### `IDENTITY.md`

Place an `IDENTITY.md` file in the storage directory to set the agent's system prompt:

```bash
mkdir .openmanbo
cat > .openmanbo/IDENTITY.md << 'EOF'
You are Aria, a specialist in software architecture and TypeScript.
Answer concisely and with code examples when relevant.
EOF

manbo chat "How do I structure a Node.js monorepo?"
```

If `IDENTITY.md` is absent or empty, the default system prompt is used (`You are Manbo, a helpful and concise AI assistant.`).

#### `skills/`

Place markdown files under `.openmanbo/skills` to add reusable operating policies on top of the base identity prompt.

Every non-empty `.md` or `.markdown` file in that directory is loaded, sorted by path, and appended to the system prompt as an active skill. Skills can start with YAML frontmatter metadata for indexing and future routing. This is useful for tool-use policies, debugging playbooks, repo-specific conventions, or response style constraints that you do not want to mix directly into `IDENTITY.md`.

```bash
mkdir -p .openmanbo/skills
cat > .openmanbo/skills/tool-use.md << 'EOF'
---
name: tool-use
description: "Use when the task depends on tools, live workspace state, recent external facts, command execution, or multi-step planning."
triggers:
  - tool
  - workspace
  - command
channels:
  - cli
  - discord
---

# Tool Use Policy

Use available tools proactively when they improve accuracy, gather missing facts, or execute a requested action.

- Use tools for live workspace state, commands, or external facts.
- Use sequential-thinking for multi-step or ambiguous tasks.
- Do not guess when a tool can verify the answer.
EOF
```

Recommended frontmatter fields:

- `name`: stable skill identifier
- `description`: discovery text for indexing; include trigger phrases like "Use when..."
- `triggers`: optional keywords for future routing
- `channels`: optional channel hints such as `cli` or `discord`

OpenManbo also supports lightweight skill routing:

- Automatic routing: skills whose `triggers` match the current message can be activated for that turn.
- Explicit routing: prefix a request with `/plan`, `/tools`, `/search`, or `/skills tool-use,planning ...`.
- You can combine aliases in `/skills`, for example `/skills tools,plan ...` is equivalent to `/skills tool-use,planning ...`.
- Discord and interactive CLI apply routing per message, so one routed request does not permanently change later turns.

Skill files are always active when present, so keep them concise and operational. Use `IDENTITY.md` for persona and broad behavior, and use `skills/` for focused rules that should apply consistently.

### MCP Tools (`mcp.json`)

OpenManbo supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers, allowing the agent to call external tools (e.g. web search, file access, GitHub operations).

Create an `mcp.json` file in your `.openmanbo` storage directory to configure MCP servers:

```bash
cp .openmanbo/mcp.json.example .openmanbo/mcp.json
# Edit .openmanbo/mcp.json and fill in your API keys
```

The file follows the [Claude Desktop MCP convention](https://modelcontextprotocol.io/quickstart/user):

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": {
        "TAVILY_API_KEY": "tvly-your-tavily-api-key-here"
      }
    }
  }
}
```

OpenManbo supports two transport types:

#### Stdio servers (local)

Spawn a local process that communicates over stdin/stdout.

Relative paths in stdio server configs are resolved from the parent directory of your `.openmanbo` data directory by default. In the common case where your config lives at `/path/to/project/.openmanbo/mcp.json`, paths like `.openmanbo/memory.jsonl` and `.openmanbo/workspace` resolve from `/path/to/project`. If a server needs a different base directory, set `cwd` explicitly in that server entry.

String values in `mcp.json` support variable expansion before servers are launched. This applies to `args`, `cwd`, `env`, `url`, and `headers` values.

| Variable | Meaning |
|---|---|
| `${dataDir}` | Absolute path to your `.openmanbo` directory |
| `${workspaceDir}` | Parent directory of `.openmanbo` |
| `${homeDir}` | Your OS home directory |
| `${cwd}` | The current working directory of the OpenManbo process |
| `${env:NAME}` | Environment variable `NAME` |
| `${NAME}` | Shorthand for environment variable `NAME` |

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "cwd": "${workspaceDir}",
      "env": {
        "MEMORY_FILE_PATH": "${dataDir}/memory.jsonl"
      }
    }
  }
}
```

Example with environment variables:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "${env:OPENMANBO_MEMORY_FILE}"
      }
    }
  }
}
```

| Field | Description |
|---|---|
| `command` | Executable to spawn (e.g. `npx`, `python`, `node`) |
| `args` | Arguments passed to the command |
| `env` | Extra environment variables injected into the server process — **this is where API tokens/keys go** |

When the same key exists in both `mcp.json` `env` and your process environment (including values loaded from `.env`), the process environment value takes precedence.

#### Streamable HTTP servers (remote)

Connect to a remote MCP server over HTTP using the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

| Field | Description |
|---|---|
| `url` | URL of the remote MCP server endpoint |
| `headers` | Optional HTTP headers (e.g. `Authorization`) |

```json
{
  "mcpServers": {
    "remote": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

OpenManbo will automatically connect to all configured servers at startup, discover their tools, and make them available to the model. Tool calls are executed transparently during the reasoning loop.

### Built-in Exec Tool

OpenManbo can also expose a built-in shell execution tool directly from `mcp.json`. Unlike external MCP servers, this tool runs inside the OpenManbo process and validates commands against configurable rules before execution.

The exec tool supports two validation modes:

- **Allowlist mode** (default): only commands matching an allowlist rule are permitted.
- **Blacklist mode**: all commands are permitted *unless* they match a blacklist rule.

#### Allowlist mode (default)

```json
{
  "builtinTools": {
    "exec": {
      "enabled": true,
      "name": "exec",
      "description": "Run allowlisted workspace commands only.",
      "cwd": "${workspaceDir}",
      "timeoutMs": 15000,
      "maxOutputChars": 8000,
      "allowlist": [
        {
          "pattern": "pwd",
          "description": "Print the current working directory"
        },
        {
          "pattern": "ls(?:\\s+-[A-Za-z]+)*(?:\\s+[./A-Za-z0-9_-]+)?",
          "description": "List files in the workspace"
        },
        {
          "pattern": "pnpm\\s+(?:build|test)",
          "description": "Run the project build or test command"
        }
      ]
    }
  }
}
```

#### Blacklist mode

In blacklist mode, any command is allowed unless it matches a blacklist rule. This is useful when you want broad shell access but need to block specific dangerous operations.

```json
{
  "builtinTools": {
    "exec": {
      "enabled": true,
      "name": "exec",
      "description": "Run shell commands. Dangerous commands are blocked.",
      "cwd": "${workspaceDir}",
      "mode": "blacklist",
      "timeoutMs": 15000,
      "maxOutputChars": 8000,
      "blacklist": [
        {
          "pattern": "rm\\s+-rf\\s+/.*",
          "description": "Block recursive forced deletion from root"
        },
        {
          "pattern": "(?:sudo|doas)\\s+.*",
          "description": "Block privilege escalation"
        }
      ]
    }
  }
}
```

The exec tool accepts a single argument:

| Field | Description |
|---|---|
| `command` | A single-line shell command string that must match one of the configured allowlist regex rules |

Built-in exec fields:

| Field | Description |
|---|---|
| `enabled` | Enable or disable the built-in exec tool |
| `name` | Tool name exposed to the model (default: `exec`) |
| `description` | Tool description shown to the model |
| `cwd` | Working directory for command execution |
| `shell` | Optional shell executable path override |
| `env` | Extra environment variables passed to the spawned process |
| `timeoutMs` | Command timeout in milliseconds |
| `maxOutputChars` | Max combined stdout/stderr characters returned to the model |
| `maxCommandLength` | Max accepted command length before validation fails |
| `mode` | `"allowlist"` (default) or `"blacklist"` |
| `allowlist` | Array of full-string regex rules used to approve commands (allowlist mode) |
| `blacklist` | Array of full-string regex rules used to reject commands (blacklist mode) |

Rules are matched against the entire command string. A rule such as `pnpm\\s+(?:build|test)` allows `pnpm build` and `pnpm test`, but rejects `pnpm install`.

Security note: this tool validates commands before launching a shell, but it is not a sandbox. Freeform shell execution with pipes, redirects, and substitutions is inherently riskier than predefined command templates. Keep the allowlist narrow and prefer anchored, specific patterns.

### Built-in Self-Reflection Tool

OpenManbo can also expose a built-in reflection tool for short post-task reviews. This is useful in multi-step workflows such as notification triage, where the agent should pause after one task, review its misses, and apply that adjustment to the next task.

```json
{
  "builtinTools": {
    "reflection": {
      "enabled": true,
      "name": "self-reflection",
      "description": "Review the last completed task, identify misses or risks, and suggest concrete adjustments before continuing.",
      "maxInputChars": 12000
    }
  }
}
```

The reflection tool accepts these arguments:

| Field | Description |
|---|---|
| `task` | What the agent was trying to accomplish |
| `summary` | What actions the agent actually took |
| `outcome` | The resulting state, including unfinished parts |
| `blockers` | Optional blockers, surprises, or unresolved questions |
| `nextFocus` | Optional description of the next task to optimize for |

Built-in reflection fields:

| Field | Description |
|---|---|
| `enabled` | Enable or disable the reflection tool |
| `name` | Tool name exposed to the model (default: `self-reflection`) |
| `description` | Tool description shown to the model |
| `systemPrompt` | Optional override for the internal reflection prompt |
| `maxInputChars` | Max combined argument characters sent to the reflection sub-call |

The tool uses the same LLM client and model as the main agent, but with a stricter prompt that asks for concise critique rather than more execution.

### Built-in Context Compression Tool

OpenManbo can expose a built-in context compression tool that rewrites the current working state into a compact continuation snapshot. This is useful for long-running autonomous flows where the agent should periodically compress accumulated state before moving to the next item.

```json
{
  "builtinTools": {
    "compression": {
      "enabled": true,
      "name": "compress_context",
      "description": "Compress the current working context into a compact continuation snapshot.",
      "maxInputChars": 16000
    }
  }
}
```

The compression tool accepts these arguments:

| Field | Description |
|---|---|
| `task` | The overall task or objective being pursued |
| `completed` | Work already completed that should not be repeated |
| `openItems` | Remaining work, unresolved questions, or pending items |
| `carryForward` | Optional facts, identifiers, constraints, or decisions to preserve |
| `nextStep` | Optional immediate next action |

Built-in compression fields:

| Field | Description |
|---|---|
| `enabled` | Enable or disable the compression tool |
| `name` | Tool name exposed to the model (default: `compress_context`) |
| `description` | Tool description shown to the model |
| `systemPrompt` | Optional override for the internal compression prompt |
| `maxInputChars` | Max combined argument characters sent to the compression sub-call |

When the tool is called through the agent reasoning loop, OpenManbo replaces the active in-turn working context with the returned snapshot so later steps continue from the compressed state instead of the full prior trace.

The Forgejo notification poller automatically enables this tool with default settings for its activation prompt, so `compress_context` is available there even when it is omitted from `mcp.json`.

#### Popular MCP servers from [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers)

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": { "TAVILY_API_KEY": "tvly-your-key" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp-your-token" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

If `mcp.json` is absent or contains no servers, the agent runs without tools (same as before).

### Discord Channel

Run the agent as a Discord bot. The bot responds to direct messages and @mentions in server channels.

```bash
# Set your Discord bot token
export DISCORD_BOT_TOKEN=your-bot-token

# Start the bot
pnpm dev discord

# Or pass the token directly
pnpm dev discord --bot-token your-bot-token
```

| Option | Env Variable | Description |
|---|---|---|
| `--bot-token <token>` | `DISCORD_BOT_TOKEN` | Discord bot token |

#### Setting Up the Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and add a bot
3. Enable the **Message Content Intent** under the bot settings
4. Copy the bot token and set it as `DISCORD_BOT_TOKEN`
5. Invite the bot to your server using the OAuth2 URL generator with the `bot` scope and `Send Messages` + `Read Message History` permissions

## Channels

OpenManbo supports a **channel** architecture (inspired by [openclaw](https://github.com/openclaw/openclaw)) that lets you connect the agent to different messaging platforms. Each channel receives messages from a platform, routes them through the Agent kernel, and sends responses back.

Currently supported channels:

| Channel | Status |
|---|---|
| Discord | ✅ Supported |

More channels (Slack, Telegram, etc.) can be added by implementing the `Channel` interface in `src/channel/types.ts`.

## Project Structure

```
src/
├── channel/       # Channel abstraction & platform implementations
│   ├── types.ts   # Channel interface definition
│   ├── discord.ts # Discord channel (discord.js)
│   └── index.ts
├── cli/           # Commander.js CLI entry point
│   └── index.ts
├── config/        # Environment & configuration loading
│   └── env.ts
├── daemon/        # Background Daemon (Supervisor / Control Plane)
│   ├── types.ts   # IPC message types, daemon config, status interfaces
│   ├── lifecycle.ts # LifecycleManager – spawn, rebuild, self-heal
│   ├── scheduler.ts # Interval-based background task scheduler
│   ├── admin.ts   # Lightweight HTTP admin server (status, controls)
│   └── index.ts
├── mcp/           # MCP (Model Context Protocol) client integration
│   ├── types.ts   # McpConfig / McpServerConfig interfaces (stdio & HTTP)
│   ├── client.ts  # McpManager – connects to servers, lists/calls tools
│   └── index.ts
├── storage/       # .openmanbo storage directory helpers
│   └── index.ts   # resolveDataDir, readIdentity, readMcpConfig
└── kernel/        # Agent Kernel (LLM client + Agent loop)
    ├── index.ts
    ├── llm.ts     # OpenAI SDK client factory
    └── agent.ts   # Agent class with streaming chat + tool-calling loop
```

## Development

```bash
pnpm dev            # Run via tsx (no build needed)
pnpm build          # Compile TypeScript to dist/
pnpm start          # Run compiled output
pnpm daemon         # Start the background daemon (after building)
```

## Docker

Build the image:

```bash
docker build -t openmanbo .
```

The container defaults to the `discord` command. It reads normal environment variables (`OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_MODEL`, `DISCORD_BOT_TOKEN`) and uses `/data` as the `.openmanbo` directory inside the container.

Run the Discord bot with your local config mounted into `/data`:

```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/.openmanbo:/data" \
  openmanbo
```

Override the default command when you want one-shot chat instead:

```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/.openmanbo:/data" \
  openmanbo chat "Hello, who are you?"
```

## License

MIT
