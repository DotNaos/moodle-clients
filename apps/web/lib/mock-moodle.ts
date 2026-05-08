import type { Course, Material, User } from "@/lib/dashboard-data";

export const mockUser: User = {
  id: "mock-user",
  displayName: "Mock Student",
  moodleSiteUrl: "https://moodle.mock.local",
  moodleUserId: 1001,
};

export const mockCourses: Course[] = [
  {
    id: "mock-hpc",
    fullname: "High Performance Computing",
    shortname: "(cds-110) FS26",
    categoryName: "FS26",
    viewUrl: "https://moodle.mock.local/course/view.php?id=mock-hpc",
  },
  {
    id: "mock-ds",
    fullname: "Einführung in Data Science",
    shortname: "(cds-1011) HS24",
    categoryName: "HS24",
    viewUrl: "https://moodle.mock.local/course/view.php?id=mock-ds",
  },
  {
    id: "mock-algo",
    fullname: "Algorithmen des wissenschaftlichen Rechnens",
    shortname: "(cds-116) FS26",
    categoryName: "FS26",
    viewUrl: "https://moodle.mock.local/course/view.php?id=mock-algo",
  },
];

export const mockMaterialsByCourseId: Record<string, Material[]> = {
  "mock-hpc": [
    {
      id: "mock-hpc-wide-slide",
      name: "Teil 04 (Update 23.04.26)",
      type: "resource",
      fileType: "PDF",
      sectionName: "Speichergekoppelte Systeme",
      courseId: "mock-hpc",
      uploadedAt: "2026-04-23T09:00:00.000Z",
      url: "/mock-pdfs/wide-slide.pdf",
    },
    {
      id: "mock-hpc-portrait",
      name: "Aufgabenblatt 09",
      type: "resource",
      fileType: "PDF",
      sectionName: "Uebungen",
      courseId: "mock-hpc",
      uploadedAt: "2026-04-14T09:00:00.000Z",
      url: "/mock-pdfs/portrait-text.pdf",
    },
  ],
  "mock-ds": [
    {
      id: "mock-ds-portrait",
      name: "Semesterinformation",
      type: "resource",
      fileType: "PDF",
      sectionName: "Allgemeine Informationen",
      courseId: "mock-ds",
      uploadedAt: "2025-09-01T09:00:00.000Z",
      url: "/mock-pdfs/portrait-text.pdf",
    },
  ],
  "mock-algo": [
    {
      id: "mock-algo-wide",
      name: "Klothoiden und Kombinationstechnik",
      type: "resource",
      fileType: "PDF",
      sectionName: "Aufgabenblaetter",
      courseId: "mock-algo",
      uploadedAt: "2026-03-05T09:00:00.000Z",
      url: "/mock-pdfs/wide-slide.pdf",
    },
  ],
};
