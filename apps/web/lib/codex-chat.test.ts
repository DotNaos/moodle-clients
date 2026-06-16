import { describe, expect, test } from "bun:test";

import {
  buildMoodleContext,
  describePendingActions,
  materialCitation,
} from "@/lib/codex-chat";
import type { Course, Material } from "@/lib/dashboard-data";

describe("Codex chat Moodle context", () => {
  const course: Course = {
    id: "22584",
    fullname: "Deep Learning",
    categoryName: "FS26",
  };
  const material: Material = {
    id: "mod_resource_123",
    name: "Aufgabenblatt 01",
    courseId: "22584",
    fileType: "pdf",
  };

  test("adds exact citation links for course materials", () => {
    expect(materialCitation(material)).toBe(
      "[Aufgabenblatt 01](moodle-resource:22584:mod_resource_123)",
    );

    const context = buildMoodleContext({
      user: null,
      courses: [course],
      selectedCourse: course,
      materials: [material],
      selectedMaterial: material,
      pdfState: null,
    });

    expect(context.materials[0].citation).toBe(
      "[Aufgabenblatt 01](moodle-resource:22584:mod_resource_123)",
    );
    expect(context.selectedCourse?.citation).toBe("[Deep Learning](moodle-course:22584)");
  });

  test("describes requested UI actions as pending confirmations", () => {
    const rows = describePendingActions(
      [
        {
          type: "open_resource",
          courseId: "22584",
          resourceId: "mod_resource_123",
          reason: "User asked to open this PDF.",
        },
      ],
      [course],
      [material],
      "request-1",
    );

    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe("Ressource öffnen: Aufgabenblatt 01");
    expect(rows[0].reason).toBe("User asked to open this PDF.");
    expect(rows[0].requestId).toBe("request-1");
    expect(rows[0].showControls).toBe(true);
    expect(rows[0].status).toBe("pending");
  });
});
