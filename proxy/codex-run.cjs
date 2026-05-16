const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CODEX_DEVICE_URL = 'https://auth.openai.com/codex/device';
const CODEX_HOME = path.join(os.tmpdir(), 'moodle-clients-codex-home');

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

async function streamCodexAuth(input, response) {
    const method = String(input.method || 'GET').toUpperCase();
    const origin = getHeader(input.headers, 'origin');
    const headers = {
        ...createResponseHeaders(origin),
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
    };

    if (method === 'OPTIONS') {
        response.writeHead(204, headers);
        response.end();
        return;
    }

    if (method === 'GET') {
        const status = await runCodexLoginStatus();
        response.writeHead(200, headers);
        response.end(
            JSON.stringify({
                authenticated: status.exitCode === 0,
                detail: cleanStatus(status.output),
            }),
        );
        return;
    }

    if (method !== 'POST') {
        response.writeHead(405, headers);
        response.end(JSON.stringify({ error: 'Use GET or POST for Codex auth.' }));
        return;
    }

    response.writeHead(200, {
        ...headers,
        'content-type': 'application/x-ndjson; charset=utf-8',
    });

    fs.mkdirSync(CODEX_HOME, { recursive: true });
    const child = spawn(getCodexBinary(), ['login', '--device-auth'], {
        cwd: process.cwd(),
        env: getChatGptOnlyEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let emittedDeviceCode = false;
    const handleChunk = (chunk) => {
        buffer += stripAnsi(String(chunk));
        if (emittedDeviceCode) {
            return;
        }
        const userCode = findDeviceCode(buffer);
        if (buffer.includes(CODEX_DEVICE_URL) && userCode) {
            emittedDeviceCode = true;
            writeStreamEvent(response, null, {
                type: 'device_code',
                verificationUri: CODEX_DEVICE_URL,
                userCode,
                expiresInSeconds: 900,
            });
        }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);
    child.on('error', (error) => {
        writeStreamEvent(response, null, {
            type: 'error',
            error:
                error instanceof Error
                    ? error.message
                    : 'Unable to start Codex device authorization.',
        });
        response.end();
    });
    child.on('close', (code) => {
        if (code === 0) {
            writeStreamEvent(response, null, { type: 'completed' });
        } else {
            writeStreamEvent(response, null, {
                type: 'error',
                error:
                    cleanStatus(buffer) ||
                    'Codex device authorization did not complete.',
            });
        }
        response.end();
    });
}

async function createCodexThread(threadId) {
    const { Codex } = await import('@openai/codex-sdk');
    // Codex invariant: this proxy is web/dev-only and must never be used as the
    // iOS Codex path. iOS must run an embedded Codex runtime with ChatGPT OAuth,
    // not API keys, cloud runtimes, or a macOS Node.js bridge.
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
    fs.mkdirSync(CODEX_HOME, { recursive: true });

    Object.entries(process.env).forEach(([key, value]) => {
        if (!value || key === 'OPENAI_API_KEY' || key === 'CODEX_API_KEY') {
            return;
        }

        nextEnvironment[key] = value;
    });
    nextEnvironment.CODEX_HOME = CODEX_HOME;

    return nextEnvironment;
}

function runCodexLoginStatus() {
    fs.mkdirSync(CODEX_HOME, { recursive: true });
    return new Promise((resolve, reject) => {
        const child = spawn(getCodexBinary(), ['login', 'status'], {
            cwd: process.cwd(),
            env: getChatGptOnlyEnvironment(),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += stripAnsi(String(chunk));
        });
        child.stderr.on('data', (chunk) => {
            output += stripAnsi(String(chunk));
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ exitCode: code ?? 1, output });
        });
    });
}

function getCodexBinary() {
    return path.join(process.cwd(), 'node_modules', '.bin', 'codex');
}

function findDeviceCode(value) {
    return value.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] ?? null;
}

function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function cleanStatus(value) {
    return String(value || '')
        .replace(/Device codes are a common phishing target\..*/gis, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function createResponseHeaders(origin) {
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
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
    streamCodexAuth,
    streamCodexRun,
};
