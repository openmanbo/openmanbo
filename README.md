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
├── storage/       # .openmanbo storage directory helpers
│   └── index.ts   # resolveDataDir, readIdentity
└── kernel/        # Agent Kernel (LLM client + Agent loop)
    ├── index.ts
    ├── llm.ts     # OpenAI SDK client factory
    └── agent.ts   # Agent class with streaming chat
```

## Development

```bash
pnpm dev            # Run via tsx (no build needed)
pnpm build          # Compile TypeScript to dist/
pnpm start          # Run compiled output
```

## License

MIT