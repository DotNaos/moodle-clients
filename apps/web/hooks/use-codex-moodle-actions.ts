"use client";

import type { Dispatch, SetStateAction } from "react";

import type { MoodleUIAction } from "@/lib/codex-actions";
import { writeDashboardCache } from "@/lib/dashboard-cache";
import type { Course, Material, User } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";

export type CodexActionResult = {
  loadedResources: Array<{
    course: Course;
    resources: Material[];
  }>;
  loadedDocuments: LoadedMaterialDocument[];
};

export type LoadedMaterialDocument = {
  course: Course;
  material: Material;
  title: string;
  text: string;
  metadata?: Record<string, string>;
};

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
  onOpenMaterial: (courseId: string | null, materialId: string) => void;
  // Applies a status change that was already confirmed by the chat action card.
  onSetTaskStatus?: (taskId: string, status: "done" | "open") => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPDFScrollCommand: Dispatch<SetStateAction<PDFScrollCommand | null>>;
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
  onOpenMaterial,
  onSetTaskStatus,
  setError,
  setPDFScrollCommand,
}: UseCodexMoodleActionsInput) {
  async function applyCodexActions(
    actions: MoodleUIAction[],
  ): Promise<CodexActionResult> {
    const loadedResources = new Map<
      string,
      { course: Course; resources: Material[] }
    >();
    const loadedDocuments: LoadedMaterialDocument[] = [];

    for (const action of actions) {
      if (action.type === "open_course") {
        const resources = await openCourse(action.courseId);
        recordResources(loadedResources, action.courseId, resources);
      } else if (action.type === "open_material") {
        await openResource(
          action.courseId ?? selectedCourseId,
          action.materialId,
        );
      } else if (action.type === "open_resource") {
        await openResource(action.courseId, action.resourceId);
      } else if (action.type === "load_course_resources") {
        const resources = await loadCourseResources(action.courseId);
        recordResources(loadedResources, action.courseId, resources);
      } else if (action.type === "read_material_text") {
        const document = await readMaterialText(
          action.courseId,
          action.resourceId,
        );
        if (document) {
          loadedDocuments.push(document);
        }
      } else if (action.type === "open_moodle_course_page") {
        openMoodleCoursePage(action.courseId);
      } else if (action.type === "open_latest_pdf") {
        await openLatestPDF(action.courseId);
      } else if (action.type === "scroll_pdf_to_page") {
        scrollPDFToPage(action.page);
      } else if (action.type === "set_task_status") {
        if (onSetTaskStatus && action.taskId) {
          await onSetTaskStatus(
            action.taskId,
            action.status === "open" ? "open" : "done",
          );
        }
      }
    }

    return { loadedResources: [...loadedResources.values()], loadedDocuments };
  }

  async function openCourse(courseId: string): Promise<Material[]> {
    return loadCourseResources(courseId);
  }

  async function loadCourseResources(courseId: string): Promise<Material[]> {
    if (!courses.some((candidate) => String(candidate.id) === courseId)) {
      setError(`Codex tried to open an unknown course: ${courseId}`);
      return [];
    }

    return loadMaterials(courseId);
  }

  async function openLatestPDF(courseId: string) {
    const course = courses.find(
      (candidate) => String(candidate.id) === courseId,
    );
    if (!course) {
      setError(`Codex tried to open an unknown course: ${courseId}`);
      return;
    }

    const targetMaterials =
      courseId !== selectedCourseId ? await loadMaterials(courseId) : materials;
    const pdf = selectLatestPDF(targetMaterials);
    if (!pdf) {
      setError(
        `Codex tried to open a PDF, but no PDF material was found in this course.`,
      );
      return;
    }

    await openResource(courseId, pdf.id);
  }

  async function openResource(
    courseId: string | null | undefined,
    resourceId: string,
  ) {
    const targetCourseId =
      courseId ??
      selectedCourseId ??
      Object.entries(materialsByCourseId).find(([, cachedMaterials]) =>
        cachedMaterials.some((material) => material.id === resourceId),
      )?.[0] ??
      null;

    const shouldLoadTargetCourse =
      Boolean(targetCourseId) &&
      (targetCourseId !== selectedCourseId ||
        !materials.some((material) => material.id === resourceId));
    const targetMaterials =
      shouldLoadTargetCourse && targetCourseId
        ? await loadMaterials(targetCourseId)
        : materials;
    const material = targetMaterials.find(
      (candidate) => candidate.id === resourceId,
    );

    if (!material) {
      setError(`Codex tried to open an unknown resource: ${resourceId}`);
      return;
    }

    const finalCourseId =
      targetCourseId ?? String(material.courseId ?? selectedCourseId ?? "");
    onOpenMaterial(finalCourseId || null, material.id);

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

  async function readMaterialText(
    courseId: string,
    resourceId: string,
  ): Promise<LoadedMaterialDocument | null> {
    const course = courses.find(
      (candidate) => String(candidate.id) === courseId,
    );
    if (!course) {
      setError(`Codex tried to read an unknown course: ${courseId}`);
      return null;
    }

    const targetMaterials =
      courseId === selectedCourseId &&
      materials.some((material) => material.id === resourceId)
        ? materials
        : await loadMaterials(courseId);
    const material = targetMaterials.find(
      (candidate) => candidate.id === resourceId,
    );
    if (!material) {
      setError(`Codex tried to read an unknown resource: ${resourceId}`);
      return null;
    }

    const response = await fetch(
      `/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(resourceId)}/text`,
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        errorText.trim() ||
          `Material could not be loaded (${response.status}).`,
      );
    }
    const payload = (await response.json()) as {
      document?: {
        title?: string;
        text?: string;
        metadata?: Record<string, string>;
      };
    };
    const text = payload.document?.text?.trim() ?? "";
    if (!text) {
      throw new Error(
        `Material "${material.name}" was loaded, but no readable text was extracted.`,
      );
    }
    return {
      course,
      material,
      title: payload.document?.title?.trim() || material.name,
      text,
      metadata: payload.document?.metadata,
    };
  }

  function openMoodleCoursePage(courseId: string) {
    const course = courses.find(
      (candidate) => String(candidate.id) === courseId,
    );
    if (!course?.viewUrl) {
      setError(
        `Codex tried to open a Moodle page without a known URL: ${courseId}`,
      );
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

  function recordResources(
    loadedResources: Map<string, { course: Course; resources: Material[] }>,
    courseId: string,
    resources: Material[],
  ) {
    const course = courses.find(
      (candidate) => String(candidate.id) === courseId,
    );
    if (!course) {
      return;
    }
    loadedResources.set(courseId, { course, resources });
  }
}

function selectLatestPDF(materials: Material[]): Material | null {
  const pdfs = materials.filter(isPDFMaterial);
  if (pdfs.length === 0) {
    return null;
  }

  return (
    pdfs
      .map((material, index) => ({
        material,
        score: materialRecencyScore(material, index),
      }))
      .sort((left, right) => right.score - left.score)[0]?.material ?? null
  );
}

function isPDFMaterial(material: Material): boolean {
  return [material.fileType, material.type, material.name, material.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes("pdf");
}

function materialRecencyScore(material: Material, index: number): number {
  const uploadedAt = material.uploadedAt
    ? Date.parse(material.uploadedAt)
    : Number.NaN;
  if (Number.isFinite(uploadedAt)) {
    return uploadedAt;
  }

  const numericParts =
    material.name.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  const lastNumber = numericParts.at(-1);
  if (typeof lastNumber === "number") {
    return lastNumber * 1_000 + index;
  }

  return index;
}
