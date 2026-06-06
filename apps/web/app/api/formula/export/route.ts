import { renderFormulaDocumentHTML } from "@/lib/formula-renderer";

export const runtime = "nodejs";
export const maxDuration = 60;

type FormulaExportRequest = {
  markdown?: unknown;
  subtitle?: unknown;
  title?: unknown;
};

const DEFAULT_CHROMIUM_PACK_URL = "https://github.com/Sparticuz/chromium/releases/download/v143.0.0/chromium-v143.0.0-pack.x64.tar";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as FormulaExportRequest | null;
  const title = normalizeText(body?.title, "Formelsammlung").slice(0, 140);
  const subtitle = normalizeText(body?.subtitle, "Generated from Moodle course material.").slice(0, 220);
  const markdown = normalizeText(body?.markdown, "");

  if (!markdown.trim()) {
    return Response.json({ error: "No formula collection content provided." }, { status: 400 });
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(renderFormulaDocumentHTML({ markdown, subtitle, title }), {
      waitUntil: "load",
    });
    const pdf = await page.pdf({
      displayHeaderFooter: false,
      format: "A4",
      margin: {
        bottom: "14mm",
        left: "12mm",
        right: "12mm",
        top: "12mm",
      },
      printBackground: true,
      preferCSSPageSize: true,
    });

    return new Response(Buffer.from(pdf), {
      headers: {
        "content-disposition": `attachment; filename="${safeFilename(title)}.pdf"`,
        "content-type": "application/pdf",
      },
    });
  } finally {
    await browser.close();
  }
}

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  const localExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? await findLocalBrowserExecutable();
  const { default: chromium } = localExecutablePath
    ? await import("@sparticuz/chromium")
    : await import("@sparticuz/chromium-min");
  const executablePath = localExecutablePath
    ?? await chromium.executablePath(process.env.SPARTICUZ_CHROMIUM_PACK_URL ?? DEFAULT_CHROMIUM_PACK_URL);
  return puppeteer.launch({
    args: localExecutablePath ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    defaultViewport: { height: 1800, width: 1280 },
    executablePath,
    headless: true,
  });
}

async function findLocalBrowserExecutable(): Promise<string | null> {
  const { access } = await import("node:fs/promises");
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Hosted deployments usually do not have local browser apps.
    }
  }
  return null;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "formelsammlung";
}
