import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import {
  Agent,
  buildSkillRouteMessages,
  routeSkills,
  type SkillDefinition,
} from "../kernel/index.js";

type MessageRole = "system" | "user" | "assistant" | "hint" | "error" | "tool";

interface MessageItem {
  id: number;
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

  const messageIdRef = useRef(1);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: messageIdRef.current++,
      role: "system",
      text: "Manbo TUI mode. Enter to send, Ctrl+R reset, Ctrl+L clear, /exit to quit.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(0);

  const appendMessage = useCallback((role: MessageRole, text: string): number => {
    const id = messageIdRef.current++;
    setMessages((prev) => [...prev, { id, role, text }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: number, updater: (current: string) => string) => {
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, text: updater(item.text) } : item)));
  }, []);

  const commandHints = useMemo<CommandHintItem[]>(() => {
    const sortedSkillNames = skills.map((skill) => skill.name).sort();
    const skillPair = sortedSkillNames.slice(0, 2);
    const multiSkillExample = skillPair.length >= 2
      ? skillPair.join(",")
      : sortedSkillNames[0] ?? "plan,tools";

    const base: CommandHintItem[] = [
      {
        command: "/exit",
        params: "",
        note: "Exit TUI session",
      },
      {
        command: "/reset",
        params: "",
        note: "Reset conversation history",
      },
      {
        command: "/help",
        params: "",
        note: "Show shortcut help",
      },
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
    if (!trimmed.startsWith("/")) {
      return [];
    }

    const token = trimmed.split(/\s+/, 1)[0] ?? "";
    const normalized = token.toLowerCase();
    return commandHints
      .filter((candidate) => candidate.command.startsWith(normalized))
      .map((item) => item.command);
  }, [commandHints, inputValue]);

  const hasCompletion = completionItems.length > 0;
  const maxVisibleCompletions = 8;

  const completionWindowStart = hasCompletion
    ? Math.max(
        0,
        Math.min(
          completionIndex - Math.floor(maxVisibleCompletions / 2),
          completionItems.length - maxVisibleCompletions,
        ),
      )
    : 0;

  const visibleCompletionItems = hasCompletion
    ? completionItems.slice(completionWindowStart, completionWindowStart + maxVisibleCompletions)
    : [];

  const completionWindowEnd = completionWindowStart + visibleCompletionItems.length;

  const selectedCompletion = hasCompletion
    ? completionItems[Math.min(completionIndex, completionItems.length - 1)]
    : undefined;

  const selectedHint = selectedCompletion
    ? commandHintMap.get(selectedCompletion)
    : undefined;

  const applySelectedCompletion = useCallback(() => {
    if (!hasCompletion) {
      return;
    }

    const selected = completionItems[Math.min(completionIndex, completionItems.length - 1)];
    const trimmed = inputValue.trimStart();
    const firstToken = trimmed.split(/\s+/, 1)[0] ?? "";
    const rest = trimmed.slice(firstToken.length).trimStart();
    setInputValue(rest ? `${selected} ${rest}` : `${selected} `);
  }, [completionIndex, completionItems, hasCompletion, inputValue]);

  const handleExit = useCallback(async () => {
    await props.requestExit();
    exit();
  }, [exit, props]);

  const runUserMessage = useCallback(
    async (rawInput: string) => {
      const userInput = rawInput.trim();
      if (!userInput || isRunning) {
        return;
      }

      if (userInput === "/exit") {
        await handleExit();
        return;
      }

      if (userInput === "/reset") {
        agent.reset();
        appendMessage("system", "Conversation reset.");
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

      const routeResult = routeSkills({
        message: userInput,
        skills,
      });

      if (routeResult.usageHint && !routeResult.content) {
        appendMessage("hint", routeResult.usageHint);
        setIsRunning(false);
        return;
      }

      agent.setEventHandlers({
        onToolCallStart: (payload) => {
          appendMessage(
            "tool",
            `Tool calling: ${payload.name} args=${summarizeValue(payload.args)}`,
          );
        },
        onToolCallSuccess: (payload) => {
          appendMessage(
            "tool",
            `Tool done: ${payload.name} result=${summarizeText(payload.result)}`,
          );
        },
        onToolCallError: (payload) => {
          appendMessage(
            "tool",
            `Tool error: ${payload.name} error=${summarizeText(payload.error)}`,
          );
        },
      });

      try {
        let assistantId: number | undefined;
        let streamedChunkCount = 0;

        for await (const chunk of agent.chat(routeResult.content || userInput, undefined, {
          turnMessages: buildSkillRouteMessages(routeResult.activeSkills),
        })) {
          streamedChunkCount += 1;
          if (assistantId === undefined) {
            assistantId = appendMessage("assistant", chunk);
            continue;
          }

          updateMessage(assistantId, (current) => current + chunk);
        }

        if (assistantId === undefined && streamedChunkCount === 0) {
          appendMessage("assistant", "(no response)");
        }
      } catch (error) {
        appendMessage("error", `Request failed: ${String(error)}`);
      } finally {
        setIsRunning(false);
      }
    },
    [
      agent,
      appendMessage,
      handleExit,
      isRunning,
      skills,
      updateMessage,
    ],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      void handleExit();
      return;
    }

    if (key.ctrl && input === "r") {
      agent.reset();
      appendMessage("system", "Conversation reset.");
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

    if (key.return) {
      const submit = inputValue;
      setInputValue("");
      setCompletionIndex(0);
      void runUserMessage(submit);
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
      setCompletionIndex(0);
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setInputValue((prev) => prev + input);
      setCompletionIndex(0);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      {messages.slice(-28).map((item) => (
        <Text key={item.id} color={colorForRole(item.role)}>
          {labelForRole(item.role)} {item.text || "..."}
        </Text>
      ))}

      <Box flexDirection="column">
        <Text color="gray">Last prompt: {lastPrompt || "(none yet)"}</Text>
        <Text>
          {isRunning ? "[running]" : "[idle]"} You: {inputValue}
        </Text>
        {hasCompletion ? (
          <Box flexDirection="column">
            <Text color="gray">
              Completions (Tab to apply) {completionWindowStart + 1}-{completionWindowEnd}/{completionItems.length}:
            </Text>
            {visibleCompletionItems.map((item, index) => {
              const absoluteIndex = completionWindowStart + index;
              return (
                <Text key={`${item}-${absoluteIndex}`} color={absoluteIndex === completionIndex ? "green" : "gray"}>
                {absoluteIndex === completionIndex ? ">" : " "} {item}
                {commandHintMap.get(item)?.params ? ` ${commandHintMap.get(item)?.params}` : ""}
              </Text>
              );
            })}
            {selectedHint ? (
              <Text color="gray">
                Params: {selectedHint.command}
                {selectedHint.params ? ` ${selectedHint.params}` : " (no args)"}
                {` | ${selectedHint.note}`}
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
