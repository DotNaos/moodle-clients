import { describe, expect, test } from "bun:test";

import type { CodexStreamEvent } from "@/lib/codex-actions";
import {
  parseCodexStreamBuffer,
  readCodexStream,
  runCodexStream,
} from "@/lib/codex-stream-client";

describe("codex-stream-client", () => {
  test("reads split NDJSON chunks incrementally", async () => {
    const events: CodexStreamEvent[] = [];
    const response = new Response(
      streamFromChunks([
        `{"type":"thread","threadId":"thread-1"}\n{"type":"message","text":"Hal`,
        `lo"}\n{"type":"done","threadId":"thread-1","finalResponse":"Hallo","actions":[]}\n`,
      ]),
    );

    const result = await readCodexStream(response, (event) => events.push(event));

    expect(events.map((event) => event.type)).toEqual(["thread", "message", "done"]);
    expect(result).toEqual({ threadId: "thread-1", finalResponse: "Hallo", actions: [] });
  });

  test("normalizes SSE delta events into message updates", () => {
    const events: CodexStreamEvent[] = [];
    const first = parseCodexStreamBuffer(
      `event: delta\ndata: "Ant`,
      (event) => events.push(event),
    );
    const second = parseCodexStreamBuffer(
      `${first.remainder}wort"\n\nevent: done\ndata: {"finalResponse":"Antwort","actions":[]}\n\n`,
      (event) => events.push(event),
    );

    expect(second.remainder).toBe("");
    expect(events).toEqual([
      { type: "delta", text: "Antwort" },
      { type: "done", threadId: null, finalResponse: "Antwort", actions: [] },
    ]);
  });

  test("normalizes backend NDJSON delta text events", async () => {
    const events: CodexStreamEvent[] = [];
    const response = new Response(
      streamFromChunks([
        `{"type":"thread","threadId":null}\n`,
        `{"type":"delta","text":"Ant"}\n`,
        `{"type":"delta","text":"wort"}\n`,
        `{"type":"done","threadId":null,"finalResponse":"Antwort","actions":[]}\n`,
      ]),
    );

    const result = await readCodexStream(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "thread", threadId: null },
      { type: "delta", text: "Ant" },
      { type: "delta", text: "wort" },
      { type: "done", threadId: null, finalResponse: "Antwort", actions: [] },
    ]);
    expect(result.finalResponse).toBe("Antwort");
  });

  test("falls back to HTTP when WebSocket fails before output", async () => {
    const events: CodexStreamEvent[] = [];
    const result = await runCodexStream(
      { prompt: "Test" },
      (event) => events.push(event),
      {
        websocketUrl: "ws://example.invalid/codex",
        websocketFactory: () => new FailingWebSocket() as unknown as WebSocket,
        fetcher: async () =>
          new Response(
            streamFromChunks([
              `{"type":"message","text":"Fallback"}\n`,
              `{"type":"done","threadId":null,"finalResponse":"Fallback","actions":[]}\n`,
            ]),
            { status: 200 },
          ),
      },
    );

    expect(events).toEqual([
      { type: "message", text: "Fallback" },
      { type: "done", threadId: null, finalResponse: "Fallback", actions: [] },
    ]);
    expect(result.finalResponse).toBe("Fallback");
  });
});

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

class FailingWebSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;

  constructor() {
    super();
    queueMicrotask(() => {
      this.readyState = WebSocket.CLOSED;
      this.dispatchEvent(new Event("error"));
    });
  }

  send() {}

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}
