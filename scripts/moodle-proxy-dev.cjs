const http = require("node:http");
const { DEFAULT_PROXY_PORT, createMoodleProxyResponse } = require("../proxy/moodle-proxy.cjs");

const port = Number.parseInt(process.env.MOODLE_PROXY_PORT || String(DEFAULT_PROXY_PORT), 10);

const server = http.createServer(async (request, response) => {
  try {
    const bodyText = await readRequestBody(request);
    const host = request.headers.host || `localhost:${port}`;
    const proxyResponse = await createMoodleProxyResponse({
      method: request.method,
      headers: request.headers,
      bodyText,
      requestUrl: `http://${host}${request.url || ""}`,
    });

    response.statusCode = proxyResponse.status;
    Object.entries(proxyResponse.headers).forEach(([key, value]) => {
      response.setHeader(key, value);
    });
    response.end(proxyResponse.body);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        error: "Local Moodle proxy crashed.",
        debugDetails: [error instanceof Error ? error.message : String(error)],
      }),
    );
  }
});

server.listen(port, () => {
  console.log(`[moodle-proxy] listening on http://localhost:${port}/api/moodle-proxy`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}
