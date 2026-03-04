import { config } from "dotenv";

config();

export interface AppConfig {
  /** OpenAI-compatible API key */
  apiKey: string;
  /** OpenAI-compatible API base URL (e.g. https://api.openai.com/v1) */
  apiBaseUrl: string;
  /** Model name to use (e.g. gpt-4o, deepseek-chat) */
  model: string;
}

/**
 * Load configuration from environment variables.
 * Supports any OpenAI-compatible endpoint via OPENAI_API_BASE_URL.
 */
export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const apiKey = overrides?.apiKey ?? process.env.OPENAI_API_KEY;
  const apiBaseUrl =
    overrides?.apiBaseUrl ??
    process.env.OPENAI_API_BASE_URL ??
    "https://api.openai.com/v1";
  const model = overrides?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set OPENAI_API_KEY environment variable or pass --api-key.",
    );
  }

  return { apiKey, apiBaseUrl, model };
}
