import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_DATA_DIR_NAME = ".openmanbo";

/**
 * Resolve the path to the .openmanbo storage directory.
 * Priority: explicit argument > OPENMANBO_DATA_DIR env var > <cwd>/.openmanbo
 */
export function resolveDataDir(dataDir?: string): string {
  return (
    dataDir ??
    process.env.OPENMANBO_DATA_DIR ??
    path.join(process.cwd(), DEFAULT_DATA_DIR_NAME)
  );
}

/**
 * Read IDENTITY.md from the .openmanbo storage directory.
 * Returns the trimmed file content if the file exists, or undefined otherwise.
 */
export async function readIdentity(
  dataDir: string,
): Promise<string | undefined> {
  const identityPath = path.join(dataDir, "IDENTITY.md");
  try {
    const content = await fs.readFile(identityPath, "utf-8");
    return content.trim() || undefined;
  } catch {
    return undefined;
  }
}
