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
  visible: number;
};

export type MoodleCourseSection = {
  id?: number;
  name: string;
  summary?: string;
  modules: MoodleCourseModule[];
};

export type MoodleCourseModule = {
  id?: number;
  name: string;
  modname?: string;
  url?: string;
  description?: string;
  contents: MoodleCourseFile[];
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
  };
  exception?: {
    message?: string;
    errorcode?: string;
  };
}>;

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
    parsed = new URL(trimmed.slice(MOODLE_MOBILE_SCHEME.length));
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

export async function exchangeQRToken(link: MobileQRLink): Promise<MoodleConnection> {
  const endpoint = new URL(
    `/lib/ajax/service-nologin.php?info=${MOBILE_QR_TOKEN_FUNCTION}&lang=de_ch`,
    link.siteUrl,
  );

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
  });

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
    logDevError("QR token exchange network failure", error, {
      endpoint: endpoint.toString(),
      siteUrl: link.siteUrl,
      userId: link.userId,
    });
    throw new Error("Could not reach Moodle for QR token exchange.");
  }

  if (!response.ok) {
    const body = await readResponsePreview(response);
    logDevError("QR token exchange HTTP failure", new Error(`HTTP ${response.status}`), {
      endpoint: endpoint.toString(),
      status: response.status,
      responseBody: body,
    });
    throw new Error(`QR token exchange failed with HTTP ${response.status}.`);
  }

  let parsed: QRTokenExchangeResponse;
  try {
    const responseText = await response.text();
    logDevInfo("QR token exchange response", {
      endpoint: endpoint.toString(),
      responseBody: responseText,
    });
    parsed = JSON.parse(responseText) as QRTokenExchangeResponse;
  } catch (error) {
    logDevError("QR token exchange invalid JSON", error, {
      endpoint: endpoint.toString(),
    });
    throw new Error("QR token exchange returned invalid JSON.");
  }

  const first = parsed[0];
  if (!first || first.error || !first.data?.token) {
    logDevError("QR token exchange rejected", new Error(getQRExchangeErrorMessage(first)), {
      endpoint: endpoint.toString(),
      moodleResult: sanitizeForLog(first),
    });
    throw new Error(getQRExchangeErrorMessage(first));
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

export async function getCourses(connection: MoodleConnection): Promise<MoodleCourse[]> {
  const raw = await callMoodleApi(connection, "core_enrol_get_users_courses", {
    userid: String(connection.moodleUserId),
  });

  if (!Array.isArray(raw)) {
    throw new Error("Courses response is invalid.");
  }

  return raw.map((item) => {
    const record = asRecord(item, "course");
    return {
      id: requireNumber(record.id, "course.id"),
      fullName: requireString(record.fullname, "course.fullname"),
      shortName: requireString(record.shortname, "course.shortname"),
      categoryId: typeof record.category === "number" ? record.category : undefined,
      categoryName:
        getOptionalString(record.categoryname) ??
        getOptionalString(record.categoryName) ??
        getOptionalString(record.categorysortorder) ??
        "Other courses",
      visible: requireNumber(record.visible, "course.visible"),
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
    throw new Error("Course contents response is invalid.");
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

  const body = new URLSearchParams();
  body.set("wstoken", connection.moodleMobileToken);
  body.set("wsfunction", functionName);
  Object.entries(params).forEach(([key, value]) => {
    body.set(key, value);
  });

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
    throw new Error("Could not reach Moodle.");
  }

  if (!response.ok) {
    const responseBody = await readResponsePreview(response);
    logDevError("Moodle API HTTP failure", new Error(`HTTP ${response.status}`), {
      endpoint: endpoint.toString(),
      functionName,
      status: response.status,
      responseBody,
    });
    throw new Error(`Moodle API failed with HTTP ${response.status}.`);
  }

  let parsed: unknown;
  try {
    const responseText = await response.text();
    parsed = JSON.parse(responseText);
  } catch (error) {
    logDevError("Moodle API invalid JSON", error, {
      endpoint: endpoint.toString(),
      functionName,
    });
    throw new Error("Moodle API returned invalid JSON.");
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
    });
    throw new Error(message || "Moodle API rejected the request.");
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
    .replace(/moodlemobile:\/\/\S+/gi, "[redacted]")
    .replace(/\b(qrlogin|privatetoken|wstoken|token)=([^&\s]+)/gi, "$1=[redacted]");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is invalid.`);
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
    throw new Error(`${fieldName} is invalid.`);
  }

  return value;
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
