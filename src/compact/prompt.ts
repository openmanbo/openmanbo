/**
 * Claude Code-compatible compact prompt system.
 * 9-section structured summary with analysis scratchpad.
 *
 * The compact prompt instructs the model to produce a detailed summary of the
 * conversation so far, structured into 9 well-defined sections. The model
 * first writes a <analysis> scratchpad (which is stripped before injecting
 * the summary back into context), ensuring the final output is thorough and
 * well-organized.
 */

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.
Do NOT use any tool-calling capabilities.
Do NOT generate any function calls, tool_use blocks, or JSON tool invocations.
Simply provide a plain text response with your analysis and summary.`;

const DETAILED_ANALYSIS_INSTRUCTION = `Before providing your final summary, first analyze the conversation inside <analysis> tags. In your analysis:
1. Identify ALL user requests and their status (completed, in-progress, abandoned)
2. Catalog every file mentioned or modified, noting the type of change
3. List all technical decisions made and their rationale
4. Note any patterns in errors encountered and how they were resolved
5. Track the evolution of the approach (initial plan vs. what actually happened)
6. Identify any implicit context that would be lost without careful preservation
The <analysis> block will be stripped from the summary before it is injected back into the conversation, so be thorough and candid.`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and any work that has been done to address them. This summary will replace the conversation history, so it must be comprehensive enough for the assistant to continue working seamlessly.

${DETAILED_ANALYSIS_INSTRUCTION}

After your analysis, provide your summary using the following structure. Each section is mandatory — if a section has no content, write "None" under it.

## 1. Primary Request and Intent
State the user's original, overarching request or goal. Include any clarifications or refinements they made. Capture the "why" behind the request, not just the "what."

Example:
> The user wants to refactor the authentication module to use JWT tokens instead of session cookies, motivated by the need to support mobile clients that can't easily manage cookies.

## 2. Key Technical Concepts
List specific technologies, frameworks, APIs, algorithms, or architectural patterns that are central to this conversation. Include version numbers where relevant.

Example:
> - React 18 with Server Components
> - PostgreSQL 15 with JSONB columns for flexible schema
> - OpenAPI 3.0 spec for API documentation
> - Circuit breaker pattern for external service calls

## 3. Files and Code Sections
For each file discussed or modified, note:
- **File path** (exact)
- **Status**: created / modified / deleted / reviewed
- **Key changes**: What was done and why
- **Important code patterns**: Any non-obvious implementation details

Example:
> - \`src/auth/jwt.ts\` (created): New JWT token generation and validation module. Uses RS256 algorithm with rotating keys. Exports \`generateToken()\`, \`validateToken()\`, and \`refreshToken()\`.
> - \`src/middleware/auth.ts\` (modified): Replaced session-based auth check with JWT validation. Added token refresh logic in the middleware chain.

## 4. Errors Encountered and Fixes
Document each error, its root cause, and the fix applied. This prevents the assistant from repeating failed approaches.

Example:
> - **TypeError: Cannot read property 'sign' of undefined**: The \`jsonwebtoken\` package wasn't imported correctly. Fixed by changing \`import jwt from 'jsonwebtoken'\` to \`import * as jwt from 'jsonwebtoken'\`.
> - **Build error in tsconfig.json**: The \`moduleResolution\` was set to \`node\` but needed to be \`node16\` for ESM compatibility.

## 5. Problem Solving and Decision History
Chronicle the decision-making process:
- What approaches were considered?
- What was tried and abandoned, and why?
- What trade-offs were accepted?
- What constraints shaped the final approach?

Example:
> - Initially considered using Passport.js for JWT handling, but abandoned it due to unnecessary complexity for our use case.
> - Chose RS256 over HS256 for token signing to allow public key verification without sharing the private key.
> - Decided against storing tokens in localStorage due to XSS concerns; using httpOnly cookies with SameSite=Strict instead.

## 6. All User Messages (Verbatim or Closely Paraphrased)
Reproduce every user message in order. For long messages, preserve the key content while condensing boilerplate. This is critical for maintaining context about the user's evolving needs.

Example:
> 1. "Can you help me set up JWT authentication for my Express app?"
> 2. "I'm using TypeScript and the project is set up with ESM modules"
> 3. "Actually, can we use RS256 instead of HS256? I need to verify tokens in a separate microservice"
> 4. "I'm getting this error when I try to import jsonwebtoken: [error details]"

## 7. Pending Tasks
List any tasks that haven't been completed yet, including:
- Tasks the user explicitly requested but haven't been addressed
- Tasks the assistant identified as necessary but hasn't performed
- Follow-up items mentioned during the conversation

Example:
> - [ ] Add rate limiting to the token refresh endpoint
> - [ ] Write unit tests for the JWT validation module
> - [ ] Update the API documentation to reflect the new auth flow
> - [ ] Set up key rotation schedule

## 8. Current Work
Describe the current state of work in detail:
- What was being actively worked on when the conversation was summarized?
- What is the exact state of that work (e.g., partially complete, awaiting user input)?
- Any important context about the current step

Example:
> Currently implementing the token refresh logic in \`src/auth/refresh.ts\`. The basic structure is in place but the database query to check refresh token validity hasn't been implemented yet. The user confirmed they want refresh tokens stored in a separate PostgreSQL table.

## 9. Optional Next Step
If there's a clear, logical next step that follows from the current work, suggest it briefly. This helps maintain momentum.

Example:
> Next: Complete the refresh token validation query, then add the refresh endpoint to \`src/routes/auth.ts\`.

IMPORTANT: Be specific and detailed. Vague summaries like "discussed authentication" are not helpful. Include actual file paths, function names, error messages, and code patterns. The summary should enable a new assistant to pick up exactly where this conversation left off.`;

/**
 * Build the compact prompt, optionally appending user-supplied custom
 * instructions (e.g. "focus on the database migration work").
 */
export function getCompactPrompt(customInstructions?: string): string {
  const parts = [NO_TOOLS_PREAMBLE, "", BASE_COMPACT_PROMPT];

  if (customInstructions?.trim()) {
    parts.push(
      "",
      `Additional instructions for this summary: ${customInstructions.trim()}`,
    );
  }

  return parts.join("\n");
}

/**
 * Strip the `<analysis>…</analysis>` scratchpad block from the model's
 * output, leaving only the structured summary sections.
 */
export function formatCompactSummary(summary: string): string {
  // Remove <analysis>...</analysis> blocks (the model's scratchpad)
  const stripped = summary.replace(/<analysis>[\s\S]*?<\/analysis>/g, "").trim();
  return stripped;
}

/**
 * Build the user-role message that is injected back into the conversation
 * after compaction, serving as the "compact boundary".
 */
export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUp?: boolean,
): string {
  const parts = [
    "[COMPACT SUMMARY — This replaces the previous conversation history]",
    "",
    summary,
  ];

  if (!suppressFollowUp) {
    parts.push(
      "",
      "Continue working from this summary. Do not repeat completed actions unless new evidence requires it.",
    );
  }

  return parts.join("\n");
}
