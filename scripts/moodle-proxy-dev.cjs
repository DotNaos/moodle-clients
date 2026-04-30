const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
    DEFAULT_PROXY_PORT,
    createMoodleProxyResponse,
} = require('../proxy/moodle-proxy.cjs');
const {
    createCodexRunResponse,
    streamCodexRun,
} = require('../proxy/codex-run.cjs');

const port = Number.parseInt(
    process.env.MOODLE_PROXY_PORT || String(DEFAULT_PROXY_PORT),
    10,
);

const server = http.createServer(async (request, response) => {
    try {
        const bodyText = await readRequestBody(request);
        const host = request.headers.host || `localhost:${port}`;
        const requestUrl = `http://${host}${request.url || ''}`;
        if (requestUrl.includes('/api/moodle-cli-session')) {
            const proxyResponse = await createMoodleCliSessionResponse({
                method: request.method,
                headers: request.headers,
            });
            response.statusCode = proxyResponse.status;
            Object.entries(proxyResponse.headers).forEach(([key, value]) => {
                response.setHeader(key, value);
            });
            response.end(proxyResponse.body);
            return;
        }

        if (requestUrl.includes('/api/codex-run')) {
            await streamCodexRun(
                {
                    method: request.method,
                    headers: request.headers,
                    bodyText,
                    requestUrl,
                },
                response,
            );
            return;
        }

        const responseFactory = requestUrl.includes('/api/codex-run')
            ? createCodexRunResponse
            : createMoodleProxyResponse;
        const proxyResponse = await responseFactory({
            method: request.method,
            headers: request.headers,
            bodyText,
            requestUrl,
        });

        response.statusCode = proxyResponse.status;
        Object.entries(proxyResponse.headers).forEach(([key, value]) => {
            response.setHeader(key, value);
        });
        response.end(proxyResponse.body);
    } catch (error) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(
            JSON.stringify({
                error: 'Local Moodle proxy crashed.',
                debugDetails: [
                    error instanceof Error ? error.message : String(error),
                ],
            }),
        );
    }
});

server.listen(port, () => {
    console.log(
        `[moodle-proxy] listening on http://localhost:${port}/api/moodle-proxy`,
    );
    console.log(
        `[codex-run] listening on http://localhost:${port}/api/codex-run`,
    );
    console.log(
        `[moodle-cli-session] listening on http://localhost:${port}/api/moodle-cli-session`,
    );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.close(() => process.exit(0));
    });
}

async function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        request.on('data', (chunk) => {
            chunks.push(
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
            );
        });
        request.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        request.on('error', reject);
    });
}

async function createMoodleCliSessionResponse(input) {
    const origin = input.headers.origin;
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'accept, content-type',
    };
    if (typeof origin === 'string') {
        headers['access-control-allow-origin'] = origin;
    }

    const method = String(input.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        return { status: 204, headers, body: '' };
    }
    if (method !== 'GET') {
        return {
            status: 405,
            headers,
            body: JSON.stringify({ error: 'Use GET to import the Moodle CLI session.' }),
        };
    }

    try {
        const sessionPath =
            process.env.MOODLE_MOBILE_SESSION_PATH ||
            path.join(os.homedir(), '.moodle', 'mobile-session.json');
        const raw = await fs.readFile(sessionPath, 'utf8');
        const session = JSON.parse(raw);

        if (!session.siteUrl || !session.userId || !session.token) {
            throw new Error('mobile-session.json is incomplete');
        }

        return {
            status: 200,
            headers,
            body: JSON.stringify({
                moodleSiteUrl: session.siteUrl,
                moodleUserId: session.userId,
                moodleMobileToken: session.token,
            }),
        };
    } catch (error) {
        return {
            status: 404,
            headers,
            body: JSON.stringify({
                error:
                    error instanceof Error
                        ? error.message
                        : 'No Moodle CLI mobile session found.',
            }),
        };
    }
}
