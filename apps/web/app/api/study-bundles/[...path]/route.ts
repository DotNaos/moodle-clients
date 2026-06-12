import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

type StudyBundleManifest = {
  courseId: string;
  courseName: string;
  courseSlug: string;
  importedAt: string;
  script: {
    path: string;
    extractedPath: string;
  };
  tasks: Array<{
    id: string;
    path: string;
    solutionPath: string | null;
    solutionResourceId: string | null;
    solutionStatus: string;
    solutionTitle: string | null;
    sourceResourceId: string;
    sourceResourceTitle: string;
    title: string;
  }>;
  resources: Array<{
    kind: string;
    rawPath: string;
    resourceId: string;
    title: string;
  }>;
};

export const runtime = "nodejs";

const bundleRoot = process.env.STUDY_BUNDLES_ROOT?.trim()
  ? path.resolve(process.env.STUDY_BUNDLES_ROOT.trim())
  : path.resolve(process.cwd(), "study-bundles");

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  const parts = params.path ?? [];
  if (parts.length >= 3 && parts[0] === "courses" && parts[2] === "task-view") {
    return taskViewResponse(request, parts[1]);
  }
  if (parts.length >= 3 && parts[0] === "courses" && parts[2] === "asset") {
    return assetResponse(request, parts[1]);
  }
  return Response.json({ error: "Study bundle route not found" }, { status: 404 });
}

async function taskViewResponse(request: Request, courseId: string) {
  const bundle = await loadBundle(courseId);
  if (!bundle) {
    return Response.json({ error: "Study bundle not found" }, { status: 404 });
  }

  const includeScript = new URL(request.url).searchParams.get("includeScript") === "1";
  const scriptMarkdown = includeScript
    ? await readBundleMarkdown(bundle.dir, bundle.manifest.script.path, courseId)
    : "";

  const sheets = [];
  for (const task of bundle.manifest.tasks) {
    const taskMarkdown = await readBundleMarkdown(bundle.dir, task.path, courseId);
    const solutionMarkdown = task.solutionPath
      ? await readBundleMarkdown(bundle.dir, task.solutionPath, courseId).catch(() => "")
      : "";
    const taskBody = extractMainContent(taskMarkdown);
    sheets.push({
      resourceId: task.sourceResourceId,
      title: task.title,
      kind: "bundle-task",
      solutionResourceId: task.solutionResourceId ?? undefined,
      solutionTitle: task.solutionTitle ?? undefined,
      solutionMarkdown: solutionMarkdown ? extractMainContent(solutionMarkdown) : undefined,
      tasks: [
        {
          taskId: bundleTaskId(task),
          sourceResourceId: task.sourceResourceId,
          title: task.title,
          promptMarkdown: taskBody,
          parts: [],
          status: "open",
        },
      ],
    });
  }

  return Response.json({
    courseId: bundle.manifest.courseId || courseId,
    generatedAt: bundle.manifest.importedAt,
    scriptMarkdown,
    sheets,
    resources: bundle.manifest.resources.map((resource) => ({
      resourceId: resource.resourceId,
      title: resource.title,
      kind: resource.kind,
    })),
    progress: {
      open: sheets.length,
      done: 0,
      checked: 0,
      correct: 0,
      wrong: 0,
      needsReview: 0,
    },
    source: "study-bundle",
  });
}

async function assetResponse(request: Request, courseId: string) {
  const bundle = await loadBundle(courseId);
  if (!bundle) {
    return Response.json({ error: "Study bundle not found" }, { status: 404 });
  }
  const requested = new URL(request.url).searchParams.get("path");
  if (!requested) {
    return Response.json({ error: "Missing asset path" }, { status: 400 });
  }
  const assetPath = safeBundlePath(bundle.dir, requested);
  if (!assetPath) {
    return Response.json({ error: "Invalid asset path" }, { status: 400 });
  }
  const info = await stat(assetPath).catch(() => null);
  if (!info?.isFile()) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(assetPath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "cache-control": "private, max-age=3600",
      "content-type": contentTypeFor(assetPath),
    },
  });
}

async function loadBundle(courseId: string): Promise<{ dir: string; manifest: StudyBundleManifest } | null> {
  const entries = await readdir(bundleRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(bundleRoot, entry.name);
    const manifest = await readManifest(dir).catch(() => null);
    if (!manifest) continue;
    if (manifest.courseId === courseId || manifest.courseSlug === courseId || entry.name === courseId) {
      await traceBundleRuntimeFiles(dir);
      return { dir, manifest };
    }
  }
  return null;
}

function bundleTaskId(task: StudyBundleManifest["tasks"][number]): string {
  const sheetSlug = slugifyTaskId(task.title) || slugifyTaskId(task.id) || "task";
  return `task-${task.sourceResourceId}-${sheetSlug}`;
}

function slugifyTaskId(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function traceBundleRuntimeFiles(dir: string) {
  await Promise.all([
    readdir(path.join(dir, "assets"), { recursive: true }).catch(() => []),
    readdir(path.join(dir, "script"), { recursive: true }).catch(() => []),
    readdir(path.join(dir, "tasks"), { recursive: true }).catch(() => []),
  ]);
}

async function readManifest(dir: string): Promise<StudyBundleManifest> {
  return JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as StudyBundleManifest;
}

async function readBundleMarkdown(bundleDir: string, relativePath: string, courseId: string): Promise<string> {
  const filePath = safeBundlePath(bundleDir, relativePath);
  if (!filePath) {
    throw new Error(`Invalid bundle path: ${relativePath}`);
  }
  const markdown = await readFile(filePath, "utf8");
  return rewriteAssetLinks(stripFrontmatter(markdown), relativePath, courseId);
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function extractMainContent(markdown: string): string {
  return markdown
    .replace(/## Working Area[\s\S]*?(?=\n## Original Sources|\n# |$)/, "")
    .trim();
}

function rewriteAssetLinks(markdown: string, documentPath: string, courseId: string): string {
  return markdown.replace(/src="([^"]+)"/g, (match, rawSrc: string) => {
    if (/^(https?:)?\/\//.test(rawSrc) || rawSrc.startsWith("/api/")) {
      return match;
    }
    const assetPath = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), rawSrc));
    const assetUrl = `/api/study-bundles/courses/${encodeURIComponent(courseId)}/asset?path=${encodeURIComponent(assetPath)}`;
    return `src="${assetUrl}"`;
  });
}

function safeBundlePath(bundleDir: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(bundleDir, normalized);
  const root = path.resolve(bundleDir);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
