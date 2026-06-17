export function buildPDFRangeResponse(
  body: ArrayBuffer,
  rangeHeader: string | null,
  headers: Headers,
): Response {
  const total = body.byteLength;
  const responseHeaders = new Headers(headers);
  responseHeaders.set("accept-ranges", "bytes");
  const range = parsePDFRange(rangeHeader, total);
  if (!range) {
    responseHeaders.delete("content-range");
    responseHeaders.set("content-length", String(total));
    return new Response(body, { status: 200, headers: responseHeaders });
  }
  const { start, end } = range;
  responseHeaders.set("content-range", `bytes ${start}-${end}/${total}`);
  responseHeaders.set("content-length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers: responseHeaders });
}

function parsePDFRange(
  rangeHeader: string | null,
  total: number,
): { start: number; end: number } | null {
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (!match) {
    return null;
  }
  const [, startText, endText] = match;
  let start: number;
  let end: number;
  if (startText === "") {
    const suffix = Number(endText);
    if (!endText || !Number.isFinite(suffix) || suffix <= 0) {
      return null;
    }
    start = Math.max(total - suffix, 0);
    end = total - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? total - 1 : Math.min(Number(endText), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return null;
  }
  return { start, end };
}
