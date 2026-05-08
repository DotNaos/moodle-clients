"use client";

import type { Dispatch, SetStateAction } from "react";

import type { MoodleUIAction } from "@/lib/codex-actions";
import { writeDashboardCache } from "@/lib/dashboard-cache";
import type { Course, Material, User } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";

type UseCodexMoodleActionsInput = {
  courses: Course[];
  materials: Material[];
  materialsByCourseId: Record<string, Material[]>;
  selectedCategory: string;
  selectedCourseId: string | null;
  user: User | null;
  userId: string | null | undefined;
  pdfState: PDFViewState | null;
  loadMaterials: (courseId: string) => Promise<Material[]>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNavigationMode: Dispatch<SetStateAction<"courses" | "materials">>;
  setPDFScrollCommand: Dispatch<SetStateAction<PDFScrollCommand | null>>;
  setSelectedCourseId: Dispatch<SetStateAction<string | null>>;
  setSelectedMaterialId: Dispatch<SetStateAction<string | null>>;
};

export function useCodexMoodleActions({
  courses,
  materials,
  materialsByCourseId,
  selectedCategory,
  selectedCourseId,
  user,
  userId,
  pdfState,
  loadMaterials,
  setError,
  setNavigationMode,
  setPDFScrollCommand,
  setSelectedCourseId,
  setSelectedMaterialId,
}: UseCodexMoodleActionsInput) {
  async function applyCodexActions(actions: MoodleUIAction[]) {
    for (const action of actions) {
      if (action.type === "open_course") {
        await openCourse(action.courseId);
      } else if (action.type === "open_material") {
        await openMaterial(action.materialId, action.courseId ?? null);
      } else if (action.type === "open_moodle_course_page") {
        openMoodleCoursePage(action.courseId);
      } else if (action.type === "open_latest_pdf") {
        await openLatestPDF(action.courseId);
      } else if (action.type === "scroll_pdf_to_page") {
        scrollPDFToPage(action.page);
      }
    }
  }

  async function openCourse(courseId: string) {
    if (!courses.some((candidate) => String(candidate.id) === courseId)) {
      setError(`Codex tried to open an unknown course: ${courseId}`);
      return;
    }

    await loadMaterials(courseId);
  }

  async function openLatestPDF(courseId: string) {
    const course = courses.find((candidate) => String(candidate.id) === courseId);
    if (!course) {
      setError(`Codex tried to open an unknown course: ${courseId}`);
      return;
    }

    const targetMaterials = courseId !== selectedCourseId ? await loadMaterials(courseId) : materials;
    const pdf = selectLatestPDF(targetMaterials);
    if (!pdf) {
      setError(`Codex tried to open a PDF, but no PDF material was found in this course.`);
      return;
    }

    await openMaterial(pdf.id, courseId);
  }

  async function openMaterial(materialId: string, courseId: string | null) {
    const targetCourseId =
      courseId ??
      selectedCourseId ??
      Object.entries(materialsByCourseId).find(([, cachedMaterials]) =>
        cachedMaterials.some((material) => material.id === materialId),
      )?.[0] ??
      null;

    const targetMaterials = targetCourseId && targetCourseId !== selectedCourseId ? await loadMaterials(targetCourseId) : materials;
    const material = targetMaterials.find((candidate) => candidate.id === materialId);

    if (!material) {
      setError(`Codex tried to open an unknown material: ${materialId}`);
      return;
    }

    const finalCourseId = targetCourseId ?? String(material.courseId ?? selectedCourseId ?? "");
    if (finalCourseId) {
      setSelectedCourseId(finalCourseId);
      setNavigationMode("materials");
    }
    setSelectedMaterialId(material.id);

    if (userId) {
      const nextMaterialsByCourseId = finalCourseId
        ? { ...materialsByCourseId, [finalCourseId]: targetMaterials }
        : materialsByCourseId;
      writeDashboardCache(userId, {
        user,
        courses,
        materialsByCourseId: nextMaterialsByCourseId,
        selectedCourseId: finalCourseId || selectedCourseId,
        selectedCategory,
        selectedMaterialId: material.id,
      });
    }
  }

  function openMoodleCoursePage(courseId: string) {
    const course = courses.find((candidate) => String(candidate.id) === courseId);
    if (!course?.viewUrl) {
      setError(`Codex tried to open a Moodle page without a known URL: ${courseId}`);
      return;
    }

    window.open(course.viewUrl, "_blank", "noopener,noreferrer");
  }

  function scrollPDFToPage(page: number) {
    if (!pdfState) {
      setError("Codex tried to scroll a PDF, but no PDF is open.");
      return;
    }

    setPDFScrollCommand({ id: Date.now(), page });
  }

  return { applyCodexActions };
}

function selectLatestPDF(materials: Material[]): Material | null {
  const pdfs = materials.filter(isPDFMaterial);
  if (pdfs.length === 0) {
    return null;
  }

  return pdfs
    .map((material, index) => ({ material, score: materialRecencyScore(material, index) }))
    .sort((left, right) => right.score - left.score)[0]?.material ?? null;
}

function isPDFMaterial(material: Material): boolean {
  return [material.fileType, material.type, material.name, material.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes("pdf");
}

function materialRecencyScore(material: Material, index: number): number {
  const uploadedAt = material.uploadedAt ? Date.parse(material.uploadedAt) : Number.NaN;
  if (Number.isFinite(uploadedAt)) {
    return uploadedAt;
  }

  const numericParts = material.name.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  const lastNumber = numericParts.at(-1);
  if (typeof lastNumber === "number") {
    return lastNumber * 1_000 + index;
  }

  return index;
}
