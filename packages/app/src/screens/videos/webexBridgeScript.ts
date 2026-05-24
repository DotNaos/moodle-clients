export function buildWebexNavigationGuardScript(): string {
    return `
      (function() {
        const WEBEX_LTI_LOGIN = "https://lti.webex.com/lti/login";
        const post = (payload) => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        };
        const isWebexLtiLoginAction = (action) => {
          try {
            const parsed = new URL(action, location.href);
            return parsed.origin + parsed.pathname === WEBEX_LTI_LOGIN;
          } catch (_) {
            return false;
          }
        };
        const openWebexLtiLoginAsGet = (form) => {
          if (!form || !isWebexLtiLoginAction(form.action)) return false;
          const url = new URL(form.action, location.href);
          Array.from(form.elements || []).forEach((field) => {
            if (field && field.name) url.searchParams.set(field.name, field.value || "");
          });
          // Webex leaves the mobile client on its login SPA without this LTI 1.3 new-window flag.
          url.searchParams.set("lti1p3_new_window", "1");
          post({
            type: "webex-bridge-page",
            host: location.hostname || "",
            path: location.pathname || "",
            queryKeys: [],
            title: document.title || "",
            hasMoodleGuest: false,
            hasMoodleEnrol: false,
            hasWebexUnableLaunch: false,
            hasWebexApplication: false,
            blockedMoodleAuth: false,
            blockedUrl: "lti-login-form-rewritten"
          });
          location.href = url.toString();
          return true;
        };
        const originalSubmit = window.HTMLFormElement && window.HTMLFormElement.prototype.submit;
        if (originalSubmit && !window.__studyReplayWebexSubmitGuarded) {
          window.__studyReplayWebexSubmitGuarded = true;
          window.HTMLFormElement.prototype.submit = function() {
            if (openWebexLtiLoginAsGet(this)) return undefined;
            return originalSubmit.apply(this, arguments);
          };
        }
        const guardForms = () => {
          Array.from(document.forms || []).forEach((form) => {
            if (!isWebexLtiLoginAction(form.action) || form.__studyReplayWebexGuarded) return;
            form.__studyReplayWebexGuarded = true;
            form.addEventListener("submit", (event) => {
              if (openWebexLtiLoginAsGet(form)) event.preventDefault();
            }, true);
            window.setTimeout(() => openWebexLtiLoginAsGet(form), 0);
          });
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", guardForms, true);
        } else {
          guardForms();
        }
        window.setTimeout(guardForms, 50);
        window.setTimeout(guardForms, 250);
        true;
      })();
    `;
}

export function buildWebexBridgeScript(
    courseId: number,
    courseTitle: string,
    courseFullName: string,
    courseShortName: string,
    loginUrl: string,
    loadId: number,
): string {
    return `
      (function() {
        const COURSE_ID = ${JSON.stringify(courseId)};
        const COURSE_TITLE = ${JSON.stringify(courseTitle)};
        const COURSE_FULL_NAME = ${JSON.stringify(courseFullName)};
        const COURSE_SHORT_NAME = ${JSON.stringify(courseShortName)};
        const LOAD_ID = ${JSON.stringify(loadId)};
        const LOGIN_URL = ${JSON.stringify(loginUrl)};
        const MAX_PAGES = 50;
        const MIN_DURATION_SECONDS = 60;
        const WEBEX_SITE = "fhgr.webex.com";
        const SITE_ID = "14682867";
        const APP_ORIGIN = "https://lti.webex.com";
        const MOODLE_HOST = "moodle.fhgr.ch";
        const post = (payload) => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        };
        const fail = (message) => post({ type: "webex-error", courseId: COURSE_ID, loadId: LOAD_ID, message: String(message || "Webex recordings could not be loaded.") });
        const diagnostic = (stage, details) => post({
          type: "webex-api-diagnostic",
          courseId: COURSE_ID,
          loadId: LOAD_ID,
          stage,
          ...(details || {})
        });
        const text = (value) => value === null || value === undefined ? "" : String(value).trim();
        const pageHints = () => {
          const body = text(document.body && document.body.innerText).toLowerCase();
          const queryKeys = [];
          try {
            const params = new URLSearchParams(location.search);
            params.forEach((_, key) => queryKeys.push(key));
            queryKeys.sort();
          } catch (_) {}
          return {
            type: "webex-bridge-page",
            courseId: COURSE_ID,
            loadId: LOAD_ID,
            host: location.hostname || "",
            path: location.pathname || "",
            queryKeys,
            title: text(document.title).slice(0, 120),
            hasMoodleGuest: body.includes("sie sind als gast angemeldet") || body.includes("guest"),
            hasMoodleEnrol: body.includes("einschreibeoptionen") || body.includes("enrolment options"),
            hasWebexUnableLaunch: body.includes("unable to launch") || body.includes("couldn't launch webex lti"),
            hasWebexApplication: location.origin === APP_ORIGIN && (location.pathname.includes("application") || body.includes("recordings"))
          };
        };
        const reportPage = () => post(pageHints());
        const firstText = (...values) => {
          for (const value of values) {
            const candidate = text(value);
            if (candidate) return candidate;
          }
          return "";
        };
        const numberValue = (...values) => {
          for (const value of values) {
            const parsed = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
            if (Number.isFinite(parsed)) return parsed;
          }
          return 0;
        };
        const valueAtPath = (root, path) => {
          let current = root;
          for (const part of path) {
            if (!current || typeof current !== "object") return "";
            current = current[part];
          }
          return text(current);
        };
        const itemsFrom = (payload) => {
          for (const key of ["items", "data", "meeting_sessions", "recordings"]) {
            if (Array.isArray(payload && payload[key])) return payload[key].filter((item) => item && typeof item === "object");
          }
          return [];
        };
        const hasNextPage = (payload, page) => {
          const pagination = payload && payload.pagination;
          if (pagination && typeof pagination === "object") {
            const perPage = numberValue(pagination.per_page, pagination.perPage);
            const total = numberValue(pagination.total_records, pagination.total, pagination.totalCount);
            if (perPage > 0 && total > 0) return page < Math.ceil(total / perPage);
          }
          for (const key of ["total_pages", "totalPages", "page_count", "pages"]) {
            if (numberValue(payload && payload[key]) > page) return true;
          }
          return Boolean(payload && (payload.has_more || payload.hasMore));
        };
        const csrfToken = () => {
          const node = document.querySelector('meta[name="csrf-token"], meta[name="csrfToken"], meta[name="_csrf"]');
          return node && node.getAttribute("content") || "";
        };
        const headers = () => {
          const csrf = csrfToken();
          return {
            Accept: "application/json, text/plain, */*",
            ...(csrf ? { "x-csrf-token": csrf } : {})
          };
        };
        const fetchJSON = async (url, init) => {
          const response = await fetch(url, {
            credentials: "include",
            referrer: APP_ORIGIN + "/application",
            ...(init || {}),
            headers: { ...headers(), ...((init && init.headers) || {}) }
          });
          const body = await response.text();
          let payload = null;
          try {
            payload = body ? JSON.parse(body) : {};
          } catch (_) {
            payload = {};
          }
          if (!response.ok) {
            diagnostic("http-error", {
              statusCode: response.status,
              message: body.slice(0, 180)
            });
            throw new Error("Webex API failed with HTTP " + response.status + ".");
          }
          diagnostic("http-ok", {
            statusCode: response.status,
            itemCount: itemsFrom(payload).length,
            message: Object.keys(payload || {}).slice(0, 8).join(",")
          });
          return payload;
        };
        const fetchPages = async (prefix, stage) => {
          const output = [];
          for (let page = 1; page <= MAX_PAGES; page += 1) {
            const payload = await fetchJSON(prefix + page);
            const items = itemsFrom(payload);
            output.push(...items);
            diagnostic(stage, {
              itemCount: items.length,
              totalCount: output.length,
              message: "page " + page
            });
            if (!hasNextPage(payload, page)) break;
          }
          return output;
        };
        const recordingDate = (name, ...candidates) => {
          for (const candidate of [...candidates, name]) {
            const value = text(candidate);
            const dashed = value.match(/^(\\d{4}-\\d{2}-\\d{2})/);
            if (dashed) return dashed[1];
            const compact = value.match(/(\\d{8})/);
            if (compact) return compact[1].slice(0, 4) + "-" + compact[1].slice(4, 6) + "-" + compact[1].slice(6, 8);
          }
          return "";
        };
        const uuidFrom = (value) => {
          const source = text(value);
          for (const pattern of [
            /recording\\/playback\\/([a-f0-9]{32})/i,
            /recording\\/playback\\/([a-f0-9-]{36})/i,
            /recording\\/([a-f0-9]{32})\\/playback/i,
            /recording\\/([a-f0-9-]{36})\\/playback/i,
            /playback\\/([a-f0-9]{32})/i,
            /playback\\/([a-f0-9-]{36})/i,
            /recording\\/([a-f0-9]{32})/i,
            /recording\\/([a-f0-9-]{36})/i,
            /(?:recordUUID|recordUuid|record_uuid|recordingUuid|recording_uuid|recordingId|recording_id|recordId|record_id)["'\\s:=]+([a-f0-9-]{32,36})/i
          ]) {
            const match = source.match(pattern);
            if (match) return (match[1] || "").replace(/-/g, "");
          }
          return "";
        };
        const rcidFrom = (value) => {
          try {
            const rcid = new URL(text(value), location.href).searchParams.get("RCID") || "";
            return /^[a-f0-9]{16,}$/i.test(rcid) ? rcid : "";
          } catch (_) {
            return "";
          }
        };
        const recordStringFromAnyField = (root) => {
          const seen = new Set();
          const visit = (value, depth) => {
            if (!value || depth > 4) return "";
            if (typeof value === "string") return uuidFrom(value);
            if (typeof value !== "object" || seen.has(value)) return "";
            seen.add(value);
            for (const entry of Object.values(value)) {
              const uuid = visit(entry, depth + 1);
              if (uuid) return uuid;
            }
            return "";
          };
          return visit(root, 0);
        };
        const safeUrlSummary = (value) => {
          const source = text(value);
          if (!source) return "";
          try {
            const parsed = new URL(source, location.href);
            return parsed.host + parsed.pathname;
          } catch (_) {
            return "[invalid-url]";
          }
        };
        const streamCandidateFrom = (root) => {
          const direct = firstText(
            valueAtPath(root, ["downloadRecordingInfo", "downloadInfo", "hlsURL"]),
            valueAtPath(root, ["downloadInfo", "hlsURL"]),
            valueAtPath(root, ["downloadRecordingInfo", "downloadInfo", "dashURL"]),
            valueAtPath(root, ["downloadInfo", "dashURL"]),
            valueAtPath(root, ["downloadRecordingInfo", "downloadInfo", "mp4URL"]),
            valueAtPath(root, ["downloadInfo", "mp4URL"]),
            root && root.hlsURL,
            root && root.hlsUrl,
            root && root.dashURL,
            root && root.dashUrl,
            root && root.mp4URL,
            root && root.mp4Url,
            root && root.streamUrl,
            root && root.streamURL,
            root && root.stream_url,
            root && root.hls_url,
            root && root.dash_url,
            root && root.mp4_url,
            root && root.playbackUrl,
            root && root.playbackURL,
            root && root.playback_url
          );
          if (direct) return direct;
          const seen = new Set();
          const visit = (value, depth) => {
            if (!value || depth > 4) return "";
            if (typeof value === "string") {
              const candidate = text(value);
              return /\\.m3u8(?:\\?|$)|\\.mpd(?:\\?|$)|\\.mp4(?:\\?|$)/i.test(candidate) ? candidate : "";
            }
            if (typeof value !== "object" || seen.has(value)) return "";
            seen.add(value);
            for (const entry of Object.values(value)) {
              const candidate = visit(entry, depth + 1);
              if (candidate) return candidate;
            }
            return "";
          };
          return visit(root, 0);
        };
        const streamUrlFrom = (info) => {
          return streamCandidateFrom(info);
        };
        const coverUrlFrom = (info) => {
          const download = info && (info.downloadRecordingInfo || info);
          const downloadInfo = download && download.downloadInfo || {};
          const url = text(downloadInfo.playerCoverURL || downloadInfo.coverUrl || downloadInfo.thumbnailUrl);
          if (!url) return null;
          try {
            const parsed = new URL(url);
            if (parsed.host.endsWith(".webex.com") && parsed.searchParams.has("ticket")) return null;
          } catch (_) {}
          return url;
        };
        const normalizeWord = (word) => {
          switch (word) {
            case "bank":
            case "banking":
            case "banks":
              return "banken";
            case "informatics":
              return "informatik";
            default:
              return word;
          }
        };
        const normalizeSearchText = (value) => text(value)
          .normalize("NFKD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/&amp;|&/g, " und ")
          .replace(/[^a-zA-Z0-9]+/g, " ")
          .toLowerCase()
          .trim()
          .split(" ")
          .map(normalizeWord)
          .join(" ")
          .trim();
        const isStopWord = (word) => ["and", "bei", "der", "des", "die", "for", "im", "in", "of", "the", "und"].includes(word);
        const isCourseCodeWord = (word) => /^(cds|dsc|dbm|wpm|fs|hs)$/.test(word) || /^(fs|hs)\\d{2}$/.test(word) || /^\\d+$/.test(word) || /^[a-z]+_\\d+$/.test(word);
        const contentWords = (value) => normalizeSearchText(value)
          .split(" ")
          .filter((word) => word.length > 1 && !isStopWord(word) && !isCourseCodeWord(word));
        const selectedCourseWords = Array.from(new Set(contentWords([COURSE_TITLE, COURSE_FULL_NAME, COURSE_SHORT_NAME].join(" "))));
        const textMatchesSelectedCourse = (value) => {
          const words = new Set(contentWords(value));
          if (selectedCourseWords.length === 0 || words.size === 0) return false;
          const matches = selectedCourseWords.filter((word) => words.has(word)).length;
          return matches >= Math.min(2, selectedCourseWords.length);
        };
        const sessionCourseId = (session) => firstText(session.courseId, session.course_id, session.contextId, session.context_id, session.lmsCourseId, session.lms_course_id);
        const sessionCourseName = (session) => firstText(session.courseName, session.course_name, session.contextTitle, session.context_title, session.contextName, session.context_name);
        const sessionMatchesSelectedCourse = (session) => {
          const sourceCourseId = sessionCourseId(session);
          if (sourceCourseId && sourceCourseId === String(COURSE_ID)) return true;
          return textMatchesSelectedCourse([sessionCourseName(session), session.title, session.name].join(" "));
        };
        const streamInfo = async (uuid, password) => {
          return fetchJSON("https://" + WEBEX_SITE + "/webappng/api/v1/recordings/" + encodeURIComponent(uuid) + "/stream?siteurl=fhgr", {
            headers: {
              clientType: "web",
              siteFullUrl: WEBEX_SITE,
              siteId: webexSiteId(),
              ...(password ? { accessPwd: password } : {})
            }
          });
        };
        const webexSiteId = () => {
          const match = String(document.cookie || "").match(/(?:^|;\\s*)[^=]*_(\\d{6,})=/);
          return match && match[1] ? match[1] : SITE_ID;
        };
        const resolveUuidFromSourceUrl = async (sourceUrl) => {
          if (!sourceUrl) return "";
          try {
            const response = await fetch(sourceUrl, {
              credentials: "include",
              headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
            });
            const body = await response.text();
            const fromResponseUrl = uuidFrom(response.url);
            const fromBody = uuidFrom(body);
            const resolved = firstText(fromResponseUrl, fromBody);
            diagnostic("recording-source-resolve", {
              statusCode: response.status,
              itemCount: resolved ? 1 : 0,
              totalCount: body.length,
              message: JSON.stringify({
                responseUrl: safeUrlSummary(response.url),
                fromResponseUrl: Boolean(fromResponseUrl),
                fromBody: Boolean(fromBody),
                resolvedLength: resolved.length,
                hasRecordUuidText: /recordUUID|recordUuid|recordingUuid|recordingId|recordId/i.test(body),
                hasPlaybackText: /recording\\/playback|playback/i.test(body),
                hasStreamText: /hlsURL|dashURL|mp4URL|stream/i.test(body),
                siteId: webexSiteId()
              })
            });
            return resolved;
          } catch (_) {
            return "";
          }
        };
        const maybeOpenMoodleLogin = () => {
          if (!LOGIN_URL) return false;
          if (location.hostname !== MOODLE_HOST) return false;
          const key = "studyReplayWebexLoginRedirected:" + COURSE_ID;
          if (window.sessionStorage && window.sessionStorage.getItem(key) === "1") return false;
          const body = (document.body && document.body.innerText || "").toLowerCase();
          const guestPage =
            body.includes("gäste können auf diesen kurs nicht zugreifen") ||
            body.includes("sie sind als gast angemeldet") ||
            body.includes("guests cannot access this course");
          if (!guestPage) return false;
          if (window.sessionStorage) window.sessionStorage.setItem(key, "1");
          location.href = LOGIN_URL;
          return true;
        };
        const collect = async () => {
          if (!COURSE_ID) return;
          if (maybeOpenMoodleLogin()) return;
          if (window.__studyReplayWebexPostedRecordings) return;
          if (window.__studyReplayWebexCollecting) return;
          if (location.origin !== APP_ORIGIN) return;
          window.__studyReplayWebexCollecting = true;
          try {
            const now = new Date();
            const end = (now.getFullYear() + 3) + "-12-31";
            const sessions = await fetchPages(APP_ORIGIN + "/api/webex/meeting_sessions?start_date=2015-01-01&end_date=" + end + "&with_recordings=true&page=", "meeting-sessions");
            const scopedSessions = sessions.filter(sessionMatchesSelectedCourse);
            const selectedSessions = scopedSessions.length > 0 ? scopedSessions : sessions;
            post({
              type: "webex-api-diagnostic",
              courseId: COURSE_ID,
              loadId: LOAD_ID,
              stage: "meeting-session-samples",
              statusCode: 0,
              itemCount: selectedSessions.length,
              totalCount: sessions.length,
              message: sessions.slice(0, 3).map((session) => ({
                title: text(session.title || session.name).slice(0, 120),
                courseId: sessionCourseId(session),
                courseName: sessionCourseName(session).slice(0, 120),
                matchedSelectedCourse: sessionMatchesSelectedCourse(session),
                startsAt: text(session.startTime || session.start_time || session.startedAt || session.started_at || session.scheduledStartTime || session.scheduled_start_time),
                createdAt: text(session.created_at || session.createTime || session.gmtCreateTime),
                keys: Object.keys(session || {}).sort().slice(0, 40).join(",")
              }))
            });
            diagnostic("meeting-session-scope", {
              itemCount: selectedSessions.length,
              totalCount: sessions.length,
              message: scopedSessions.length > 0 ? "matched-course-metadata" : "using-lti-session-scope"
            });
            const recordings = [];
            const dropCounts = {};
            const dropSamples = [];
            const addDrop = (reason, item, details) => {
              dropCounts[reason] = (dropCounts[reason] || 0) + 1;
              if (dropSamples.length < 5) {
                dropSamples.push({
                  reason,
                  keys: Object.keys(item || {}).sort().slice(0, 40).join(","),
                  url: safeUrlSummary(firstText(item && item.recording_url, item && item.recordingUrl, item && item.playbackUrl, item && item.playbackURL, item && item.url)),
                  ...(details || {})
                });
              }
            };
            for (const session of selectedSessions) {
              const sessionId = text(session.id || session.meetingSessionId);
              if (!sessionId) continue;
              const sessionTitle = firstText(session.title, session.name, "Webex");
              const sourceCourseId = sessionCourseId(session);
              const sourceCourseName = sessionCourseName(session);
              const items = await fetchPages(APP_ORIGIN + "/api/webex/meeting_sessions/" + encodeURIComponent(sessionId) + "/recordings?page=", "session-recordings");
              for (const item of items) {
                const duration = numberValue(item.duration, item.recordingDuration, item.durationSeconds);
                if (duration > 0 && duration < MIN_DURATION_SECONDS) {
                  addDrop("short-duration", item, { duration });
                  continue;
                }
                const sourceUrl = firstText(item.recording_url, item.recordingUrl, item.playback_url, item.playbackUrl, item.playbackURL, item.url, item.recordingLink, item.recording_link, item.recordingPlaybackUrl, item.recording_playback_url);
                let uuid = firstText(
                  item.recordUUID,
                  item.recordUuid,
                  item.record_uuid,
                  item.recordingUuid,
                  item.recording_uuid,
                  item.recordingId,
                  item.recording_id,
                  item.recordId,
                  item.record_id,
                  item.uuid,
                  uuidFrom(sourceUrl),
                  recordStringFromAnyField(item)
                );
                const password = firstText(item.accessPwd, item.access_pwd, item.password, item.recordingPassword, item.recording_password);
                let info = {};
                let streamUrl = streamCandidateFrom(item);
                if (uuid && !streamUrl) {
                  try {
                    info = await streamInfo(uuid, password);
                    streamUrl = streamUrlFrom(info);
                  } catch (error) {
                    const resolvedUuid = await resolveUuidFromSourceUrl(sourceUrl);
                    if (resolvedUuid && resolvedUuid !== uuid) {
                      try {
                        uuid = resolvedUuid;
                        info = await streamInfo(uuid, password);
                        streamUrl = streamUrlFrom(info);
                      } catch (secondError) {
                        addDrop("stream-info-error", item, {
                          uuidPresent: true,
                          resolvedUuidPresent: true,
                          message: secondError && secondError.message ? secondError.message : String(secondError)
                        });
                        continue;
                      }
                    } else {
                      addDrop("stream-info-error", item, {
                        uuidPresent: true,
                        resolvedUuidPresent: false,
                        message: error && error.message ? error.message : String(error)
                      });
                      continue;
                    }
                  }
                }
                if (!uuid && sourceUrl && !streamUrl) {
                  uuid = firstText(await resolveUuidFromSourceUrl(sourceUrl), rcidFrom(sourceUrl), item.id);
                  if (uuid) {
                    try {
                      info = await streamInfo(uuid, password);
                      streamUrl = streamUrlFrom(info);
                    } catch (error) {
                      addDrop("stream-info-error", item, {
                        uuidPresent: true,
                        resolvedFromSourceUrl: true,
                        message: error && error.message ? error.message : String(error)
                      });
                      continue;
                    }
                  }
                }
                if (!uuid && !streamUrl) {
                  addDrop("missing-uuid-and-stream", item);
                  continue;
                }
                if (!streamUrl) {
                  addDrop("missing-stream-url", item, { uuidPresent: Boolean(uuid) });
                  continue;
                }
                const name = firstText(item.name, item.recordName, item.record_name, item.recordingName, item.recording_name, sessionTitle);
                recordings.push({
                  recordingDate: recordingDate(name, item.created_at, item.createTime, item.create_time, item.gmtCreateTime, item.gmt_create_time),
                  recordingName: name,
                  streamUrl,
                  sourceUrl: sourceUrl || null,
                  recordingUuid: uuid || sourceUrl || name,
                  coverUrl: coverUrlFrom(info),
                  sessionTitle,
                  durationSeconds: duration > 0 ? duration : null,
                  sourceCourseId: sourceCourseId || undefined,
                  sourceCourseName: sourceCourseName || undefined
                });
              }
            }
            const droppedTotal = Object.values(dropCounts).reduce((sum, count) => sum + count, 0);
            diagnostic("recording-item-drops", {
              itemCount: recordings.length,
              totalCount: droppedTotal,
              message: JSON.stringify({ dropCounts, dropSamples })
            });
            window.__studyReplayWebexPostedRecordings = true;
            if (recordings.length === 0 && droppedTotal > 0) return;
            post({ type: "webex-recordings", courseId: COURSE_ID, loadId: LOAD_ID, recordings });
          } catch (error) {
            window.__studyReplayWebexCollecting = false;
            window.__studyReplayWebexCollectAttempts = (window.__studyReplayWebexCollectAttempts || 0) + 1;
            if (window.__studyReplayWebexCollectAttempts < 10 && location.origin === APP_ORIGIN) {
              post({
                type: "webex-bridge-page",
                courseId: COURSE_ID,
                loadId: LOAD_ID,
                host: location.hostname || "",
                path: location.pathname || "",
                queryKeys: [],
                title: text(document.title).slice(0, 120),
                hasMoodleGuest: false,
                hasMoodleEnrol: false,
                hasWebexUnableLaunch: false,
                hasWebexApplication: false,
                retryingWebexApi: true
              });
              setTimeout(collect, 750);
              return;
            }
            fail(error && error.message || error);
          }
        };
        setTimeout(reportPage, 250);
        setTimeout(collect, 100);
        true;
      })();
    `;
}
