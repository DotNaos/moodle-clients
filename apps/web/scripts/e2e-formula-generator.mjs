#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const screenshotPath = path.join(tmpdir(), `moodle-formula-e2e-${Date.now()}.png`);
const scriptScreenshotPath = path.join(tmpdir(), `moodle-script-e2e-${Date.now()}.png`);

const taskViewFixture = {
  courseId: "mock-hpc",
  generatedAt: "2026-06-04T10:00:00.000Z",
  resources: [
    { resourceId: "teil-01", title: "Teil 01", kind: "pdf" },
    { resourceId: "teil-02", title: "Teil 02", kind: "pdf" },
    { resourceId: "teil-03", title: "Teil 03", kind: "pdf" },
  ],
  sheets: [],
  progress: {
    checked: 0,
    correct: 0,
    done: 0,
    needsReview: 0,
    open: 0,
    started: 0,
    wrong: 0,
  },
  scriptMarkdown: [
    "# High Performance Computing",
    "",
    "High-Performance Computing (CDS-110)",
    "",
    "Source: [Teil 01](moodle-resource://teil-01), Source: [Teil 02](moodle-resource://teil-02), Source: [Teil 03](moodle-resource://teil-03)",
    "",
    "## PDF-Zuordnung",
    "",
    "01 Teil 01 - Bereiche: 1. General Remarks and Motivation; 2. From Bits and Bytes to Cache and Cores",
    "",
    "02 Teil 02 - Bereich: 3. Basics of Network Topologies",
    "",
    "03 Teil 03 - Bereich: 4. Fundamentals of Parallelisation",
    "",
    "## 1. General Remarks and Motivation",
    "",
    "### 1.1 Organisation and Examination",
    "",
    "- Written exam, 120 minutes.",
    "- Open book: notes and books are allowed.",
    "- Closed internet, no electronic devices.",
    "- Formula sheet rules must be inferred conservatively from the first course documents.",
    "",
    "## 4. Fundamentals of Parallelisation",
    "",
    "### 4.1 Objectives of Parallelisation",
    "",
    "Assume you have \\(p\\)-times more resources.",
    "- Goal: compute \\(p\\) independent problems simultaneously.",
    "  - Strategy: run \\(p\\) instances of the same sequential program.",
    "• - Goal: compute one problem in a fraction \\(1/p\\) of the time.",
    "",
    "Speedup is defined as \\(S_p = T_1 / T_p\\). Parallel efficiency is \\(E_p = S_p / p\\).",
    "",
    "Amdahl's law: \\(S_p = 1 / (f_s + (1 - f_s) / p)\\).",
    "",
    "For distributed reductions, the communication cost is often modeled as \\(T = \\alpha \\log p + \\beta n\\).",
  ].join("\n"),
};

const startedServer = [];

async function main() {
  const baseUrl = process.env.E2E_BASE_URL || await startNextDevServer();
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await findLocalBrowserExecutable();
  assert.ok(executablePath, "No local Chrome/Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH to run this e2e test.");

  const browser = await puppeteer.launch({
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { height: 1100, width: 1500 },
    executablePath,
    headless: true,
  });

  const pageErrors = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void handleInterceptedRequest(request);
    });

    await page.goto(`${baseUrl}/dev/mock`, { waitUntil: "networkidle0" });
    await waitForText(page, "Mock courses");

    await clickButtonByText(page, "Script");
    await waitForText(page, "Objectives of Parallelisation");
    await page.waitForSelector(".paper-markdown .katex", { timeout: 30_000 });
    await assertNoDoubleBulletListItems(page);
    await assertTextNotInsideListItem(page, "Assume you have");
    await page.screenshot({ fullPage: true, path: scriptScreenshotPath });

    await clickButtonByText(page, "Formelsammlung");
    await waitForText(page, "Noch keine Formelsammlung erstellt");
    await waitForText(page, "Teil 01");
    await waitForText(page, "Teil 02");
    await waitForText(page, "3 PDFs");

    await clickButtonByText(page, "Erstellen");
    await waitForText(page, "Formelsammlung direkt aus dem Script erstellt");
    await waitForText(page, "Speedup is defined");
    await waitForText(page, "Open book");
    await waitForText(page, "PDF-Zuordnung");
    await page.waitForSelector(".formula-body .katex", { timeout: 30_000 });

    await assertButtonEnabled(page, "PDF herunterladen");
    await assertButtonEnabled(page, "Drucken");

    await page.screenshot({ fullPage: true, path: screenshotPath });
    const exportResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/formula/export") && response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await clickButtonByText(page, "PDF herunterladen");
    const exportResponse = await exportResponsePromise;
    assert.equal(exportResponse.status(), 200, `PDF export returned ${exportResponse.status()}.`);
    assert.match(exportResponse.headers()["content-type"] ?? "", /application\/pdf/i);
    const pdfProbeResponse = await fetch(`${baseUrl}/api/formula/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markdown: "# High Performance Computing Formelsammlung\n\nSpeedup: \\(S_p = T_1 / T_p\\).",
        subtitle: "Generated from Moodle script and course PDFs.",
        title: "High Performance Computing Formelsammlung",
      }),
    });
    const pdfProbeBody = Buffer.from(await pdfProbeResponse.arrayBuffer());
    assert.equal(pdfProbeResponse.status, 200, `PDF probe returned ${pdfProbeResponse.status}: ${pdfProbeBody.toString("utf8").slice(0, 300)}`);
    assert.match(pdfProbeResponse.headers.get("content-type") ?? "", /application\/pdf/i);
    const pdfHeader = pdfProbeBody.subarray(0, 4).toString("utf8");
    assert.equal(pdfHeader, "%PDF", "Exported formula collection is not a PDF.");

    assert.deepEqual(pageErrors, [], `Browser page errors occurred:\n${pageErrors.join("\n")}`);
    assert.deepEqual(filterConsoleErrors(consoleErrors), [], `Browser console errors occurred:\n${consoleErrors.join("\n")}`);

    console.log(JSON.stringify({
      baseUrl,
      scriptScreenshotPath,
      screenshotPath,
      status: "passed",
    }, null, 2));
  } finally {
    await browser.close();
    await stopStartedServers();
  }
}

async function startNextDevServer() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  startedServer.push(child);

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      logs += `\nNext dev exited with code ${code}.`;
    }
  });

  await waitForServer(baseUrl, () => logs);
  return baseUrl;
}

async function handleInterceptedRequest(request) {
  const url = new URL(request.url());

  if (url.pathname === "/api/task-forge/courses/mock-hpc/task-view") {
    await request.respond({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(taskViewFixture),
    });
    return;
  }

  if (url.pathname === "/api/codex/run") {
    await request.respond({
      contentType: "application/json",
      status: 500,
      body: JSON.stringify({ error: "Codex failed before returning a result." }),
    });
    return;
  }

  await request.continue();
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    { timeout: 30_000 },
    text,
  );
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.replace(/\s+/g, " ").trim().includes(expected)),
    { timeout: 30_000 },
    text,
  );
  await page.evaluate((expected) => {
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().includes(expected));
    if (!button) {
      throw new Error(`Button not found: ${expected}`);
    }
    if (button.disabled) {
      throw new Error(`Button is disabled: ${expected}`);
    }
    button.click();
  }, text);
}

async function assertButtonEnabled(page, text) {
  const enabled = await page.evaluate((expected) => {
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().includes(expected));
    return Boolean(button && !button.disabled);
  }, text);
  assert.equal(enabled, true, `Expected enabled button: ${text}`);
}

async function assertNoDoubleBulletListItems(page) {
  const badItems = await page.evaluate(() => [...document.querySelectorAll(".paper-markdown li")]
    .map((item) => item.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((text) => /^[-*•–—]\s+/.test(text)));
  assert.deepEqual(badItems, [], `Found double-bulleted list items:\n${badItems.join("\n")}`);
}

async function assertTextNotInsideListItem(page, text) {
  const insideListItem = await page.evaluate((expected) => [...document.querySelectorAll(".paper-markdown li")]
    .some((item) => item.textContent?.includes(expected)), text);
  assert.equal(insideListItem, false, `Expected "${text}" to render as normal text, not a list item.`);
}

async function waitForServer(baseUrl, getLogs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/dev/mock`);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still booting.
    }
    await sleep(500);
  }
  throw new Error(`Next dev server did not start at ${baseUrl}.\n${getLogs()}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate a free local port."));
        }
      });
    });
  });
}

async function findLocalBrowserExecutable() {
  const candidates = [
    path.join(homedir(), ".agent-browser/browsers/chrome-147.0.7727.57/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next browser.
    }
  }
  return null;
}

async function stopStartedServers() {
  await Promise.all(startedServer.map(async (child) => {
    if (child.killed || child.exitCode !== null) {
      return;
    }
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(5_000).then(() => child.kill("SIGKILL")),
    ]);
  }));
}

function filterConsoleErrors(messages) {
  return messages.filter((message) => !/Download the React DevTools|Failed to load resource/i.test(message));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(async (error) => {
  await stopStartedServers();
  console.error(error);
  process.exitCode = 1;
});
