import { createMoodleProxyResponse } from "../proxy/moodle-proxy.cjs";

type HeaderValue = string | string[] | undefined;

type ProxyRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  url?: string | null;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

type ProxyResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
};

export default async function handler(
  request: ProxyRequest,
  response: ProxyResponse,
): Promise<void> {
  const bodyText = await readRequestBody(request);
  const proxyResponse = await createMoodleProxyResponse({
    method: request.method,
    headers: request.headers,
    bodyText,
    requestUrl: getRequestUrl(request),
  });

  response.statusCode = proxyResponse.status;
  Object.entries(proxyResponse.headers).forEach(([key, value]) => {
    response.setHeader(key, String(value));
  });
  response.end(proxyResponse.body);
}

function getRequestUrl(request: Pick<ProxyRequest, "headers" | "url">): string | null {
  const host = getHostHeader(request.headers.host);
  if (!host) {
    return request.url ?? null;
  }

  return `http://${host}${request.url ?? ""}`;
}

function getHostHeader(value: HeaderValue): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

async function readRequestBody(request: ProxyRequest): Promise<string> {
  if (typeof request.body === "string") {
    return request.body;
  }

  if (request.body && typeof request.body === "object") {
    return JSON.stringify(request.body);
  }

  return new Promise((resolve, reject) => {
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
}
