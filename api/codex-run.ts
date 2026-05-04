import { Codex } from "@openai/codex-sdk";

type HeaderValue = string | string[] | undefined;

type CodexRunRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

type CodexRunResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  writeHead?(statusCode: number, headers: Record<string, string>): void;
  write?(body: string): void;
  end(body: string): void;
};

type RequestBody = {
  prompt?: unknown;
  threadId?: unknown;
  stream?: unknown;
  moodleContext?: unknown;
};

export default async function handler(
  request: CodexRunRequest,
  response: CodexRunResponse,
): Promise<void> {
  if (process.env.ENABLE_LEGACY_CODEX_RUN !== "1") {
    response.setHeader("content-type", "application/json; charset=utf-8");
    writeJson(response, 404, {
      error:
        "Legacy Codex endpoint is disabled. Use the signed-in Moodle web Codex route.",
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("content-type", "application/json; charset=utf-8");
    writeJson(response, 405, { error: "Use POST to run Codex." });
    return;
  }

  try {
    const body = await readBody(request);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;

    if (!prompt) {
      response.setHeader("content-type", "application/json; charset=utf-8");
      writeJson(response, 400, { error: "Prompt is required." });
      return;
    }

    const thread = createCodexThread(threadId);

    if (body.stream === true && response.write) {
      await writeStreamingResponse(response, thread, prompt, body.moodleContext);
      return;
    }

    response.setHeader("content-type", "application/json; charset=utf-8");
    const result = await thread.run(withMoodleToolsPrompt(prompt, body.moodleContext));

    writeJson(response, 200, {
      threadId: thread.id,
      finalResponse: result.finalResponse,
    });
  } catch (error) {
    response.setHeader("content-type", "application/json; charset=utf-8");
    writeJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Codex failed before returning a result.",
    });
  }
}

function createCodexThread(threadId: string | null) {
  const codex = new Codex({
    env: getChatGptOnlyEnvironment(),
  });
  return threadId
    ? codex.resumeThread(threadId)
    : codex.startThread({
        workingDirectory: process.cwd(),
        skipGitRepoCheck: true,
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
      });
}

async function writeStreamingResponse(
  response: CodexRunResponse,
  thread: ReturnType<Codex["startThread"]>,
  prompt: string,
  moodleContext: unknown,
): Promise<void> {
  const headers = {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-cache, no-transform",
  };

  if (response.writeHead) {
    response.writeHead(200, headers);
  } else {
    Object.entries(headers).forEach(([key, value]) => {
      response.setHeader(key, value);
    });
    response.statusCode = 200;
  }

  const streamed = await thread.runStreamed(withMoodleToolsPrompt(prompt, moodleContext));
  let finalResponse = "";

  for await (const event of streamed.events) {
    if (event.type === "thread.started") {
      response.write?.(
        `${JSON.stringify({ type: "thread", threadId: event.thread_id })}\n`,
      );
    } else if (
      event.type === "item.started" ||
      event.type === "item.updated" ||
      event.type === "item.completed"
    ) {
      const item = event.item;
      if (item.type === "agent_message") {
        finalResponse = item.text;
        response.write?.(
          `${JSON.stringify({ type: "message", text: item.text })}\n`,
        );
      } else if (item.type === "command_execution") {
        response.write?.(
          `${JSON.stringify({
            type: "tool",
            title: compactCommand(item.command),
            status:
              item.status === "completed"
                ? "completed"
                : item.status === "failed"
                  ? "failed"
                  : "running",
          })}\n`,
        );
      }
    }
  }

  response.write?.(
    `${JSON.stringify({
      type: "done",
      threadId: thread.id,
      finalResponse,
    })}\n`,
  );
  response.end("");
}

function withMoodleToolsPrompt(prompt: string, moodleContext: unknown): string {
  return `You are running inside the Moodle Clients app.

Moodle access rules:
- On mobile there is no Moodle CLI. Do not use or mention a local Moodle CLI.
- Moodle data is supplied by the app from the Moodle mobile API running on the device.
- Use the Moodle context below for course and file questions.
- If the user asks for course content that is not in the context, say that the course must be opened or synced in the app first.
- Never print raw Moodle tokens or session files.
- For PDFs, use any loaded file metadata in the context. If PDF text is not present, say that text extraction for that PDF is not loaded yet.

Rules:
- Answer from the context before asking for more data.
- Cite course and file names you used.

Moodle context:
${formatMoodleContext(moodleContext)}

User request:
${prompt}`;
}

function formatMoodleContext(context: unknown): string {
  if (!context || typeof context !== "object") {
    return "No Moodle context is currently loaded.";
  }

  return JSON.stringify(context, null, 2).slice(0, 60000);
}

function compactCommand(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Running tool";
  }
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function getChatGptOnlyEnvironment(): Record<string, string> {
  const nextEnvironment: Record<string, string> = {};

  Object.entries(process.env).forEach(([key, value]) => {
    if (!value || key === "OPENAI_API_KEY" || key === "CODEX_API_KEY") {
      return;
    }

    nextEnvironment[key] = value;
  });

  return nextEnvironment;
}

async function readBody(request: CodexRunRequest): Promise<RequestBody> {
  if (request.body && typeof request.body === "object") {
    return request.body as RequestBody;
  }

  if (typeof request.body === "string") {
    return parseBody(request.body);
  }

  const bodyText = await new Promise<string>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    request.on("data", (chunk) => {
      chunks.push(
        typeof chunk === "string" ? Buffer.from(chunk) : Uint8Array.from(chunk),
      );
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
    });
    request.on("error", reject);
  });

  return parseBody(bodyText);
}

function parseBody(bodyText: string): RequestBody {
  if (!bodyText) {
    return {};
  }

  const parsed = JSON.parse(bodyText) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as RequestBody) : {};
}

function writeJson(
  response: CodexRunResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}
