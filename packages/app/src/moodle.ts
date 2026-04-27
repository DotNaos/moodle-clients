import { logDevError, logDevInfo, sanitizeForLog } from "./debug";

const MOODLE_MOBILE_SCHEME = "moodlemobile://";
const MOODLE_MOBILE_USER_AGENT = "Mozilla/5.0 MoodleMobile";
const MOBILE_QR_TOKEN_FUNCTION = "tool_mobile_get_tokens_for_qr_login";
export const QR_NETWORK_MISMATCH_MESSAGE =
  "QR login was blocked by Moodle's same-IP check.";

export type MobileQRLink = {
  siteUrl: string;
  qrLoginKey: string;
  userId: number;
};

export type MoodleConnection = {
  moodleSiteUrl: string;
  moodleUserId: number;
  moodleMobileToken: string;
};

export type MoodleSiteInfo = {
  siteName: string;
  userName: string;
  userId: number;
  siteUrl: string;
};

export type MoodleCourse = {
  id: number;
  fullName: string;
  shortName: string;
  categoryId?: number;
  categoryName: string;
  rawCategory?: string;
  visible: number;
    courseImage?: string | null;
};

export type MoodleCourseModule = {
  id?: number;
  name: string;
  modname?: string;
  url?: string;
  description?: string;
  contents: MoodleCourseFile[];
};

export type MoodleCourseSection = {
  id?: number;
  name: string;
  summary: string;
  modules: MoodleCourseModule[];
};

export type MoodleCourseFile = {
  filename: string;
  fileUrl: string;
  mimeType: string;
  fileSize?: number;
};
export class DiagnosticError extends Error {
  readonly debugDetails: readonly string[];

  constructor(message: string, debugDetails: string[], cause?: unknown) {
    super(message);
    this.name = "DiagnosticError";
    this.debugDetails = debugDetails;

    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

type QRTokenExchangeResponse = Array<{
  error?: boolean;
  data?: {
    token?: string;
  };
  exception?: {
    message?: string;
    errorcode?: string;
  };
}>;

type ProxyEnvelope = {
  ok: boolean;
  upstreamStatus: number;
  upstreamBody: string;
  error?: string;
  debugDetails?: string[];
};

type TransportResponse = {
  responseText: string;
  responseStatus: number;
  transportDebugDetails: string[];
};

export function parseMobileQRLink(raw: string): MobileQRLink {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("QR link is empty.");
  }

  if (!trimmed.toLowerCase().startsWith(MOODLE_MOBILE_SCHEME)) {
    throw new Error(`QR link must start with ${MOODLE_MOBILE_SCHEME}.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizeMobileQRPayload(trimmed.slice(MOODLE_MOBILE_SCHEME.length)));
  } catch {
    throw new Error("QR link is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("QR link must point to an http(s) Moodle site.");
  }

  const qrLoginKey = parsed.searchParams.get("qrlogin")?.trim();
  if (!qrLoginKey) {
    throw new Error("QR link is missing qrlogin.");
  }

  return {
    siteUrl: `${parsed.protocol}//${parsed.host}`,
    qrLoginKey,
    userId: parsePositiveInteger(parsed.searchParams.get("userid"), "userid"),
  };
}

function normalizeMobileQRPayload(raw: string): string {
  const decoded = decodeURIComponent(raw.trim());
  if (/^https?:\/\//i.test(decoded)) {
    return decoded;
  }

  if (/^https?\/\//i.test(decoded)) {
    return decoded.replace(/^(https?)\/\//i, "$1://");
  }

  return decoded;
}

export async function exchangeQRToken(link: MobileQRLink): Promise<MoodleConnection> {
  const endpoint = new URL(
    `/lib/ajax/service-nologin.php?info=${MOBILE_QR_TOKEN_FUNCTION}&lang=de_ch`,
    link.siteUrl,
  );
  const proxyBaseUrl = getMoodleProxyBaseUrl();

  const payload = [
    {
      index: 0,
      methodname: MOBILE_QR_TOKEN_FUNCTION,
      args: {
        qrloginkey: link.qrLoginKey,
        userid: String(link.userId),
      },
    },
  ];

  logDevInfo("QR token exchange started", {
    endpoint: endpoint.toString(),
    siteUrl: link.siteUrl,
    userId: link.userId,
    transport: proxyBaseUrl ? "proxy" : "direct",
    proxyBaseUrl: proxyBaseUrl ?? null,
  });

  const { responseText, responseStatus, transportDebugDetails } =
    await fetchQRExchangeResponse(endpoint, link, payload);

  let parsed: QRTokenExchangeResponse;
  try {
    logDevInfo("QR token exchange response", {
      endpoint: endpoint.toString(),
      responseBody: responseText,
      status: responseStatus,
      transportDebugDetails,
    });
    parsed = JSON.parse(responseText) as QRTokenExchangeResponse;
  } catch (error) {
    logDevError("QR token exchange invalid JSON", error, {
      endpoint: endpoint.toString(),
      status: responseStatus,
      transportDebugDetails,
    });
    throw new DiagnosticError(
      "QR token exchange returned invalid JSON.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        ...transportDebugDetails,
        getErrorDetailLine("Parse error", error instanceof Error ? error.message : String(error)),
        getErrorDetailLine("Response", responseText),
      ]),
      error,
    );
  }

  const first = parsed[0];
  if (!first || first.error || !first.data?.token) {
    const message = getQRExchangeErrorMessage(first);
    logDevError("QR token exchange rejected", new Error(message), {
      endpoint: endpoint.toString(),
      moodleResult: sanitizeForLog(first),
    });
    throw new DiagnosticError(
      message,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        ...transportDebugDetails,
        getErrorDetailLine("Moodle error code", first?.exception?.errorcode),
        getErrorDetailLine("Moodle message", first?.exception?.message),
      ]),
      new Error(message),
    );
  }

  return {
    moodleSiteUrl: link.siteUrl,
    moodleUserId: link.userId,
    moodleMobileToken: first.data.token,
  };
}

export async function getSiteInfo(connection: MoodleConnection): Promise<MoodleSiteInfo> {
  const raw = asRecord(await callMoodleApi(connection, "core_webservice_get_site_info"), "site info");
  return {
    siteName: requireString(raw.sitename, "sitename"),
    userName: requireString(raw.username, "username"),
    userId: requireNumber(raw.userid, "userid"),
    siteUrl: requireString(raw.siteurl, "siteurl"),
  };
}

function resolveCategoryName(record: Record<string, unknown>, mappedName?: string): string {
  const rawCategoryString = getOptionalString(record.category);
  return (
    mappedName ??
    rawCategoryString ??
    getOptionalString(record.categoryname) ??
    getOptionalString(record.categoryName) ??
    getOptionalString(record.categorysortorder) ??
    "Other courses"
  );
}

export async function getCourses(connection: MoodleConnection): Promise<MoodleCourse[]> {
  const raw = await callMoodleApi(connection, "core_enrol_get_users_courses", {
    userid: String(connection.moodleUserId),
  });

  if (!Array.isArray(raw)) {
    throw new TypeError("Courses response is invalid.");
  }

  const categoryMap = new Map<number, string>();
  try {
      const categoriesRaw = await callMoodleApi(connection, "core_course_get_categories", {});
      if (Array.isArray(categoriesRaw)) {
          categoriesRaw.forEach((catItem) => {
              const catRecord = asRecord(catItem, "category");
              if (typeof catRecord.id === "number" && typeof catRecord.name === "string") {
                  categoryMap.set(catRecord.id, catRecord.name);
              }
          });
      }
  } catch (err) {
      logDevInfo("Failed to fetch course categories", { error: String(err) });
  }

  logDevInfo("Moodle course DTO fields", {
    count: raw.length,
    samples: raw.slice(0, 5).map((item) => {
      const record = asRecord(item, "course");
      return {
        keys: Object.keys(record).sort((left, right) => left.localeCompare(right)),
        id: record.id,
        fullname: record.fullname,
        shortname: record.shortname,
        category: record.category,
        categoryname: record.categoryname,
        categoryName: record.categoryName,
        categorysortorder: record.categorysortorder,
      };
    }),
  });

  return raw.map((item) => {
    const record = asRecord(item, "course");
    const rawCategory = getOptionalString(record.category);

    let courseImage: string | null = null;
    if (Array.isArray(record.overviewfiles) && record.overviewfiles.length > 0) {
        const overviewFile = record.overviewfiles[0];
        if (overviewFile && typeof overviewFile === "object" && typeof overviewFile.fileurl === "string") {
            courseImage = overviewFile.fileurl;
        }
    } else if (typeof record.courseimage === "string") {
        courseImage = record.courseimage;
    }

    if (courseImage && connection.moodleMobileToken) {
        // Moodle requires webservice/pluginfile.php for token auth
        if (courseImage.includes("/pluginfile.php/") && !courseImage.includes("/webservice/pluginfile.php/")) {
            courseImage = courseImage.replace("/pluginfile.php/", "/webservice/pluginfile.php/");
        }
        if (!courseImage.includes("token=")) {
            courseImage += (courseImage.includes("?") ? "&" : "?") + "token=" + connection.moodleMobileToken;
        }
    }

    const courseCategoryId = typeof record.category === "number" ? record.category : undefined;

    return {
      id: requireNumber(record.id, "course.id"),
      fullName: requireString(record.fullname, "course.fullname"),
      shortName: requireString(record.shortname, "course.shortname"),
      categoryId: courseCategoryId,
      categoryName:
        (courseCategoryId ? categoryMap.get(courseCategoryId) : undefined) ??
        rawCategory ??
        getOptionalString(record.categoryname) ??
        getOptionalString(record.categoryName) ??
        getOptionalString(record.categorysortorder) ??
        "Other courses",
      rawCategory,
      visible: requireNumber(record.visible, "course.visible"),
      courseImage,
    };
  });
}

export async function getCourseContents(
  connection: MoodleConnection,
  courseId: number,
): Promise<MoodleCourseSection[]> {
  const raw = await callMoodleApi(connection, "core_course_get_contents", {
    courseid: String(courseId),
  });

  if (!Array.isArray(raw)) {
    throw new TypeError("Course contents response is invalid.");
  }

  return raw.map((item) => {
    const record = asRecord(item, "course section");
    const rawModules = Array.isArray(record.modules) ? record.modules : [];
    return {
      id: typeof record.id === "number" ? record.id : undefined,
      name: requireString(record.name, "section.name"),
      summary: typeof record.summary === "string" ? record.summary : "",
      modules: rawModules.map((moduleItem) => {
        const moduleRecord = asRecord(moduleItem, "course module");
        const rawContents = Array.isArray(moduleRecord.contents) ? moduleRecord.contents : [];
        return {
          id: typeof moduleRecord.id === "number" ? moduleRecord.id : undefined,
          name: requireString(moduleRecord.name, "module.name"),
          modname: typeof moduleRecord.modname === "string" ? moduleRecord.modname : "",
          url: typeof moduleRecord.url === "string" ? moduleRecord.url : "",
          description:
            typeof moduleRecord.description === "string" ? moduleRecord.description : "",
          contents: rawContents.flatMap((contentItem) => {
            const contentRecord = asRecord(contentItem, "module file");
            const filename = getOptionalString(contentRecord.filename);
            const fileUrl = getOptionalString(contentRecord.fileurl);
            if (!filename || !fileUrl) {
              return [];
            }

            return [
              {
                filename,
                fileUrl,
                mimeType: getOptionalString(contentRecord.mimetype) ?? "",
                fileSize: typeof contentRecord.filesize === "number" ? contentRecord.filesize : undefined,
              },
            ];
          }),
        };
      }),
    };
  });
}

export function getAuthenticatedFileUrl(connection: MoodleConnection, fileUrl: string): string {
  const parsed = new URL(fileUrl);
  parsed.searchParams.set("token", connection.moodleMobileToken);
  return parsed.toString();
}

export function isQRNetworkMismatchError(error: unknown): boolean {
  return error instanceof Error && error.message === QR_NETWORK_MISMATCH_MESSAGE;
}

function getQRExchangeErrorMessage(result: QRTokenExchangeResponse[number] | undefined): string {
  const errorCode = result?.exception?.errorcode?.trim().toLowerCase() ?? "";
  const message = sanitizeMessage(result?.exception?.message ?? "");

  if (isIPMismatchMessage(message) || errorCode === "ipmismatch") {
    return QR_NETWORK_MISMATCH_MESSAGE;
  }

  if (errorCode === "invalidkey") {
    return "Moodle rejected the QR login key. Generate a fresh QR code and try again.";
  }

  if (message) {
    return `QR token exchange was rejected by Moodle: ${message}`;
  }

  if (errorCode) {
    return `QR token exchange was rejected by Moodle (code: ${errorCode}).`;
  }

  return "QR token exchange was rejected by Moodle.";
}

async function callMoodleApi(
  connection: MoodleConnection,
  functionName: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const endpoint = new URL(
    "/webservice/rest/server.php?moodlewsrestformat=json",
    connection.moodleSiteUrl,
  );
  const proxyBaseUrl = getMoodleProxyBaseUrl();

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
    logDevError("Moodle API rejected request", new Error(message || "Moodle API rejected the request."), {
      endpoint: endpoint.toString(),
      functionName,
      moodleResult: sanitizeForLog(maybeError),
      transportDebugDetails,
    });
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

  return parsed;
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

async function collectQRExchangeNetworkDetails(endpoint: URL, error: unknown): Promise<string[]> {
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

async function fetchQRExchangeResponse(
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
    responseText: proxyResult.upstreamBody,
    responseStatus: proxyResult.upstreamStatus,
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
    responseText: proxyResult.upstreamBody,
    responseStatus: proxyResult.upstreamStatus,
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
      params,
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

function getMoodleProxyBaseUrl(): string | null {
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
