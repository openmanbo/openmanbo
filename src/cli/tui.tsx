import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  Agent,
  buildSkillRouteMessages,
  routeSkills,
  type SkillDefinition,
} from "../kernel/index.js";

const HISTORY_LIMIT = 2000;
const BATCH_CHAR_THRESHOLD = 50;
const BATCH_TIME_THRESHOLD_MS = 50;
const SCROLL_STEP_LINES = 3;

const BASE_FOOTER_LINES = 3; // last prompt + status + input
const MAX_COMPLETION_LINES = 8;

type MessageRole = "system" | "user" | "assistant" | "hint" | "error" | "tool";

interface MessageItem {
  id: number;
  role: MessageRole;
  text: string;
}

interface RenderLine {
  key: string;
  role: MessageRole;
  text: string;
}

export interface TuiSessionOptions {
  agent: Agent;
  skills: SkillDefinition[];
  onExit?: () => Promise<void> | void;
}

interface TuiAppProps extends TuiSessionOptions {
  requestExit: () => Promise<void>;
}

interface CommandHintItem {
  command: string;
  params: string;
  note: string;
}

function charDisplayWidth(char: string): number {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 0;

  if (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x300 && codePoint <= 0x36f)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  ) {
    return 2;
  }

  return 1;
}

function stringDisplayWidth(input: string): number {
  let width = 0;
  for (const char of Array.from(input)) {
    width += charDisplayWidth(char);
  }
  return width;
}

function truncateToWidth(input: string, width: number): string {
  const safeWidth = Math.max(8, width);
  if (stringDisplayWidth(input) <= safeWidth) return input;

  let out = "";
  let used = 0;
  const chars = Array.from(input);
  for (const char of chars) {
    const w = charDisplayWidth(char);
    if (used + w > safeWidth - 1) break;
    out += char;
    used += w;
  }
  return `${out}…`;
}

function wrapLineByWidth(line: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  if (line.length === 0) return [""];

  const parts: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of Array.from(line)) {
    const w = charDisplayWidth(char);
    if (currentWidth + w > safeWidth && current.length > 0) {
      parts.push(current);
      current = char;
      currentWidth = w;
    } else {
      current += char;
      currentWidth += w;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [""];
}

function messageToRenderLines(item: MessageItem, width: number): RenderLine[] {
  const prefix = `${labelForRole(item.role)} `;
  const prefixWidth = stringDisplayWidth(prefix);
  const contentWidth = Math.max(8, width - prefixWidth);
  const continuationPrefix = " ".repeat(Math.max(0, prefix.length));

  const logicalLines = (item.text || "...").split(/\r?\n/);
  const wrappedContent: string[] = [];
  for (const logical of logicalLines) {
    wrappedContent.push(...wrapLineByWidth(logical, contentWidth));
  }

  return wrappedContent.map((line, idx) => ({
    key: `${item.id}-${idx}`,
    role: item.role,
    text: `${idx === 0 ? prefix : continuationPrefix}${line}`,
  }));
}

function sanitizeTextInput(value: string): string {
  return value
    // SGR mouse: ESC [ < b ; x ; y M/m
    .replace(/\u001b\[<\d+;\d+;\d+[mM]/g, "")
    // Fragments that can appear when ESC is split by input handling.
    .replace(/\[<\d+;\d+;\d+[mM]/g, "")
    .replace(/<\d+;\d+;\d+[mM]/g, "")
    // X10 mouse fallback: ESC [ M Cb Cx Cy (strip safely)
    .replace(/\u001b\[M.../g, "")
    // OSC / DCS / CSI terminal controls
    .replace(/\u001b\].*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b./g, "")
    // Any remaining control chars except TAB
    .replace(/[\x00-\x08\x0A-\x1F\x7F]/g, "");
}

function parseMouseWheelDirection(input: string): 1 | -1 | 0 {
  const normalized = input.replace(/\r|\n/g, "");

  // Full SGR mouse sequence: ESC [ < Cb ; Cx ; Cy M/m
  const full = normalized.match(/\u001b\[<(\d+);\d+;\d+[mM]/);
  if (full) {
    const code = Number(full[1]);
    if (code === 64 || code === 96) return 1;
    if (code === 65 || code === 97) return -1;
  }

  // Fragmented sequence fallback (some terminals split ESC and body)
  const fragmented = normalized.match(/(?:\[<|<)(\d+);\d+;\d+[mM]/);
  if (fragmented) {
    const code = Number(fragmented[1]);
    if (code === 64 || code === 96) return 1;
    if (code === 65 || code === 97) return -1;
  }

  return 0;
}

export async function runTuiSession(options: TuiSessionOptions): Promise<void> {
  const app = render(
    <TuiApp
      agent={options.agent}
      skills={options.skills}
      onExit={options.onExit}
      requestExit={async () => {
        await options.onExit?.();
      }}
    />,
    { exitOnCtrlC: false },
  );

  await app.waitUntilExit();
}

function TuiApp(props: TuiAppProps): JSX.Element {
  const { exit } = useApp();
  const { agent, skills } = props;

  const [terminalSize, setTerminalSize] = useState(() => ({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  }));

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    };

    handleResize();
    process.on("SIGWINCH", handleResize);
    return () => {
      process.off("SIGWINCH", handleResize);
    };
  }, []);

  useEffect(() => {
    process.stdout.write("\u001b[?1049h\u001b[?1000h\u001b[?1002h\u001b[?1006h\u001b[?25l");
    return () => {
      process.stdout.write("\u001b[?25h\u001b[?1006l\u001b[?1002l\u001b[?1000l\u001b[?1049l");
    };
  }, []);

  const messageIdRef = useRef(1);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: messageIdRef.current++,
      role: "system",
      text: "Manbo TUI mode. Enter to send, Ctrl+R reset, Ctrl+L clear, /exit to quit.",
    },
  ]);

  const batchBufferRef = useRef<Map<number, string>>(new Map());
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [inputValue, setInputValue] = useState("");
  const [inputInstanceKey, setInputInstanceKey] = useState(0);
  const [lastPrompt, setLastPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [scrollOffsetLines, setScrollOffsetLines] = useState(0);

  const appendMessage = useCallback((role: MessageRole, text: string): number => {
    const id = messageIdRef.current++;

    setMessages((prev) => {
      let updated = [...prev, { id, role, text }];
      if (updated.length > HISTORY_LIMIT) {
        updated = updated.slice(updated.length - HISTORY_LIMIT);
      }
      return updated;
    });

    return id;
  }, []);

  const updateMessage = useCallback((id: number, updater: (current: string) => string) => {
    setMessages((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newText = updater(item.text);
        return newText === item.text ? item : { ...item, text: newText };
      }),
    );
  }, []);

  const commandHints = useMemo<CommandHintItem[]>(() => {
    const sortedSkillNames = skills.map((skill) => skill.name).sort();
    const skillPair = sortedSkillNames.slice(0, 2);
    const multiSkillExample = skillPair.length >= 2
      ? skillPair.join(",")
      : sortedSkillNames[0] ?? "plan,tools";

    const base: CommandHintItem[] = [
      { command: "/exit", params: "", note: "Exit TUI session" },
      { command: "/reset", params: "", note: "Reset conversation history" },
      { command: "/help", params: "", note: "Show shortcut help" },
      {
        command: "/skills",
        params: `<skill1,skill2> <request> (e.g. /skills ${multiSkillExample} summarize this)`,
        note: "Run with specific skills",
      },
    ];

    const skillCommands: CommandHintItem[] = sortedSkillNames.map((name) => ({
      command: `/${name}`,
      params: "<request>",
      note: `Run request with ${name}`,
    }));

    return [...base, ...skillCommands];
  }, [skills]);

  const commandHintMap = useMemo(
    () => new Map(commandHints.map((item) => [item.command, item])),
    [commandHints],
  );

  const completionItems = useMemo(() => {
    const trimmed = inputValue.trimStart();
    if (!trimmed.startsWith("/")) return [];

    const token = trimmed.split(/\s+/, 1)[0] ?? "";
    const normalized = token.toLowerCase();
    return commandHints
      .filter((candidate) => candidate.command.startsWith(normalized))
      .map((item) => item.command);
  }, [commandHints, inputValue]);

  const hasCompletion = completionItems.length > 0;

  const completionWindowStart = hasCompletion
    ? Math.max(
        0,
        Math.min(
          completionIndex - Math.floor(MAX_COMPLETION_LINES / 2),
          completionItems.length - MAX_COMPLETION_LINES,
        ),
      )
    : 0;

  const visibleCompletionItems = hasCompletion
    ? completionItems.slice(completionWindowStart, completionWindowStart + MAX_COMPLETION_LINES)
    : [];

  const completionWindowEnd = completionWindowStart + visibleCompletionItems.length;

  const selectedCompletion = hasCompletion
    ? completionItems[Math.min(completionIndex, completionItems.length - 1)]
    : undefined;

  const selectedHint = selectedCompletion
    ? commandHintMap.get(selectedCompletion)
    : undefined;

  const applySelectedCompletion = useCallback(() => {
    if (!hasCompletion) return;

    const selected = completionItems[Math.min(completionIndex, completionItems.length - 1)];
    const trimmed = inputValue.trimStart();
    const firstToken = trimmed.split(/\s+/, 1)[0] ?? "";
    const rest = trimmed.slice(firstToken.length).trimStart();
    setInputValue(rest ? `${selected} ${rest}` : `${selected} `);
    setInputInstanceKey((prev) => prev + 1);
  }, [completionIndex, completionItems, hasCompletion, inputValue]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(sanitizeTextInput(value));
    setCompletionIndex(0);
  }, []);

  useEffect(() => {
    const cleaned = sanitizeTextInput(inputValue);
    if (cleaned !== inputValue) {
      setInputValue(cleaned);
    }
  }, [inputValue]);

  const handleExit = useCallback(async () => {
    await props.requestExit();
    exit();
  }, [exit, props]);

  const completionBlockLines = hasCompletion
    ? 1 + visibleCompletionItems.length + (selectedHint ? 1 : 0)
    : 0;

  const footerLines = BASE_FOOTER_LINES + completionBlockLines;
  const messageViewportLines = Math.max(1, terminalSize.rows - footerLines);
  const textWidth = Math.max(20, terminalSize.columns - 2);

  const allRenderLines = useMemo(() => {
    const lines: RenderLine[] = [];
    for (const item of messages) {
      lines.push(...messageToRenderLines(item, textWidth));
    }
    return lines;
  }, [messages, textWidth]);

  const totalLines = allRenderLines.length;
  const maxScrollOffsetLines = Math.max(0, totalLines - messageViewportLines);

  useEffect(() => {
    setScrollOffsetLines((prev) => Math.min(prev, maxScrollOffsetLines));
  }, [maxScrollOffsetLines]);

  const runUserMessage = useCallback(
    async (rawInput: string) => {
      const userInput = rawInput.trim();
      if (!userInput || isRunning) return;

      if (userInput === "/exit") {
        await handleExit();
        return;
      }

      if (userInput === "/reset") {
        agent.reset();
        appendMessage("system", "Conversation reset.");
        setScrollOffsetLines(0);
        return;
      }

      if (userInput === "/help") {
        appendMessage(
          "hint",
          [
            "Shortcuts:",
            "- Enter: send",
            "- Ctrl+R: reset conversation",
            "- Ctrl+L: clear screen",
            "- Mouse wheel / PgUp / PgDn: scroll history",
            "- Tab: apply current command completion",
            "- Up/Down: select completion",
            "- /exit: quit",
          ].join("\n"),
        );
        return;
      }

      setIsRunning(true);
      appendMessage("user", userInput);
      setLastPrompt(userInput);
      setScrollOffsetLines(0);

      const routeResult = routeSkills({ message: userInput, skills });

      if (routeResult.usageHint && !routeResult.content) {
        appendMessage("hint", routeResult.usageHint);
        setIsRunning(false);
        return;
      }

      try {
        let assistantId: number | undefined;
        let streamedChunkCount = 0;

        const startNewAssistantSegment = () => {
          assistantId = undefined;
        };

        const flushBatch = (msgId: number) => {
          const buffered = batchBufferRef.current.get(msgId);
          if (buffered && buffered.length > 0) {
            updateMessage(msgId, (current) => current + buffered);
            batchBufferRef.current.delete(msgId);
          }
        };

        agent.setEventHandlers({
          onToolCallStart: (payload) => {
            startNewAssistantSegment();
            appendMessage("tool", `Tool calling: ${payload.name} args=${summarizeValue(payload.args)}`);
          },
          onToolCallSuccess: (payload) => {
            startNewAssistantSegment();
            appendMessage("tool", `Tool done: ${payload.name} result=${summarizeText(payload.result)}`);
          },
          onToolCallError: (payload) => {
            startNewAssistantSegment();
            appendMessage("tool", `Tool error: ${payload.name} error=${summarizeText(payload.error)}`);
          },
        });

        for await (const chunk of agent.chat(routeResult.content || userInput, undefined, {
          turnMessages: buildSkillRouteMessages(routeResult.activeSkills),
        })) {
          streamedChunkCount += 1;
          if (assistantId === undefined) {
            assistantId = appendMessage("assistant", chunk);
            continue;
          }

          const currentBuffer = batchBufferRef.current.get(assistantId) || "";
          const newBuffer = currentBuffer + chunk;
          batchBufferRef.current.set(assistantId, newBuffer);

          if (newBuffer.length >= BATCH_CHAR_THRESHOLD) {
            flushBatch(assistantId);
            if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
          } else if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(() => {
              flushBatch(assistantId!);
              batchTimerRef.current = null;
            }, BATCH_TIME_THRESHOLD_MS);
          }
        }

        if (assistantId !== undefined) {
          flushBatch(assistantId);
        }

        if (batchTimerRef.current) {
          clearTimeout(batchTimerRef.current);
          batchTimerRef.current = null;
        }

        if (assistantId === undefined && streamedChunkCount === 0) {
          appendMessage("assistant", "(no response)");
        }
      } catch (error) {
        appendMessage("error", `Request failed: ${String(error)}`);
      } finally {
        agent.setEventHandlers(undefined);
        setIsRunning(false);
      }
    },
    [agent, appendMessage, handleExit, isRunning, skills, updateMessage],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      void handleExit();
      return;
    }

    if (key.ctrl && input === "l") {
      setMessages([
        {
          id: messageIdRef.current++,
          role: "system",
          text: "Screen cleared.",
        },
      ]);
      setInputValue("");
      setScrollOffsetLines(0);
      return;
    }

    const scrollBy = (delta: number) => {
      setScrollOffsetLines((prev) => {
        const next = prev + delta;
        return Math.max(0, Math.min(next, maxScrollOffsetLines));
      });
    };

    // Mouse wheel always controls message list scrolling.
    const wheel = parseMouseWheelDirection(input);
    if (wheel !== 0) {
      scrollBy(wheel * SCROLL_STEP_LINES);
      return;
    }

    if (!hasCompletion && key.upArrow) {
      scrollBy(SCROLL_STEP_LINES);
      return;
    }

    if (!hasCompletion && key.downArrow) {
      scrollBy(-SCROLL_STEP_LINES);
      return;
    }

    if (!hasCompletion && key.pageUp) {
      scrollBy(Math.max(1, Math.floor(messageViewportLines * 0.8)));
      return;
    }

    if (!hasCompletion && key.pageDown) {
      scrollBy(-Math.max(1, Math.floor(messageViewportLines * 0.8)));
      return;
    }

    if (key.upArrow && hasCompletion) {
      setCompletionIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow && hasCompletion) {
      setCompletionIndex((prev) => Math.min(completionItems.length - 1, prev + 1));
      return;
    }

    if (key.tab) {
      applySelectedCompletion();
      return;
    }

    if (
      hasCompletion &&
      !key.backspace &&
      !key.delete &&
      ((key.ctrl && input === "h") || input === "\u007f")
    ) {
      setInputValue((prev) => prev.slice(0, -1));
      setCompletionIndex(0);
      return;
    }
  });

  const clampedOffset = Math.max(0, Math.min(scrollOffsetLines, maxScrollOffsetLines));
  const viewEndLine = Math.max(0, totalLines - clampedOffset);
  const viewStartLine = Math.max(0, viewEndLine - messageViewportLines);
  const visibleLines = allRenderLines.slice(viewStartLine, viewEndLine);

  return (
    <Box flexDirection="column" width={terminalSize.columns} height={terminalSize.rows}>
      <Box flexDirection="column" height={messageViewportLines}>
        {visibleLines.map((line) => (
          <Text key={line.key} color={colorForRole(line.role)}>
            {line.text}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" height={footerLines}>
        <Text color="gray">{truncateToWidth(`Last prompt: ${lastPrompt || "(none yet)"}`, textWidth)}</Text>
        <Text>{isRunning ? "[running]" : "[idle]"}</Text>
        <Box>
          <Text>You: </Text>
          <TextInput
            key={inputInstanceKey}
            value={inputValue}
            onChange={handleInputChange}
            onSubmit={(value) => {
              setInputValue("");
              setCompletionIndex(0);
              setScrollOffsetLines(0);
              void runUserMessage(value);
            }}
          />
        </Box>

        {hasCompletion ? (
          <Box flexDirection="column">
            <Text color="gray">
              {truncateToWidth(
                `Completions (Tab to apply) ${completionWindowStart + 1}-${completionWindowEnd}/${completionItems.length}:`,
                textWidth,
              )}
            </Text>
            {visibleCompletionItems.map((item, index) => {
              const absoluteIndex = completionWindowStart + index;
              const suffix = commandHintMap.get(item)?.params ? ` ${commandHintMap.get(item)?.params}` : "";
              const row = `${absoluteIndex === completionIndex ? ">" : " "} ${item}${suffix}`;
              return (
                <Text key={`${item}-${absoluteIndex}`} color={absoluteIndex === completionIndex ? "green" : "gray"}>
                  {truncateToWidth(row, textWidth)}
                </Text>
              );
            })}
            {selectedHint ? (
              <Text color="gray">
                {truncateToWidth(
                  `Params: ${selectedHint.command}${selectedHint.params ? ` ${selectedHint.params}` : " (no args)"} | ${selectedHint.note}`,
                  textWidth,
                )}
              </Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function summarizeText(value: string): string {
  const lines = value.split(/\r?\n/);
  const first = lines.find((line) => line.trim().length > 0) ?? "";
  if (first.length <= 140) {
    return first;
  }
  return `${first.slice(0, 137)}...`;
}

function summarizeValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return "{}";
    return serialized.length <= 140 ? serialized : `${serialized.slice(0, 137)}...`;
  } catch {
    return "<non-serializable>";
  }
}

function labelForRole(role: MessageRole): string {
  if (role === "user") return "You:";
  if (role === "assistant") return "Manbo:";
  if (role === "system") return "System:";
  if (role === "hint") return "Hint:";
  if (role === "tool") return "Tool:";
  return "Error:";
}

function colorForRole(role: MessageRole): "white" | "cyan" | "gray" | "yellow" | "red" {
  if (role === "assistant") return "cyan";
  if (role === "system") return "gray";
  if (role === "tool") return "yellow";
  if (role === "hint") return "yellow";
  if (role === "error") return "red";
  return "white";
}
