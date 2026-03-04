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

### Global Options

| Option | Env Variable | Description |
|---|---|---|
| `--api-key <key>` | `OPENAI_API_KEY` | API key for the OpenAI-compatible service |
| `--api-base-url <url>` | `OPENAI_API_BASE_URL` | Base URL (default: `https://api.openai.com/v1`) |
| `--model <model>` | `OPENAI_MODEL` | Model name (default: `gpt-4o`) |

## Project Structure

```
src/
├── cli/           # Commander.js CLI entry point
│   └── index.ts
├── config/        # Environment & configuration loading
│   └── env.ts
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