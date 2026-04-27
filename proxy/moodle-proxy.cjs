const MOBILE_QR_TOKEN_FUNCTION = "tool_mobile_get_tokens_for_qr_login";
const PROXY_USER_AGENT = "Mozilla/5.0 MoodleMobile";
const DEFAULT_ALLOWED_HOSTS = ["moodle.fhgr.ch"];
const DEFAULT_PROXY_PORT = 3000;

async function createMoodleProxyResponse(input) {
  const method = String(input.method || "GET").toUpperCase();
  const origin = getHeader(input.headers, "origin");
  const responseHeaders = createResponseHeaders(origin);

  if (method === "OPTIONS") {
    return {
      status: 204,
      headers: responseHeaders,
      body: "",
    };
  }

  if (method !== "POST") {
    return jsonResponse(
      405,
      {
        error: "Method not allowed.",
        debugDetails: ["Use POST for the Moodle proxy."],
      },
      responseHeaders,
    );
  }

  let payload;
  try {
    payload = parsePayload(input.bodyText);
  } catch (error) {
    return jsonResponse(
      400,
      {
        error: error instanceof Error ? error.message : "Invalid proxy payload.",
        debugDetails: ["The proxy request body must be valid JSON."],
      },
      responseHeaders,
    );
  }

  let upstream;
  try {
    upstream = buildUpstreamRequest(payload);
  } catch (error) {
    return jsonResponse(
      400,
      {
        error: error instanceof Error ? error.message : "Invalid Moodle proxy request.",
        debugDetails: compact([
          getErrorDetailLine("Action", payload && typeof payload === "object" ? payload.action : null),
        ]),
      },
      responseHeaders,
    );
  }

  try {
    const upstreamResponse = await fetch(upstream.url.toString(), {
      method: "POST",
      headers: upstream.headers,
      body: upstream.body,
    });
    const upstreamBody = await upstreamResponse.text();

    return jsonResponse(
      200,
      {
        ok: upstreamResponse.ok,
        upstreamStatus: upstreamResponse.status,
        upstreamBody,
        debugDetails: compact([
          `Proxy transport: ${detectProxyTransport(input.requestUrl)}`,
          `Proxy target host: ${upstream.url.host}`,
          `Proxy target path: ${upstream.url.pathname}`,
          `Proxy user agent: ${upstream.headers["user-agent"]}`,
          `Upstream status: ${upstreamResponse.status}`,
        ]),
      },
      responseHeaders,
    );
  } catch (error) {
    return jsonResponse(
      502,
      {
        ok: false,
        upstreamStatus: 0,
        upstreamBody: "",
        error: "Proxy could not reach Moodle upstream.",
        debugDetails: compact([
          `Proxy transport: ${detectProxyTransport(input.requestUrl)}`,
          `Proxy target host: ${upstream.url.host}`,
          `Proxy target path: ${upstream.url.pathname}`,
          `Proxy user agent: ${upstream.headers["user-agent"]}`,
          getErrorDetailLine(
            "Proxy network error",
            error instanceof Error ? error.message : String(error),
          ),
        ]),
      },
      responseHeaders,
    );
  }
}

function parsePayload(bodyText) {
  if (!bodyText?.trim()) {
    throw new Error("Proxy request body is empty.");
  }

  const parsed = JSON.parse(bodyText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Proxy request body must be a JSON object.");
  }

  return parsed;
}

function buildUpstreamRequest(payload) {
  const action = getRequiredString(payload.action, "action");

  if (action === "qr-exchange") {
    const siteUrl = getAllowedSiteUrl(payload.siteUrl);
    const qrLoginKey = getRequiredString(payload.qrLoginKey, "qrLoginKey");
    const userId = getPositiveInteger(payload.userId, "userId");
    const url = new URL(
      `/lib/ajax/service-nologin.php?info=${MOBILE_QR_TOKEN_FUNCTION}&lang=de_ch`,
      siteUrl,
    );

    return {
      url,
      headers: {
        "content-type": "application/json",
        "user-agent": PROXY_USER_AGENT,
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify([
        {
          index: 0,
          methodname: MOBILE_QR_TOKEN_FUNCTION,
          args: {
            qrloginkey: qrLoginKey,
            userid: String(userId),
          },
        },
      ]),
    };
  }

  if (action === "api-call") {
    const siteUrl = getAllowedSiteUrl(payload.siteUrl);
    const token = getRequiredString(payload.token, "token");
    const functionName = getRequiredString(payload.functionName, "functionName");
    const params = getStringRecord(payload.params, "params");
    const url = new URL(
      "/webservice/rest/server.php?moodlewsrestformat=json",
      siteUrl,
    );
    const body = new URLSearchParams();
    body.set("wstoken", token);
    body.set("wsfunction", functionName);
    Object.entries(params).forEach(([key, value]) => {
      body.set(key, value);
    });

    return {
      url,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": PROXY_USER_AGENT,
      },
      body: body.toString(),
    };
  }

  throw new Error(`Unsupported Moodle proxy action: ${action}.`);
}

function getAllowedSiteUrl(rawSiteUrl) {
  const siteUrl = getRequiredString(rawSiteUrl, "siteUrl");
  let parsed;

  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("siteUrl must be a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("siteUrl must use http or https.");
  }

  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.some((host) => hostMatches(parsed.hostname, host))) {
    throw new Error(
      `siteUrl host ${parsed.hostname} is not allowed by the Moodle proxy.`,
    );
  }

  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = "/";
  return parsed;
}

function getAllowedHosts() {
  const configured = process.env.MOODLE_PROXY_ALLOWED_HOSTS;
  if (!configured?.trim()) {
    return DEFAULT_ALLOWED_HOSTS;
  }

  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(hostname, allowedHost) {
  const normalizedHost = hostname.trim().toLowerCase();
  const normalizedAllowedHost = allowedHost.trim().toLowerCase();

  if (!normalizedAllowedHost) {
    return false;
  }

  if (normalizedAllowedHost.startsWith("*.")) {
    const suffix = normalizedAllowedHost.slice(1);
    return normalizedHost.endsWith(suffix);
  }

  return normalizedHost === normalizedAllowedHost;
}

function getRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function getPositiveInteger(value, fieldName) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  throw new Error(`${fieldName} must be a positive integer.`);
}

function getStringRecord(value, fieldName) {
  if (value == null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new TypeError(`${fieldName}.${key} must be a string.`);
      }

      return [key, entry];
    }),
  );
}

function createResponseHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  };

  if (origin && isAllowedCorsOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type";
  }

  return headers;
}

function isAllowedCorsOrigin(origin) {
  return (
    /^https?:\/\/localhost(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/[a-z0-9-]+\.localhost(?::\d+)?$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
  );
}

function jsonResponse(status, body, headers) {
  return {
    status,
    headers,
    body: JSON.stringify(body),
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }

    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === "string" ? value : null;
  }

  return null;
}

function detectProxyTransport(requestUrl) {
  if (!requestUrl) {
    return "serverless";
  }

  try {
    const parsed = new URL(requestUrl);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return "local-dev";
    }
  } catch {
    return "serverless";
  }

  return "serverless";
}

function getErrorDetailLine(label, value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.replaceAll(/\s+/g, " ").trim();
  const preview = normalized.length > 180 ? `${normalized.slice(0, 180)}…` : normalized;
  return `${label}: ${preview}`;
}

function compact(values) {
  return values.filter((value) => typeof value === "string" && Boolean(value.trim()));
}

module.exports = {
  DEFAULT_PROXY_PORT,
  createMoodleProxyResponse,
};
