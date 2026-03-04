import OpenAI from "openai";
import type { AppConfig } from "../config/env.js";

/**
 * Create an OpenAI-compatible client from the application configuration.
 */
export function createLLMClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl,
  });
}
