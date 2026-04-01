export interface ToolExecutionResult {
  content: string;
  compactContext?: {
    summary: string;
  };
}

export type ToolExecutionOutput = string | ToolExecutionResult;

export function normalizeToolExecutionOutput(
  output: ToolExecutionOutput,
): ToolExecutionResult {
  if (typeof output === "string") {
    return { content: output };
  }

  return output;
}
