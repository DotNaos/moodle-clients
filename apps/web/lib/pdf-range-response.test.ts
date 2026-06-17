import { describe, expect, test } from "bun:test";

import { buildPDFRangeResponse } from "@/lib/pdf-range-response";

const encoder = new TextEncoder();

describe("PDF range responses", () => {
  test("returns the full PDF when no range is requested", async () => {
    const response = buildPDFRangeResponse(
      encoder.encode("abcdef").buffer,
      null,
      new Headers({ "content-type": "application/pdf" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("6");
    expect(await response.text()).toBe("abcdef");
  });

  test("serves explicit byte ranges with 206 headers", async () => {
    const response = buildPDFRangeResponse(
      encoder.encode("abcdef").buffer,
      "bytes=1-3",
      new Headers({ "content-type": "application/pdf" }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-3/6");
    expect(response.headers.get("content-length")).toBe("3");
    expect(await response.text()).toBe("bcd");
  });

  test("supports suffix and open-ended byte ranges", async () => {
    const suffix = buildPDFRangeResponse(encoder.encode("abcdef").buffer, "bytes=-2", new Headers());
    const openEnded = buildPDFRangeResponse(encoder.encode("abcdef").buffer, "bytes=4-", new Headers());

    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 4-5/6");
    expect(await suffix.text()).toBe("ef");
    expect(openEnded.status).toBe(206);
    expect(openEnded.headers.get("content-range")).toBe("bytes 4-5/6");
    expect(await openEnded.text()).toBe("ef");
  });

  test("falls back to the full PDF for invalid ranges", async () => {
    const response = buildPDFRangeResponse(encoder.encode("abcdef").buffer, "bytes=9-10", new Headers());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-length")).toBe("6");
    expect(await response.text()).toBe("abcdef");
  });
});
