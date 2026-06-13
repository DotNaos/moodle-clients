import { describe, expect, test } from "bun:test";

import { taskDisplayTitle } from "@/lib/study-outline";

describe("study-outline", () => {
  test("formats task title with sheet number", () => {
    expect(taskDisplayTitle("Aufgabenblatt 01", "Aufgabe 1")).toBe("Aufgabe 1.1");
    expect(taskDisplayTitle("Aufgabenblatt 4", "Aufgabe 1")).toBe("Aufgabe 4.1");
    expect(taskDisplayTitle("Aufgabenblatt 12", "Aufgabe 5")).toBe("Aufgabe 12.5");
  });

  test("handles task titles with leading zeros", () => {
    expect(taskDisplayTitle("Aufgabenblatt 01", "Aufgabe 01")).toBe("Aufgabe 1.1");
    expect(taskDisplayTitle("Aufgabenblatt 02", "Aufgabe 007")).toBe("Aufgabe 2.7");
  });

  test("handles task titles with additional text", () => {
    expect(taskDisplayTitle("Aufgabenblatt 03", "Aufgabe 2 (optional)")).toBe("Aufgabe 3.2 (optional)");
    expect(taskDisplayTitle("Aufgabenblatt 05", "Aufgabe 3: Implementierung")).toBe("Aufgabe 5.3: Implementierung");
  });

  test("returns original title if sheet title doesn't contain a number", () => {
    expect(taskDisplayTitle("Sheet", "Aufgabe 1")).toBe("Aufgabe 1");
    expect(taskDisplayTitle(null, "Aufgabe 1")).toBe("Aufgabe 1");
    expect(taskDisplayTitle(undefined, "Aufgabe 1")).toBe("Aufgabe 1");
  });

  test("returns original title if task title doesn't match pattern", () => {
    expect(taskDisplayTitle("Aufgabenblatt 01", "Task 1")).toBe("Task 1");
    expect(taskDisplayTitle("Aufgabenblatt 01", "Regular Title")).toBe("Regular Title");
    expect(taskDisplayTitle("Aufgabenblatt 01", "")).toBe("");
  });

  test("handles case-insensitive task titles", () => {
    expect(taskDisplayTitle("Aufgabenblatt 01", "AUFGABE 1")).toBe("Aufgabe 1.1");
    expect(taskDisplayTitle("Aufgabenblatt 01", "aufgabe 2")).toBe("Aufgabe 1.2");
  });

  test("handles empty sheet title", () => {
    expect(taskDisplayTitle("", "Aufgabe 1")).toBe("Aufgabe 1");
  });

  test("handles empty strings gracefully", () => {
    expect(taskDisplayTitle("", "")).toBe("");
  });
});

