async function createCodexRunResponse(input) {
    const method = String(input.method || 'GET').toUpperCase();
    const origin = getHeader(input.headers, 'origin');
    const headers = createResponseHeaders(origin);

    if (method === 'OPTIONS') {
        return {
            status: 204,
            headers,
            body: '',
        };
    }

    if (method !== 'POST') {
        return jsonResponse(405, { error: 'Use POST to run Codex.' }, headers);
    }

    let body;
    try {
        body = JSON.parse(input.bodyText || '{}');
    } catch {
        return jsonResponse(400, { error: 'Request body must be JSON.' }, headers);
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const threadId =
        typeof body.threadId === 'string' && body.threadId.trim()
            ? body.threadId.trim()
            : null;

    if (!prompt) {
        return jsonResponse(400, { error: 'Prompt is required.' }, headers);
    }

    try {
        const { codex, thread } = await createCodexThread(threadId);
        void codex;
        const result = await thread.run(withMoodleToolsPrompt(prompt, body.moodleContext));

        return jsonResponse(
            200,
            {
                threadId: thread.id,
                finalResponse: result.finalResponse,
            },
            headers,
        );
    } catch (error) {
        return jsonResponse(
            500,
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Codex failed before returning a result.',
            },
            headers,
        );
    }
}

async function streamCodexRun(input, response) {
    const method = String(input.method || 'GET').toUpperCase();
    const origin = getHeader(input.headers, 'origin');
    const headers = {
        ...createResponseHeaders(origin),
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
    };

    if (method === 'OPTIONS') {
        response.writeHead(204, headers);
        response.end();
        return;
    }

    if (method !== 'POST') {
        writeStreamEvent(response, headers, {
            type: 'error',
            error: 'Use POST to run Codex.',
        });
        response.end();
        return;
    }

    let body;
    try {
        body = JSON.parse(input.bodyText || '{}');
    } catch {
        writeStreamEvent(response, headers, {
            type: 'error',
            error: 'Request body must be JSON.',
        });
        response.end();
        return;
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const threadId =
        typeof body.threadId === 'string' && body.threadId.trim()
            ? body.threadId.trim()
            : null;

    if (!prompt) {
        writeStreamEvent(response, headers, {
            type: 'error',
            error: 'Prompt is required.',
        });
        response.end();
        return;
    }

    response.writeHead(200, headers);

    try {
        const { thread } = await createCodexThread(threadId);
        const streamed = await thread.runStreamed(withMoodleToolsPrompt(prompt, body.moodleContext));
        let finalResponse = '';

        for await (const event of streamed.events) {
            if (event.type === 'thread.started') {
                writeStreamEvent(response, null, {
                    type: 'thread',
                    threadId: event.thread_id,
                });
            } else if (
                event.type === 'item.started' ||
                event.type === 'item.updated' ||
                event.type === 'item.completed'
            ) {
                const item = event.item;
                if (item.type === 'agent_message') {
                    finalResponse = item.text;
                    writeStreamEvent(response, null, {
                        type: 'message',
                        text: item.text,
                    });
                } else if (item.type === 'command_execution') {
                    writeStreamEvent(response, null, {
                        type: 'tool',
                        title: compactCommand(item.command),
                        status:
                            item.status === 'completed'
                                ? 'completed'
                                : item.status === 'failed'
                                  ? 'failed'
                                  : 'running',
                    });
                }
            }
        }

        writeStreamEvent(response, null, {
            type: 'done',
            threadId: thread.id,
            finalResponse,
        });
    } catch (error) {
        writeStreamEvent(response, null, {
            type: 'error',
            error:
                error instanceof Error
                    ? error.message
                    : 'Codex failed before returning a result.',
        });
    } finally {
        response.end();
    }
}

async function createCodexThread(threadId) {
    const { Codex } = await import('@openai/codex-sdk');
    const codex = new Codex({
        env: getChatGptOnlyEnvironment(),
    });
    const thread = threadId
        ? codex.resumeThread(threadId)
        : codex.startThread({
              workingDirectory: process.cwd(),
              skipGitRepoCheck: true,
              sandboxMode: 'danger-full-access',
              approvalPolicy: 'never',
          });

    return { codex, thread };
}

function withMoodleToolsPrompt(prompt, moodleContext) {
    const contextText = formatMoodleContext(moodleContext);
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
${contextText}

User request:
${prompt}`;
}

function formatMoodleContext(context) {
    if (!context || typeof context !== 'object') {
        return 'No Moodle context is currently loaded.';
    }

    return JSON.stringify(context, null, 2).slice(0, 60000);
}

function getChatGptOnlyEnvironment() {
    const nextEnvironment = {};

    Object.entries(process.env).forEach(([key, value]) => {
        if (!value || key === 'OPENAI_API_KEY' || key === 'CODEX_API_KEY') {
            return;
        }

        nextEnvironment[key] = value;
    });

    return nextEnvironment;
}

function createResponseHeaders(origin) {
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
    };

    if (origin) {
        headers['access-control-allow-origin'] = origin;
    }

    return headers;
}

function jsonResponse(status, body, headers) {
    return {
        status,
        headers,
        body: JSON.stringify(body),
    };
}

function writeStreamEvent(response, headers, event) {
    if (headers) {
        response.writeHead(event.type === 'error' ? 400 : 200, headers);
    }
    response.write(`${JSON.stringify(event)}\n`);
}

function compactCommand(command) {
    const normalized = String(command || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return 'Running tool';
    }
    if (normalized.length <= 72) {
        return normalized;
    }
    return `${normalized.slice(0, 69)}...`;
}

function getHeader(headers, name) {
    const lowerName = name.toLowerCase();
    const entry = Object.entries(headers || {}).find(
        ([key]) => key.toLowerCase() === lowerName,
    );
    const value = entry?.[1];

    if (Array.isArray(value)) {
        return value[0] || null;
    }

    return typeof value === 'string' ? value : null;
}

module.exports = {
    createCodexRunResponse,
    streamCodexRun,
};
