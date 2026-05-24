import { logDevError, logDevInfo, sanitizeForLog } from "./debug";
import { DiagnosticError } from "./moodleDiagnostics";
import { buildMoodleBrowserSSOLaunchUrl } from "./moodleBrowserSSOLaunchUrl";
import {
  callMoodleApi,
  collectQRExchangeNetworkDetails,
  fetchQRExchangeResponse,
  getMoodleProxyBaseUrl,
} from "./moodleTransport";
import {
  createPassport,
  isMoodleBrowserSSOTokenUrl,
  normalizeSiteRoot,
  parseMoodleBrowserSSOToken,
  type MoodleBrowserSSOLaunch,
} from "./moodleBrowserSSO";

export {
  isMoodleBrowserSSOTokenUrl,
  type MoodleBrowserSSOLaunch,
} from "./moodleBrowserSSO";
export { callMoodleApi } from "./moodleTransport";
export { DiagnosticError } from "./moodleDiagnostics";

const MOODLE_MOBILE_SCHEME = "moodlemobile://";
const MOODLE_CLIENT_SCHEME = "moodle-client";
const MOODLE_MOBILE_USER_AGENT = "Mozilla/5.0 MoodleMobile";
const MOBILE_QR_TOKEN_FUNCTION = "tool_mobile_get_tokens_for_qr_login";
const MOBILE_PUBLIC_CONFIG_FUNCTION = "tool_mobile_get_public_config";
const MOBILE_WS_SERVICE = "moodle_mobile_app";
const BROWSER_LOGIN_TYPE = 2;
const EMBEDDED_BROWSER_LOGIN_TYPE = 3;
export const DEFAULT_MOODLE_SITE_URL = "https://moodle.fhgr.ch";
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
  moodlePrivateToken?: string;
};

export type MoodleBrowserSSOLaunchRequest = {
  launchUrl: string;
  launch: MoodleBrowserSSOLaunch;
};

export type MoodlePublicConfig = {
  siteUrl: string;
  siteName: string;
  typeOfLogin: number;
  launchUrl: string;
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

type QRTokenExchangeResponse = Array<{
  error?: boolean;
  data?: {
    token?: string;
    privatetoken?: string;
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

type PublicConfigResponse = Array<{
  error?: boolean;
  data?: unknown;
  exception?: {
    message?: string;
    errorcode?: string;
  };
}>;

export async function getMoodlePublicConfig(siteUrl = DEFAULT_MOODLE_SITE_URL): Promise<MoodlePublicConfig> {
  const normalizedSiteUrl = normalizeSiteRoot(siteUrl);
  const endpoint = new URL(
    `/lib/ajax/service.php?info=${MOBILE_PUBLIC_CONFIG_FUNCTION}`,
    normalizedSiteUrl,
  );
  const payload = [
    {
      index: 0,
      methodname: MOBILE_PUBLIC_CONFIG_FUNCTION,
      args: {},
    },
  ];

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
    throw new DiagnosticError(
      "Could not reach Moodle login configuration.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        getErrorDetailLine("Network error", error instanceof Error ? error.message : String(error)),
      ]),
      error,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new DiagnosticError(
      `Moodle login configuration failed with HTTP ${response.status}.`,
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        `Path: ${endpoint.pathname}`,
        `HTTP status: ${response.status}`,
        getErrorDetailLine("Response", responseText),
      ]),
      new Error(`HTTP ${response.status}`),
    );
  }

  let parsed: PublicConfigResponse;
  try {
    parsed = JSON.parse(responseText) as PublicConfigResponse;
  } catch (error) {
    throw new DiagnosticError(
      "Moodle login configuration returned invalid JSON.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        getErrorDetailLine("Response", responseText),
      ]),
      error,
    );
  }

  const first = parsed[0];
  if (!first || first.error || !first.data) {
    throw new DiagnosticError(
      first?.exception?.message || "Moodle rejected the login configuration request.",
      compactDebugDetails([
        `Host: ${endpoint.host}`,
        getErrorDetailLine("Moodle error code", first?.exception?.errorcode),
        getErrorDetailLine("Moodle message", first?.exception?.message),
      ]),
      new Error(first?.exception?.message || "Moodle public config error"),
    );
  }

  const data = asRecord(first.data, "public config");
  const publicSiteUrl =
    getOptionalString(data.httpswwwroot) ??
    getOptionalString(data.wwwroot) ??
    normalizedSiteUrl;
  const launchUrl =
    getOptionalString(data.launchurl) ??
    new URL("/admin/tool/mobile/launch.php", publicSiteUrl).toString();

  return {
    siteUrl: normalizeSiteRoot(publicSiteUrl),
    siteName: getOptionalString(data.sitename) ?? "Moodle",
    typeOfLogin: typeof data.typeoflogin === "number" ? data.typeoflogin : 0,
    launchUrl,
  };
}

export async function createMoodleBrowserSSOLaunch(
  siteUrl = DEFAULT_MOODLE_SITE_URL,
  urlScheme = MOODLE_CLIENT_SCHEME,
): Promise<MoodleBrowserSSOLaunchRequest> {
  const config = await getMoodlePublicConfig(siteUrl);
  if (
    config.typeOfLogin !== BROWSER_LOGIN_TYPE &&
    config.typeOfLogin !== EMBEDDED_BROWSER_LOGIN_TYPE
  ) {
    throw new DiagnosticError(
      "This Moodle site is not configured for browser login.",
      [
        `Site: ${config.siteUrl}`,
        `Login type: ${config.typeOfLogin}`,
      ],
    );
  }

  const passport = createPassport();
  const launch = {
    siteUrl: config.siteUrl,
    passport,
    urlScheme,
  };
  return {
    launchUrl: buildMoodleBrowserSSOLaunchUrl({
      siteUrl: config.siteUrl,
      launchUrl: config.launchUrl,
      service: MOBILE_WS_SERVICE,
      passport,
      urlScheme,
    }),
    launch,
  };
}

export async function completeMoodleBrowserSSO(
  rawUrl: string,
  launch: MoodleBrowserSSOLaunch,
): Promise<MoodleConnection> {
  const tokenPayload = parseMoodleBrowserSSOToken(rawUrl, launch);
  const temporaryConnection: MoodleConnection = {
    moodleSiteUrl: tokenPayload.siteUrl,
    moodleUserId: 0,
    moodleMobileToken: tokenPayload.token,
    moodlePrivateToken: tokenPayload.privateToken,
  };
  const siteInfo = await getSiteInfo(temporaryConnection);

  return {
    moodleSiteUrl: normalizeSiteRoot(siteInfo.siteUrl || tokenPayload.siteUrl),
    moodleUserId: siteInfo.userId,
    moodleMobileToken: tokenPayload.token,
    moodlePrivateToken: tokenPayload.privateToken,
  };
}

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
    moodlePrivateToken: first.data.privatetoken,
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
  parsed.searchParams.set("offline", "1");
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

function parsePositiveInteger(raw: string | null, fieldName: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`QR link has invalid ${fieldName}.`);
  }
  return value;
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
