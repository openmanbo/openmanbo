import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  isHttpConfig,
  isStdioConfig,
  type BuiltinExecToolConfig,
  type McpConfig,
  type McpServerConfig,
} from "../mcp/types.js";
import type { SkillDefinition } from "../kernel/prompt.js";

const DEFAULT_DATA_DIR_NAME = ".openmanbo";
const MCP_TEMPLATE_PATTERN = /\$\{([^}]+)\}/g;

interface McpTemplateContext {
  dataDir: string;
  workspaceDir: string;
  homeDir: string;
  cwd: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

const SKILL_FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Resolve the path to the .openmanbo storage directory.
 * Priority: explicit argument > OPENMANBO_DATA_DIR env var > <cwd>/.openmanbo
 */
export function resolveDataDir(dataDir?: string): string {
  return path.resolve(
    dataDir ??
    process.env.OPENMANBO_DATA_DIR ??
    path.join(process.cwd(), DEFAULT_DATA_DIR_NAME),
  );
}

function normalizeMcpConfig(
  config: McpConfig,
  dataDir: string,
): McpConfig {
  const templateContext = createMcpTemplateContext(dataDir);
  const expandedConfig = expandTemplateValue(config, templateContext);
  const cwd = templateContext.workspaceDir;
  const mcpServers = Object.fromEntries(
    Object.entries(expandedConfig.mcpServers ?? {}).map(([name, serverCfg]) => [
      name,
      normalizeMcpServerConfig(serverCfg, cwd),
    ]),
  );
  const builtinTools = normalizeBuiltinToolsConfig(
    expandedConfig.builtinTools,
    cwd,
  );

  return { ...expandedConfig, mcpServers, builtinTools };
}

function createMcpTemplateContext(dataDir: string): McpTemplateContext {
  return {
    dataDir,
    workspaceDir: path.dirname(dataDir),
    homeDir: os.homedir(),
    cwd: process.cwd(),
  };
}

function expandTemplateValue<T>(value: T, context: McpTemplateContext): T {
  if (typeof value === "string") {
    return expandTemplateString(value, context) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandTemplateValue(item, context)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        expandTemplateValue(nestedValue, context),
      ]),
    ) as T;
  }

  return value;
}

function expandTemplateString(
  value: string,
  context: McpTemplateContext,
): string {
  return value.replace(MCP_TEMPLATE_PATTERN, (match, variableName) => {
    const resolved = resolveTemplateVariable(variableName.trim(), context);
    return resolved ?? match;
  });
}

function resolveTemplateVariable(
  variableName: string,
  context: McpTemplateContext,
): string | undefined {
  if (variableName === "dataDir") {
    return context.dataDir;
  }

  if (variableName === "workspaceDir") {
    return context.workspaceDir;
  }

  if (variableName === "homeDir") {
    return context.homeDir;
  }

  if (variableName === "cwd") {
    return context.cwd;
  }

  if (variableName.startsWith("env:")) {
    return process.env[variableName.slice(4)];
  }

  return process.env[variableName];
}

function normalizeMcpServerConfig(
  serverCfg: McpServerConfig,
  cwd: string,
): McpServerConfig {
  if (isStdioConfig(serverCfg)) {
    return {
      ...serverCfg,
      cwd: resolveMcpCwd(serverCfg.cwd, cwd),
    };
  }

  if (isHttpConfig(serverCfg)) {
    return serverCfg;
  }

  return serverCfg;
}

function normalizeBuiltinToolsConfig(
  builtinTools: McpConfig["builtinTools"],
  cwd: string,
): McpConfig["builtinTools"] {
  if (!builtinTools) {
    return undefined;
  }

  return {
    ...builtinTools,
    exec: builtinTools.exec
      ? normalizeBuiltinExecToolConfig(builtinTools.exec, cwd)
      : undefined,
  };
}

function normalizeBuiltinExecToolConfig(
  config: BuiltinExecToolConfig,
  cwd: string,
): BuiltinExecToolConfig {
  return {
    ...config,
    cwd: resolveMcpCwd(config.cwd, cwd),
    shell:
      typeof config.shell === "string"
        ? resolveMcpCwd(config.shell, cwd)
        : config.shell,
  };
}

function resolveMcpCwd(configuredCwd: string | undefined, fallbackCwd: string): string {
  if (!configuredCwd) {
    return fallbackCwd;
  }

  return path.isAbsolute(configuredCwd)
    ? configuredCwd
    : path.resolve(fallbackCwd, configuredCwd);
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

/**
 * Read skill documents from the .openmanbo/skills directory.
 * Returns all non-empty markdown files in lexical order.
 */
export async function readSkills(dataDir: string): Promise<SkillDefinition[]> {
  const skillsDir = path.join(dataDir, "skills");

  try {
    const skillPaths = await collectSkillFiles(skillsDir, skillsDir);
    const skills: Array<SkillDefinition | undefined> = await Promise.all(
      skillPaths.map(async (skillPath) => {
        const rawContent = await fs.readFile(skillPath, "utf-8");
        const parsedSkill = parseSkillFile(rawContent);
        if (!parsedSkill.content) {
          return undefined;
        }

        const relativePath = path.relative(skillsDir, skillPath).replace(/\\/g, "/");
        return {
          name: parsedSkill.frontmatter.name?.trim() || inferSkillName(relativePath, parsedSkill.content),
          description: parsedSkill.frontmatter.description?.trim() || undefined,
          content: parsedSkill.content,
          source: `skills/${relativePath}`,
        } satisfies SkillDefinition;
      }),
    );

    return skills.filter((skill): skill is SkillDefinition => skill !== undefined);
  } catch {
    return [];
  }
}

async function collectSkillFiles(
  directory: string,
  rootDirectory: string,
): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return collectSkillFiles(fullPath, rootDirectory);
        }

        if (!entry.isFile() || !isSkillFile(entry.name)) {
          return [];
        }

        return [fullPath];
      }),
  );

  return files.flat().sort((left, right) => {
    const leftRelative = path.relative(rootDirectory, left);
    const rightRelative = path.relative(rootDirectory, right);
    return leftRelative.localeCompare(rightRelative);
  });
}

function isSkillFile(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

function parseSkillFile(rawContent: string): {
  frontmatter: SkillFrontmatter;
  content: string;
} {
  const match = rawContent.match(SKILL_FRONTMATTER_PATTERN);
  if (!match) {
    return {
      frontmatter: {},
      content: rawContent.trim(),
    };
  }

  return {
    frontmatter: parseSkillFrontmatter(match[1]),
    content: rawContent.slice(match[0].length).trim(),
  };
}

function parseSkillFrontmatter(frontmatterBlock: string): SkillFrontmatter {
  const metadata: SkillFrontmatter = {};
  const lines = frontmatterBlock.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const fieldMatch = trimmedLine.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!fieldMatch) {
      continue;
    }

    const [, rawKey, rawValue] = fieldMatch;
    const key = normalizeSkillFrontmatterKey(rawKey);
    if (!key) {
      continue;
    }

    metadata[key] = stripYamlQuotes(rawValue.trim());
  }

  return metadata;
}

function normalizeSkillFrontmatterKey(
  key: string,
): keyof SkillFrontmatter | undefined {
  const normalized = key.toLowerCase();
  if (normalized === "name") {
    return "name";
  }
  if (normalized === "description") {
    return "description";
  }

  return undefined;
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeSkillList(values: string[] | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

function inferSkillName(relativePath: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  return relativePath
    .replace(/\.(md|markdown)$/i, "")
    .split("/")
    .map((part) => part.replace(/[-_]+/g, " "))
    .join(" / ");
}

/**
 * Read `mcp.json` from the .openmanbo storage directory.
 * Returns the parsed config if the file exists, or undefined otherwise.
 */
export async function readMcpConfig(
  dataDir: string,
): Promise<McpConfig | undefined> {
  const mcpPath = path.join(dataDir, "mcp.json");
  try {
    const content = await fs.readFile(mcpPath, "utf-8");
    return normalizeMcpConfig(JSON.parse(content) as McpConfig, dataDir);
  } catch {
    return undefined;
  }
}
