import { logDevError, logDevInfo, sanitizeForLog } from "./debug";
import { DiagnosticError } from "./moodleDiagnostics";
import type { MoodleConnection } from "./moodle";

const MOBILE_QR_TOKEN_FUNCTION = "tool_mobile_get_tokens_for_qr_login";
const MOODLE_MOBILE_USER_AGENT = "Mozilla/5.0 MoodleMobile";
const MOBILE_WS_SERVICE = "moodle_mobile_app";
const QR_NETWORK_MISMATCH_MESSAGE =
  "QR login was blocked by Moodle's same-IP check.";

type MobileQRLink = {
  siteUrl: string;
  qrLoginKey: string;
  userId: number;
};

type QRTokenExchangeResponse = Array<{
  error?: string;
  errorcode?: string;
  key?: string;
  message?: string;
  token?: string;
  userid?: number;
}>;

type ProxyEnvelope = {
  ok?: boolean;
  upstreamStatus?: number;
  upstreamBody?: string;
  debugDetails?: string[];
  error?: string;
  proxyUrl?: string;
};

type TransportResponse = {
  responseText: string;
  responseStatus: number;
  transportDebugDetails: string[];
};

type MoodleApiCallOptions = {
  readonly logRejectedRequest?: boolean;
};

export async function callMoodleApi(
  connection: MoodleConnection,
  functionName: string,
  params: Record<string, string> = {},
  options: MoodleApiCallOptions = {},
): Promise<unknown> {
  const endpoint = new URL(
    "/webservice/rest/server.php?moodlewsrestformat=json",
    connection.moodleSiteUrl,
  );
  const proxyBaseUrl = getMoodleProxyBaseUrl();
  const viaProxy = Boolean(proxyBaseUrl);

  logDevInfo("Moodle API request started", {
    host: endpoint.host,
    functionName,
    viaProxy,
    paramKeys: Object.keys(params).sort(),
  });

  const body = new URLSearchParams();
  body.set("wstoken", connection.moodleMobileToken);
  body.set("wsfunction", functionName);
  Object.entries(params).forEach(([key, value]) => {
    body.set(key, value);
  });

  const { responseText, responseStatus, transportDebugDetails } =
    await fetchMoodleApiResponse(
      endpoint,
      connection,
      functionName,
      params,
      body,
      proxyBaseUrl,
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    logDevError("Moodle API invalid JSON", error, {
      endpoint: endpoint.toString(),
      functionName,
      status: responseStatus,
        transportDebugDetails,
    });
    throw new DiagnosticError(
      "Moodle API returned invalid JSON.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `wsfunction: ${functionName}`,
        ...transportDebugDetails,
        getErrorDetailLine("Parse error", error instanceof Error ? error.message : String(error)),
        getErrorDetailLine("Response", responseText),
      ]),
      error,
    );
  }

  const maybeError = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  if (
    maybeError &&
    typeof maybeError.exception === "string" &&
    maybeError.exception
  ) {
    const message = typeof maybeError.message === "string" ? maybeError.message.trim() : "";
    if (options.logRejectedRequest !== false) {
      logDevError("Moodle API rejected request", new Error(message || "Moodle API rejected the request."), {
        endpoint: endpoint.toString(),
        functionName,
        moodleResult: sanitizeForLog(maybeError),
        transportDebugDetails,
      });
    }
    throw new DiagnosticError(
      message || "Moodle API rejected the request.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `wsfunction: ${functionName}`,
        ...transportDebugDetails,
        getErrorDetailLine("Moodle exception", typeof maybeError.exception === "string" ? maybeError.exception : null),
      ]),
      new Error(message || "Moodle API rejected the request."),
    );
  }

  logDevInfo("Moodle API request completed", {
    host: endpoint.host,
    functionName,
    viaProxy,
    status: responseStatus,
    resultShape: describePayloadShape(parsed),
    transportDebugDetails,
  });

  return parsed;
}

function describePayloadShape(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }

  if (typeof value === "object" && value !== null) {
    return {
      type: "object",
      keys: Object.keys(value as Record<string, unknown>).sort().slice(0, 20),
    };
  }

  return { type: typeof value };
}

async function readResponsePreview(response: Response): Promise<string> {
  try {
    return (await response.clone().text()).slice(0, 2000);
  } catch {
    return "";
  }
}

function isIPMismatchMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes("ip-adresse passt nicht") || normalized.includes("ip address does not match");
}

function sanitizeMessage(message: string): string {
  return message
    .trim()
    .replaceAll(/moodlemobile:\/\/\S+/gi, "[redacted]")
    .replaceAll(/\b(qrlogin|privatetoken|wstoken|token)=([^&\s]+)/gi, "$1=[redacted]");
}

function compactDebugDetails(details: Array<string | null | undefined>): string[] {
  return details.filter((detail): detail is string => Boolean(detail?.trim()));
}

function getErrorDetailLine(label: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const sanitized = sanitizeMessage(String(sanitizeForLog(value))).replaceAll(/\s+/g, " ").trim();
  if (!sanitized) {
    return null;
  }

  const preview = sanitized.length > 180 ? `${sanitized.slice(0, 180)}…` : sanitized;
  return `${label}: ${preview}`;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${label} is invalid.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return value.trim();
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} is invalid.`);
  }

  return value;
}

export async function collectQRExchangeNetworkDetails(endpoint: URL, error: unknown): Promise<string[]> {
  const details = compactDebugDetails([
    `Runtime: ${getRuntimeLabel()}`,
    getBrowserOnlineLine(),
  ]);

  if (!isWebRuntime()) {
    return compactDebugDetails([
      ...details,
      "Check network access, VPN, Private Relay, or certificate trust.",
    ]);
  }

  const appOrigin = getAppOrigin();
  const crossOrigin = appOrigin ? appOrigin !== endpoint.origin : null;
  const probe = await runOpaqueReachabilityProbe(endpoint);
  let crossOriginLine: string | null = null;
  if (crossOrigin !== null) {
    crossOriginLine = `Cross-origin request: ${crossOrigin ? "yes" : "no"}`;
  }

  return compactDebugDetails([
    ...details,
    appOrigin ? `App origin: ${appOrigin}` : null,
    `Target origin: ${endpoint.origin}`,
    crossOriginLine,
    getMixedContentRiskLine(appOrigin, endpoint),
    crossOrigin
      ? "Request shape: cross-origin POST with application/json and X-Requested-With."
      : null,
    crossOrigin
      ? "Preflight risk: high — this request likely triggers a browser CORS preflight."
      : null,
    ...probe.details,
    getLikelyCauseLine({ appOrigin, crossOrigin, probeReached: probe.reached, error }),
  ]);
}

export async function fetchQRExchangeResponse(
  endpoint: URL,
  link: MobileQRLink,
  payload: unknown,
): Promise<TransportResponse> {
  const proxyBaseUrl = getMoodleProxyBaseUrl();
  if (proxyBaseUrl) {
    return fetchQRExchangeViaProxy(endpoint, link);
  }

  return fetchQRExchangeDirect(endpoint, link, payload);
}

async function fetchQRExchangeViaProxy(
  endpoint: URL,
  link: MobileQRLink,
): Promise<TransportResponse> {
  const proxyResult = await callMoodleProxy({
    action: "qr-exchange",
    siteUrl: link.siteUrl,
    qrLoginKey: link.qrLoginKey,
    userId: link.userId,
  });
  const proxyDebugDetails = proxyResult.debugDetails ?? [];

  if (!proxyResult.ok) {
    logDevError("QR token exchange HTTP failure via proxy", new Error(`HTTP ${proxyResult.upstreamStatus}`), {
      endpoint: endpoint.toString(),
      status: proxyResult.upstreamStatus,
      responseBody: proxyResult.upstreamBody,
      proxyDebugDetails,
    });
    throw new DiagnosticError(
      `QR token exchange failed with HTTP ${proxyResult.upstreamStatus}.`,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        ...proxyDebugDetails,
        `HTTP status: ${proxyResult.upstreamStatus}`,
        getErrorDetailLine("Response", proxyResult.upstreamBody),
      ]),
      new Error(`HTTP ${proxyResult.upstreamStatus}`),
    );
  }

  return {
    responseText: proxyResult.upstreamBody ?? '',
    responseStatus: proxyResult.upstreamStatus ?? 0,
    transportDebugDetails: proxyDebugDetails,
  };
}

async function fetchQRExchangeDirect(
  endpoint: URL,
  link: MobileQRLink,
  payload: unknown,
): Promise<TransportResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": MOODLE_MOBILE_USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const diagnosticDetails = await collectQRExchangeNetworkDetails(endpoint, error);
    logDevError("QR token exchange network failure", error, {
      endpoint: endpoint.toString(),
      siteUrl: link.siteUrl,
      userId: link.userId,
      diagnosticDetails,
    });
    throw new DiagnosticError(
      "Could not reach Moodle for QR token exchange.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        getErrorDetailLine("Network error", error instanceof Error ? error.message : String(error)),
        ...diagnosticDetails,
      ]),
      error,
    );
  }

  if (!response.ok) {
    const body = await readResponsePreview(response);
    logDevError("QR token exchange HTTP failure", new Error(`HTTP ${response.status}`), {
      endpoint: endpoint.toString(),
      status: response.status,
      responseBody: body,
    });
    throw new DiagnosticError(
      `QR token exchange failed with HTTP ${response.status}.`,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `HTTP status: ${response.status}`,
        getErrorDetailLine("Response", body),
      ]),
      new Error(`HTTP ${response.status}`),
    );
  }

  return {
    responseText: await response.text(),
    responseStatus: response.status,
    transportDebugDetails: [],
  };
}

async function fetchMoodleApiResponse(
  endpoint: URL,
  connection: MoodleConnection,
  functionName: string,
  params: Record<string, string>,
  body: URLSearchParams,
  proxyBaseUrl: string | null,
): Promise<TransportResponse> {
  if (proxyBaseUrl) {
    return fetchMoodleApiViaProxy(endpoint, connection, functionName, params);
  }

  return fetchMoodleApiDirect(endpoint, functionName, params, body);
}

async function fetchMoodleApiViaProxy(
  endpoint: URL,
  connection: MoodleConnection,
  functionName: string,
  params: Record<string, string>,
): Promise<TransportResponse> {
  const proxyResult = await callMoodleProxy({
    action: "api-call",
    siteUrl: connection.moodleSiteUrl,
    token: connection.moodleMobileToken,
    functionName,
    params,
  });
  const proxyDebugDetails = proxyResult.debugDetails ?? [];

  if (!proxyResult.ok) {
    logDevError("Moodle API HTTP failure via proxy", new Error(`HTTP ${proxyResult.upstreamStatus}`), {
      endpoint: endpoint.toString(),
      functionName,
      status: proxyResult.upstreamStatus,
      responseBody: proxyResult.upstreamBody,
      proxyDebugDetails,
    });
    throw new DiagnosticError(
      `Moodle API failed with HTTP ${proxyResult.upstreamStatus}.`,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `wsfunction: ${functionName}`,
        ...proxyDebugDetails,
        `HTTP status: ${proxyResult.upstreamStatus}`,
        getErrorDetailLine("Response", proxyResult.upstreamBody),
      ]),
      new Error(`HTTP ${proxyResult.upstreamStatus}`),
    );
  }

  return {
    responseText: proxyResult.upstreamBody ?? '',
    responseStatus: proxyResult.upstreamStatus ?? 0,
    transportDebugDetails: proxyDebugDetails,
  };
}

async function fetchMoodleApiDirect(
  endpoint: URL,
  functionName: string,
  params: Record<string, string>,
  body: URLSearchParams,
): Promise<TransportResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": MOODLE_MOBILE_USER_AGENT,
      },
      body: body.toString(),
    });
  } catch (error) {
    logDevError("Moodle API network failure", error, {
      endpoint: endpoint.toString(),
      functionName,
      paramKeys: Object.keys(params).sort(),
    });
    throw new DiagnosticError(
      "Could not reach Moodle.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `wsfunction: ${functionName}`,
        getErrorDetailLine("Network error", error instanceof Error ? error.message : String(error)),
      ]),
      error,
    );
  }

  if (!response.ok) {
    const responseBody = await readResponsePreview(response);
    logDevError("Moodle API HTTP failure", new Error(`HTTP ${response.status}`), {
      endpoint: endpoint.toString(),
      functionName,
      status: response.status,
      responseBody,
    });
    throw new DiagnosticError(
      `Moodle API failed with HTTP ${response.status}.`,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `wsfunction: ${functionName}`,
        `HTTP status: ${response.status}`,
        getErrorDetailLine("Response", responseBody),
      ]),
      new Error(`HTTP ${response.status}`),
    );
  }

  return {
    responseText: await response.text(),
    responseStatus: response.status,
    transportDebugDetails: [],
  };
}

async function callMoodleProxy(payload: Record<string, unknown>): Promise<ProxyEnvelope> {
  const proxyBaseUrl = getMoodleProxyBaseUrl();
  if (!proxyBaseUrl) {
    throw new DiagnosticError("Moodle proxy is not configured for this runtime.", ["Proxy base URL is missing."]);
  }

  let response: Response;
  try {
    response = await fetch(proxyBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new DiagnosticError(
      "Could not reach the Moodle proxy.",
      compactDebugDetails([
        `Proxy endpoint: ${proxyBaseUrl}`,
        getErrorDetailLine("Proxy fetch error", error instanceof Error ? error.message : String(error)),
        "For local dev, make sure the local Moodle proxy is running.",
      ]),
      error,
    );
  }

  const responseText = await response.text();
  let parsed: ProxyEnvelope;
  try {
    parsed = JSON.parse(responseText) as ProxyEnvelope;
  } catch (error) {
    throw new DiagnosticError(
      "Moodle proxy returned invalid JSON.",
      compactDebugDetails([
        `Proxy endpoint: ${proxyBaseUrl}`,
        `Proxy HTTP status: ${response.status}`,
        getErrorDetailLine("Proxy parse error", error instanceof Error ? error.message : String(error)),
        getErrorDetailLine("Proxy response", responseText),
      ]),
      error,
    );
  }

  if (!response.ok) {
    throw new DiagnosticError(
      parsed.error || `Moodle proxy failed with HTTP ${response.status}.`,
      compactDebugDetails([
        `Proxy endpoint: ${proxyBaseUrl}`,
        `Proxy HTTP status: ${response.status}`,
        ...getProxyDebugDetails(parsed),
      ]),
      new Error(parsed.error || `HTTP ${response.status}`),
    );
  }

  return {
    ok: parsed.ok,
    upstreamStatus: parsed.upstreamStatus,
    upstreamBody: typeof parsed.upstreamBody === "string" ? parsed.upstreamBody : "",
    error: parsed.error,
    debugDetails: compactDebugDetails([
      `Transport: proxy`,
      `Proxy endpoint: ${proxyBaseUrl}`,
      ...getProxyDebugDetails(parsed),
    ]),
  };
}

function getProxyDebugDetails(payload: ProxyEnvelope): string[] {
  return Array.isArray(payload.debugDetails)
    ? payload.debugDetails.filter((detail): detail is string => typeof detail === "string" && Boolean(detail.trim()))
    : [];
}

export function getMoodleProxyBaseUrl(): string | null {
  if (!isWebRuntime()) {
    return null;
  }

  const configuredProxyBaseUrl = getConfiguredMoodleProxyBaseUrl();
  if (configuredProxyBaseUrl) {
    return configuredProxyBaseUrl;
  }

  const appOrigin = getAppOrigin();
  if (!appOrigin) {
    return null;
  }

  try {
    const parsed = new URL(appOrigin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return "http://localhost:3000/api/moodle-proxy";
    }
  } catch {
    return null;
  }

  return "/api/moodle-proxy";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getConfiguredMoodleProxyBaseUrl(): string | null {
  if (typeof process === "undefined") {
    return null;
  }

  const configuredProxyBaseUrl = process.env.EXPO_PUBLIC_MOODLE_PROXY_BASE_URL?.trim();
  return configuredProxyBaseUrl ? stripTrailingSlash(configuredProxyBaseUrl) : null;
}

function getRuntimeLabel(): string {
  return isWebRuntime() ? "web" : "native";
}

function isWebRuntime(): boolean {
  return globalThis.window !== undefined && globalThis.document !== undefined;
}

function getAppOrigin(): string | null {
  if (!isWebRuntime()) {
    return null;
  }

  try {
    return globalThis.window.location.origin;
  } catch {
    return null;
  }
}

function getBrowserOnlineLine(): string | null {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return null;
  }

  return `Browser online: ${navigator.onLine ? "yes" : "no"}`;
}

function getMixedContentRiskLine(appOrigin: string | null, endpoint: URL): string | null {
  if (!appOrigin) {
    return null;
  }

  try {
    const appUrl = new URL(appOrigin);
    if (appUrl.protocol === "https:" && endpoint.protocol !== "https:") {
      return "Mixed-content risk: yes — an HTTPS app cannot call an HTTP Moodle endpoint.";
    }
  } catch {
    return null;
  }

  return `Mixed-content risk: no (${endpoint.protocol.replace(":", "")})`;
}

async function runOpaqueReachabilityProbe(endpoint: URL): Promise<{
  reached: boolean;
  details: string[];
}> {
  const probeTarget = new URL("/login/index.php", endpoint);

  try {
    await fetch(probeTarget.toString(), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
    });

    return {
      reached: true,
      details: [
        `Opaque probe: reached ${probeTarget.pathname} on ${probeTarget.host}.`,
      ],
    };
  } catch (probeError) {
    return {
      reached: false,
      details: compactDebugDetails([
        `Opaque probe host: ${probeTarget.host}`,
        getErrorDetailLine(
          "Opaque probe error",
          probeError instanceof Error ? probeError.message : String(probeError),
        ),
      ]),
    };
  }
}

function getLikelyCauseLine(input: {
  appOrigin: string | null;
  crossOrigin: boolean | null;
  probeReached: boolean;
  error: unknown;
}): string | null {
  if (!isWebRuntime()) {
    return null;
  }

  const errorMessage = input.error instanceof Error ? input.error.message.trim().toLowerCase() : "";

  if (input.crossOrigin && input.probeReached) {
    return "Likely cause: the site is reachable, so the browser probably blocked the Moodle AJAX POST because the endpoint does not allow CORS/preflight from this app origin.";
  }

  if (input.crossOrigin && !input.probeReached) {
    return "Likely cause: this looks more like DNS, VPN, firewall, captive portal, or certificate trouble than a pure CORS issue.";
  }

  if (input.appOrigin && errorMessage.includes("failed to fetch")) {
    return "Likely cause: browser fetch was blocked before a response arrived, often due to CORS, certificate trust, ad blockers, or privacy/network middleware.";
  }

  return null;
}

function parsePositiveInteger(raw: string | null, fieldName: string): number {
  if (!raw || !/^\d+$/.test(raw.trim())) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}
