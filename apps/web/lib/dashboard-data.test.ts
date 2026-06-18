import { describe, expect, test } from "bun:test";

import { courseImageUrl, type Course } from "@/lib/dashboard-data";

describe("dashboard course images", () => {
  test("keeps Moodle SVG data URLs from the hero image field", () => {
    const svgDataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    const course: Course = {
      heroImage: svgDataUrl,
      id: 22577,
    };

    expect(courseImageUrl(course)).toBe(svgDataUrl);
  });

  test("uses the first non-empty Moodle image field", () => {
    const svgDataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    const course: Course = {
      courseimage: svgDataUrl,
      heroImage: "",
      id: 22577,
      shortname: "cds-305",
    };

    expect(courseImageUrl(course)).toBe(svgDataUrl);
  });

  test("routes imported service course images through the web proxy", () => {
    const course: Course = {
      heroImage: "/api/course-images/22577?v=abc123",
      id: 22577,
    };

    expect(courseImageUrl(course)).toBe("/api/moodle/course-images/22577?v=abc123");
  });

  test("returns null when Moodle returns no image", () => {
    const course: Course = {
      fullname: "Data Science und Informatik bei Banken",
      heroImage: "",
      id: 22577,
    };

    expect(courseImageUrl(course)).toBeNull();
  });
});
