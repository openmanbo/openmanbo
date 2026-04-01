/**
 * Auto-compact system: monitors token usage and triggers compression
 * when context approaches limits. Includes circuit breaker to prevent
 * runaway compact loops.
 */

/** Buffer of tokens reserved to ensure the model can still produce output. */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

/** When remaining tokens drop below this, we show a warning. */
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000;

export interface AutoCompactConfig {
  /** Total context window size in tokens. */
  contextWindowSize: number;
  /** Maximum output tokens the model can produce (default 20,000). */
  maxOutputTokens?: number;
  /** Whether auto-compact is enabled (default true). */
  enabled?: boolean;
}

export interface TokenWarningState {
  /** Percentage of the context window remaining. */
  percentLeft: number;
  /** True when remaining context is below the warning threshold. */
  isAboveWarningThreshold: boolean;
  /** True when remaining context is below the auto-compact threshold. */
  isAboveAutoCompactThreshold: boolean;
  /** True when there is essentially no room left for output. */
  isAtBlockingLimit: boolean;
}

/**
 * The effective context window is the total window minus the space reserved
 * for the model's output.
 */
export function getEffectiveContextWindowSize(
  config: AutoCompactConfig,
): number {
  const maxOutput = config.maxOutputTokens ?? 20_000;
  return config.contextWindowSize - maxOutput;
}

/**
 * The token usage level above which auto-compact should trigger.
 * This is: effectiveWindow − autocompactBuffer.
 */
export function getAutoCompactThreshold(config: AutoCompactConfig): number {
  const effective = getEffectiveContextWindowSize(config);
  return Math.max(0, effective - AUTOCOMPACT_BUFFER_TOKENS);
}

/**
 * Calculate the current token warning state given a token usage count.
 */
export function calculateTokenWarningState(
  tokenUsage: number,
  config: AutoCompactConfig,
): TokenWarningState {
  const effective = getEffectiveContextWindowSize(config);
  const remaining = Math.max(0, effective - tokenUsage);
  const percentLeft = effective > 0 ? (remaining / effective) * 100 : 0;

  return {
    percentLeft,
    isAboveWarningThreshold: remaining < WARNING_THRESHOLD_BUFFER_TOKENS,
    isAboveAutoCompactThreshold: remaining < AUTOCOMPACT_BUFFER_TOKENS,
    isAtBlockingLimit: remaining <= 0,
  };
}

/**
 * Returns true when the current token usage exceeds the auto-compact
 * threshold and auto-compact is enabled.
 */
export function shouldAutoCompact(
  tokenUsage: number,
  config: AutoCompactConfig,
): boolean {
  if (config.enabled === false) return false;
  return tokenUsage >= getAutoCompactThreshold(config);
}

/* ────────────────────────────────────────────────────────────────────
 * Circuit breaker / tracking state
 * ──────────────────────────────────────────────────────────────────── */

export interface AutoCompactTrackingState {
  /** Whether a compact has occurred in this session. */
  compacted: boolean;
  /** Number of agent turns since the last compact (or start). */
  turnCounter: number;
  /** Consecutive auto-compact failures (triggers circuit breaker). */
  consecutiveFailures: number;
}

/** After this many consecutive failures, auto-compact is disabled. */
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;

/**
 * Create the initial tracking state.
 */
export function createAutoCompactTrackingState(): AutoCompactTrackingState {
  return {
    compacted: false,
    turnCounter: 0,
    consecutiveFailures: 0,
  };
}

/**
 * Check whether the circuit breaker has tripped (too many failures).
 */
export function isCircuitBreakerTripped(
  state: AutoCompactTrackingState,
): boolean {
  return state.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES;
}
