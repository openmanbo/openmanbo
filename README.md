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

## CLI Commands

| Command | Description |
|---|---|
| `manbo chat <prompt>` | Send a single prompt and get a streamed response |
| `manbo interactive` (or `manbo i`) | Start an interactive chat session |
| `manbo discord` | Start the agent as a Discord bot |

### Global Options

| Option | Env Variable | Description |
|---|---|---|
| `--api-key <key>` | `OPENAI_API_KEY` | API key for the OpenAI-compatible service |
| `--api-base-url <url>` | `OPENAI_API_BASE_URL` | Base URL (default: `https://api.openai.com/v1`) |
| `--model <model>` | `OPENAI_MODEL` | Model name (default: `gpt-4o`) |
| `--data-dir <path>` | `OPENMANBO_DATA_DIR` | Path to the `.openmanbo` storage directory (default: `.openmanbo` in cwd) |

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

OpenManbo can also expose a built-in shell execution tool directly from `mcp.json`. Unlike external MCP servers, this tool runs inside the OpenManbo process and only accepts commands that match an explicit allowlist.

```json
{
  "builtinTools": {
    "exec": {
      "enabled": true,
      "name": "builtin_exec",
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

The exec tool accepts a single argument:

| Field | Description |
|---|---|
| `command` | A single-line shell command string that must match one of the configured allowlist regex rules |

Built-in exec fields:

| Field | Description |
|---|---|
| `enabled` | Enable or disable the built-in exec tool |
| `name` | Tool name exposed to the model (default: `builtin_exec`) |
| `description` | Tool description shown to the model |
| `cwd` | Working directory for command execution |
| `shell` | Optional shell executable path override |
| `env` | Extra environment variables passed to the spawned process |
| `timeoutMs` | Command timeout in milliseconds |
| `maxOutputChars` | Max combined stdout/stderr characters returned to the model |
| `maxCommandLength` | Max accepted command length before validation fails |
| `allowlist` | Array of full-string regex rules used to approve commands |

Rules are matched against the entire command string. A rule such as `pnpm\\s+(?:build|test)` allows `pnpm build` and `pnpm test`, but rejects `pnpm install`.

Security note: this tool validates commands before launching a shell, but it is not a sandbox. Freeform shell execution with pipes, redirects, and substitutions is inherently riskier than predefined command templates. Keep the allowlist narrow and prefer anchored, specific patterns.

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
