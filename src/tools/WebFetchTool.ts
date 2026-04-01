/**
 * WebFetchTool – Fetch content from a URL.
 *
 * Retrieves web content and returns it as text.
 * Supports basic HTML-to-text conversion for readability.
 */

import type { Tool, ToolResult } from "./types.js";

const MAX_RESPONSE_SIZE = 50_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export class WebFetchTool implements Tool {
  readonly spec = {
    name: "web_fetch",
    description:
      "Fetch content from a URL and return it as text. " +
      "Use this to read web pages, API responses, or download text content. " +
      "The response is truncated if it exceeds the maximum size.",
    input: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch.",
        },
        max_length: {
          type: "number",
          description: `Maximum response length in characters (default: ${MAX_RESPONSE_SIZE}).`,
        },
      },
      required: ["url"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url;
    if (typeof url !== "string" || !url.trim()) {
      return { content: "Error: url must be a non-empty string.", isError: true };
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { content: "Error: Invalid URL format.", isError: true };
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { content: "Error: Only http and https URLs are supported.", isError: true };
    }

    const maxLength = typeof args.max_length === "number" && args.max_length > 0
      ? Math.min(args.max_length, MAX_RESPONSE_SIZE)
      : MAX_RESPONSE_SIZE;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "OpenManbo/0.1.0",
          "Accept": "text/html,application/json,text/plain,*/*",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: `Error: HTTP ${response.status} ${response.statusText}`,
          isError: true,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();

      let content: string;
      if (contentType.includes("text/html")) {
        content = stripHtml(text);
      } else {
        content = text;
      }

      const truncated = content.length > maxLength;
      if (truncated) {
        content = content.slice(0, maxLength) + "\n\n[Response truncated]";
      }

      return {
        content: `URL: ${url}\nContent-Type: ${contentType}\n\n${content}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Error fetching URL: ${message}`, isError: true };
    }
  }
}

/**
 * Very simple HTML tag stripper.
 * For a real implementation, use a proper library like turndown.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
