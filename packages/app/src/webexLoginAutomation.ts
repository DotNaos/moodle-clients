export type WebexLoginCredentials = {
    readonly username: string;
    readonly password: string;
};

export function normalizeWebexLoginCredentials(
    value: Partial<WebexLoginCredentials> | null | undefined,
): WebexLoginCredentials | null {
    const username = value?.username?.trim() ?? '';
    const password = value?.password ?? '';
    if (!username || !password) {
        return null;
    }
    return { username, password };
}

export function buildWebexLoginAutomationScript(
    credentials: WebexLoginCredentials | null,
    targetUrl = '',
    loginEntryUrl = '',
    runId = 0,
): string {
    if (!credentials) {
        return 'true;';
    }

    return `
      (function() {
        const USERNAME = ${JSON.stringify(credentials.username)};
        const PASSWORD = ${JSON.stringify(credentials.password)};
        const TARGET_URL = ${JSON.stringify(targetUrl)};
        const LOGIN_ENTRY_URL = ${JSON.stringify(loginEntryUrl)};
        const RUN_ID = ${JSON.stringify(runId)};
        const POST_TYPE = "webex-login-automation";
        const startedAt = Date.now();
        const maxRuntimeMs = 18000;
        if (window.__studyReplayWebexLoginAutomationRunId === RUN_ID && window.__studyReplayWebexLoginAutomationActive) {
          return true;
        }
        window.__studyReplayWebexLoginAutomationRunId = RUN_ID;
        window.__studyReplayWebexLoginAutomationActive = true;
        let lastPageStatus = "";
        let lastPageStatusAt = 0;
        const post = (status, message) => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: POST_TYPE,
            status,
            message: String(message || ""),
            url: location.origin + location.pathname
          }));
        };
        const postPage = () => {
          const message = "Current page: " + pageLabel() + ".";
          const now = Date.now();
          const key = location.origin + location.pathname + ":" + message;
          if (key === lastPageStatus && now - lastPageStatusAt < 3500) return;
          lastPageStatus = key;
          lastPageStatusAt = now;
          post("page", message);
        };
        const loginAttemptKey = () => "studyReplayWebexLoginAttempts:" + RUN_ID + ":" + (LOGIN_ENTRY_URL || TARGET_URL || location.origin);
        const readStorage = (key) => {
          try {
            return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || "0";
          } catch (_) {
            return "0";
          }
        };
        const writeStorage = (key, value) => {
          try {
            window.localStorage.setItem(key, value);
          } catch (_) {}
          try {
            window.sessionStorage.setItem(key, value);
          } catch (_) {}
        };
        const loginAttemptCount = () => {
          try {
            return Number.parseInt(readStorage(loginAttemptKey()), 10) || 0;
          } catch (_) {
            return 0;
          }
        };
        const bumpLoginAttemptCount = () => {
          try {
            writeStorage(loginAttemptKey(), String(loginAttemptCount() + 1));
          } catch (_) {}
        };
        const text = (value) => value === null || value === undefined ? "" : String(value).trim();
        const lower = (value) => text(value).toLowerCase();
        const pageLabel = () => {
          const host = location.hostname || "unknown host";
          const body = lower(document.body && document.body.innerText);
          if (host === "aai-login.fhgr.ch" && body.includes("username") && body.includes("password")) return "FHGR username/password page";
          if (host === "aai-login.fhgr.ch" && body.includes("stale request")) return "stale FHGR request";
          if (host === "moodle.fhgr.ch") return "Moodle page";
          if (host === "lti.webex.com") return "Webex LTI page";
          if (host.endsWith("webex.com")) return "Webex page";
          return host;
        };
        const visible = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const usable = (node) => {
          if (!node || node.disabled) return false;
          const style = window.getComputedStyle(node);
          return style.visibility !== "hidden" && style.display !== "none";
        };
        const setValue = (node, value) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(node, value);
          else node.value = value;
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const scoreUsernameInput = (node) => {
          const source = lower([node.name, node.id, node.autocomplete, node.placeholder, node.getAttribute("aria-label")].join(" "));
          if (node.type === "password" || node.type === "hidden" || !usable(node)) return -1;
          if (/user|login|email|mail|account|name|e.?mail|benutzer|kennung/.test(source)) return 10;
          if (node.type === "email" || node.type === "text") return 4;
          return 0;
        };
        const findUsernameInput = () => {
          const fhgrUsername = document.querySelector("input[name='j_username'], input#username");
          if (fhgrUsername && usable(fhgrUsername)) return fhgrUsername;
          return Array.from(document.querySelectorAll("input"))
            .map((node) => ({ node, score: scoreUsernameInput(node) }))
            .filter((entry) => entry.score > 0)
            .sort((left, right) => right.score - left.score)[0]?.node || null;
        };
        const findPasswordInput = () => {
          const fhgrPassword = document.querySelector("input[name='j_password'], input#password");
          if (fhgrPassword && usable(fhgrPassword)) return fhgrPassword;
          return Array.from(document.querySelectorAll('input[type="password"]'))
            .find((node) => usable(node)) || null;
        };
        const submitForm = (passwordInput) => {
          const form = passwordInput?.form || document.querySelector("form");
          const submit = form
            ? Array.from(form.querySelectorAll('button, input[type="submit"]')).find((node) => usable(node))
            : null;
          if (form && location.hostname === "aai-login.fhgr.ch" && !form.querySelector("input[name='_eventId_proceed']")) {
            const proceed = document.createElement("input");
            proceed.type = "hidden";
            proceed.name = "_eventId_proceed";
            proceed.value = "Login";
            form.appendChild(proceed);
          }
          window.__studyReplayWebexLoginSubmitted = true;
          bumpLoginAttemptCount();
          post("submitted", "Credentials submitted.");
          if (submit) {
            submit.click();
            return;
          }
          if (form) {
            if (typeof form.requestSubmit === "function") form.requestSubmit();
            else form.submit();
          } else {
            passwordInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          }
        };
        const clickSchoolLogin = () => {
          if (location.hostname === "aai-login.fhgr.ch") return false;
          if (location.hostname === "moodle.fhgr.ch") return false;
          const candidates = Array.from(document.querySelectorAll("a, button, input[type='submit']"));
          const school = candidates.find((node) => {
            const label = lower([node.innerText, node.value, node.title, node.getAttribute("aria-label"), node.href].join(" "));
            return visible(node) && /(mit fhgr|fhgr-konto|graubünden login|graubuenden login|switch|aai|saml)/.test(label);
          });
          if (!school) return false;
          post("school-selected", "Opening FHGR login.");
          school.click();
          return true;
        };
        const selectAaiOrganisation = () => {
          const body = lower(document.body && document.body.innerText);
          const isAaiChooser =
            body.includes("aai login") ||
            body.includes("search your organisation") ||
            body.includes("login with");
          if (!isAaiChooser) return false;

          const organisationInput = Array.from(document.querySelectorAll("input"))
            .find((node) => {
              const label = lower([node.name, node.id, node.placeholder, node.getAttribute("aria-label")].join(" "));
              return node.type !== "hidden" && node.type !== "password" && usable(node) && /organisation|organization|login|search|institution/.test(label);
            });
          if (organisationInput && !window.__studyReplayWebexAaiSearchFilled) {
            window.__studyReplayWebexAaiSearchFilled = true;
            setValue(organisationInput, "Fachhochschule Graubünden");
            post("school-search", "Selecting FHGR organisation.");
            return true;
          }

          const organisationCandidates = Array.from(document.querySelectorAll("a, button, li, div[role='option'], div, span"))
            .filter(usable);
          const organisation = organisationCandidates.find((node) => {
            const label = lower([node.innerText, node.textContent, node.title, node.getAttribute("aria-label")].join(" "));
            return /fhgr|fachhochschule graubünden|fachhochschule graubuenden|university of applied sciences/.test(label);
          });
          if (organisation) {
            post("school-selected", "FHGR organisation selected.");
            organisation.click();
            return true;
          }

          if (window.__studyReplayWebexAaiSearchFilled) {
            const continueButton = Array.from(document.querySelectorAll("button, input[type='submit']"))
              .find((node) => usable(node) && /continue|weiter|fortfahren/.test(lower([node.innerText, node.value, node.title, node.getAttribute("aria-label")].join(" "))));
            if (continueButton) {
              post("school-selected", "Continuing FHGR organisation login.");
              continueButton.click();
              return true;
            }
          }

          return true;
        };
        const alreadyLoggedIn = () => {
          const body = lower(document.body && document.body.innerText);
          return (
            body.includes("sie sind bereits als") ||
            body.includes("sie müssen sich abmelden") ||
            body.includes("you are already logged in") ||
            body.includes("you are already authenticated")
          );
        };
        const clickProceed = () => {
          const candidates = Array.from(document.querySelectorAll("a, button, input[type='submit']"));
          const proceed = candidates.find((node) => {
            const label = lower([node.innerText, node.value, node.title, node.getAttribute("aria-label"), node.href].join(" "));
            return usable(node) && /proceed|continue|weiter|fortfahren/.test(label);
          });
          if (!proceed) return false;
          post("already-logged-in", "Continuing existing Moodle browser session.");
          proceed.click();
          return true;
        };
        const isStaleFhgrRequest = () => {
          const body = lower(document.body && document.body.innerText);
          return location.hostname === "aai-login.fhgr.ch" && body.includes("stale request");
        };
        const refreshStaleFhgrRequest = () => {
          if (!isStaleFhgrRequest()) return false;
          post("manual-required", "FHGR login session expired. Automatic login stopped to avoid repeated login requests.");
          return true;
        };
        const needsManual = () => {
          const body = lower(document.body && document.body.innerText);
          return (
            body.includes("multifaktor") ||
            body.includes("multi-factor") ||
            body.includes("two-factor") ||
            body.includes("authenticator")
          );
        };
        const shouldOpenMoodleTarget = () => {
          if (window.__studyReplayWebexOpenedMoodleTarget) return false;
          if (!TARGET_URL || location.hostname !== "moodle.fhgr.ch") return false;
          try {
            const target = new URL(TARGET_URL);
            if (location.pathname.startsWith("/mod/lti/")) return false;
            return location.origin + location.pathname !== target.origin + target.pathname;
          } catch (_) {
            return false;
          }
        };
        const attempt = () => {
          if (!USERNAME || !PASSWORD) return false;
          if (window.__studyReplayWebexLoginSubmitted) return true;
          postPage();
          if (refreshStaleFhgrRequest()) return true;
          if (alreadyLoggedIn() && clickProceed()) return true;
          if (alreadyLoggedIn() && TARGET_URL) {
            post("already-logged-in", "Opening Webex from the existing browser session.");
            window.__studyReplayWebexLoginSubmitted = true;
            location.href = TARGET_URL;
            return true;
          }
          if (shouldOpenMoodleTarget()) {
            post("moodle-target", "Opening Moodle course activity.");
            window.__studyReplayWebexOpenedMoodleTarget = true;
            location.href = TARGET_URL;
            return true;
          }
          if (needsManual()) {
            post("manual-required", "Manual login is required for this page.");
            return true;
          }
          if (selectAaiOrganisation()) return false;
          const usernameInput = findUsernameInput();
          const passwordInput = findPasswordInput();
          if (usernameInput && passwordInput) {
            if (loginAttemptCount() >= 1) {
              post("manual-required", "Automatic login already submitted once. Edit the login or continue manually to avoid repeated login requests.");
              return true;
            }
            setValue(usernameInput, USERNAME);
            setValue(passwordInput, PASSWORD);
            post("credentials-filled", "Credentials filled on " + pageLabel() + ".");
            submitForm(passwordInput);
            return true;
          }
          if (clickSchoolLogin()) return true;
          return false;
        };
        if (attempt()) return true;
        const timer = window.setInterval(function() {
          if (attempt()) {
            window.__studyReplayWebexLoginAutomationActive = false;
            window.clearInterval(timer);
            return;
          }
          if (Date.now() - startedAt > maxRuntimeMs) {
            window.__studyReplayWebexLoginAutomationActive = false;
            window.clearInterval(timer);
            post("manual-required", "Automatic login did not find a supported login form.");
          }
        }, 700);
        true;
      })();
    `;
}
