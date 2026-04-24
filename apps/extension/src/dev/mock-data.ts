import { type Course } from '@/domain/course'
import { type NavbarData } from '@/moodle/extract-navbar'
import { type CoursePageData } from '@/moodle/extract-course-page'
import { type LoginSelectData } from '@/moodle/extract-login-select'
import { type AaiLoginData } from '@/moodle/extract-aai-login'

// ── Navbar ──────────────────────────────────────────────

export const mockNavbarData: NavbarData = {
  userName: 'Oliver Müller',
  avatarUrl: 'https://i.pravatar.cc/80?u=oli',
  logoutUrl: '#logout',
  profileUrl: '#profile',
  notificationCount: 3,
}

// ── Courses ─────────────────────────────────────────────

function course(
  id: string,
  title: string,
  semester: string,
  opts: Partial<Course> = {},
): Course {
  const season = semester.slice(0, 2) as 'FS' | 'HS'
  const yearShort = semester.slice(2)
  const fullYear = 2000 + Number(yearShort)

  return {
    id,
    title,
    url: `#course/${id}`,
    imageUrl: `https://picsum.photos/seed/${id}/640/270`,
    area: opts.area ?? 'Multimedia Production',
    isFavorite: opts.isFavorite ?? false,
    progressText: opts.progressText ?? null,
    semesterRaw: semester,
    semester: {
      season,
      year: yearShort,
      fullYear,
      label: `${season}${yearShort}`,
      sortKey: fullYear * 10 + (season === 'FS' ? 1 : 2),
    },
    textContent: title,
    ...opts,
  }
}

export const mockCourses: Course[] = [
  // HS25 – aktuelles Semester
  course('101', 'User Experience Design HS25', 'HS25', {
    isFavorite: true,
    progressText: '72% abgeschlossen',
  }),
  course('102', 'Web Engineering HS25', 'HS25', {
    progressText: '45% abgeschlossen',
  }),
  course('103', 'Medienrecht HS25', 'HS25'),
  course('104', 'Data Visualization HS25', 'HS25', {
    area: 'Computational and Data Science',
    isFavorite: true,
  }),
  course('105', 'Projektarbeit 3 HS25', 'HS25', {
    progressText: '90% abgeschlossen',
  }),

  // FS25 – vorheriges Semester
  course('201', 'Interaction Design FS25', 'FS25', {
    progressText: '100% abgeschlossen',
  }),
  course('202', 'Videoproduktion FS25', 'FS25'),
  course('203', 'Statistik FS25', 'FS25', {
    area: 'Computational and Data Science',
    progressText: '100% abgeschlossen',
  }),

  // HS24 – älteres Semester
  course('301', 'Grundlagen Programmieren HS24', 'HS24', {
    progressText: '100% abgeschlossen',
  }),
  course('302', 'Einführung Multimedia Production HS24', 'HS24'),
  course('303', 'Kommunikationsdesign HS24', 'HS24', {
    isFavorite: true,
  }),

  // Ohne Semester
  course('900', 'MMP Infos & Organisatorisches', 'HS25', {
    semester: null,
    semesterRaw: null,
    area: 'Allgemein',
  }),
]

// ── Course Page ─────────────────────────────────────────

export const mockCoursePageData: CoursePageData = {
  title: 'User Experience Design HS25',
  heroImageUrl: 'https://picsum.photos/seed/uxd-hero/1600/600',
  breadcrumbs: [
    { label: 'Startseite', url: '#' },
    { label: 'Meine Kurse', url: '#' },
    { label: 'User Experience Design HS25', url: null },
  ],
  sections: [
    {
      id: 'sec-0',
      title: 'Allgemeine Informationen',
      number: '0',
      anchorId: 'section-0',
      url: null,
      summaryHtml:
        '<p>Willkommen im Kurs <strong>User Experience Design</strong>. Hier finden Sie alle relevanten Unterlagen und Aufgaben.</p>',
      activities: [
        {
          id: 'act-01',
          title: 'Kursübersicht',
          url: '#act-01',
          type: 'page',
          details: null,
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-02',
          title: 'Forum: Fragen & Antworten',
          url: '#act-02',
          type: 'forum',
          details: '12 Beiträge',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
      ],
    },
    {
      id: 'sec-1',
      title: 'Woche 1 – Einführung UX Research',
      number: '1',
      anchorId: 'section-1',
      url: null,
      summaryHtml:
        '<p>Grundlagen der UX-Forschung: Interviews, Umfragen und Beobachtungen.</p>',
      activities: [
        {
          id: 'act-10',
          title: 'Vorlesungsfolien Woche 1',
          url: '#act-10',
          type: 'PDF',
          details: '2.4 MB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-11',
          title: 'Leseauftrag: Don Norman – Design of Everyday Things',
          url: '#act-11',
          type: 'url',
          details: 'Externer Link',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-12',
          title: 'Übung 1: Nutzer-Interview durchführen',
          url: '#act-12',
          type: 'assign',
          details: 'Abgabe bis 20. Oktober',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
      ],
    },
    {
      id: 'sec-2',
      title: 'Woche 2 – Personas & User Journeys',
      number: '2',
      anchorId: 'section-2',
      url: null,
      summaryHtml: null,
      activities: [
        {
          id: 'act-20',
          title: 'Hinweise zur Gruppenarbeit',
          url: null,
          type: 'label',
          details: null,
          isLabel: true,
          imageUrl: null,
          bodyHtml:
            '<p>Bildet <strong>3er-Gruppen</strong> und meldet euch im Forum an. Die Gruppen erarbeiten gemeinsam Personas.</p>',
        },
        {
          id: 'act-21',
          title: 'Vorlesungsfolien Woche 2',
          url: '#act-21',
          type: 'PDF',
          details: '3.1 MB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-22',
          title: 'Template: Persona-Canvas',
          url: '#act-22',
          type: 'PDF',
          details: '420 KB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-23',
          title: 'Video: User Journey Mapping erklärt',
          url: '#act-23',
          type: 'video',
          details: '14:32 Min.',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
      ],
    },
    {
      id: 'sec-3',
      title: 'Woche 3 – Wireframing & Prototyping',
      number: '3',
      anchorId: 'section-3',
      url: null,
      summaryHtml:
        '<p>Vom Low-Fidelity Wireframe zum interaktiven Prototyp mit Figma.</p>',
      activities: [
        {
          id: 'act-30',
          title: 'Vorlesungsfolien Woche 3',
          url: '#act-30',
          type: 'PDF',
          details: '4.7 MB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-31',
          title: 'Figma-Tutorial: Components & Auto Layout',
          url: '#act-31',
          type: 'url',
          details: 'figma.com',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-32',
          title: 'Übung 2: Wireframe abgeben',
          url: '#act-32',
          type: 'assign',
          details: 'Abgabe bis 3. November',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-33',
          title: 'Referenzmaterial',
          url: '#act-33',
          type: 'folder',
          details: '8 Dateien',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
      ],
    },
    {
      id: 'sec-4',
      title: 'Woche 4 – Usability Testing',
      number: '4',
      anchorId: 'section-4',
      url: null,
      summaryHtml:
        '<p>Methoden und Durchführung von Usability Tests. Think-Aloud-Protokoll und heuristische Evaluation.</p>',
      activities: [
        {
          id: 'act-40',
          title: 'Vorlesungsfolien Woche 4',
          url: '#act-40',
          type: 'PDF',
          details: '2.9 MB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-41',
          title: 'Quiz: Usability Heuristiken (Nielsen)',
          url: '#act-41',
          type: 'quiz',
          details: '10 Fragen · 15 Min.',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
        {
          id: 'act-42',
          title: 'Checkliste: Test-Setup',
          url: '#act-42',
          type: 'PDF',
          details: '180 KB',
          isLabel: false,
          imageUrl: null,
          bodyHtml: null,
        },
      ],
    },
  ],
}

// ── Login Select ────────────────────────────────────────

export const mockLoginSelectData: LoginSelectData = {
  shibbolethUrl: '#shibboleth',
  wayfAction: null,
  manualAction: '#manual-login',
  manualHiddenFields: [
    { name: 'logintoken', value: 'mock-token-123' },
  ],
  forgotPasswordUrl: '#forgot-password',
}

// ── AAI Login ───────────────────────────────────────────

export const mockAaiLoginData: AaiLoginData = {
  action: '#aai-submit',
  hiddenFields: [
    { name: 'csrf_token', value: 'mock-csrf-456' },
  ],
  usernamePlaceholder: 'Anmeldename',
  passwordPlaceholder: 'Passwort',
  supportUrl: '#support',
  revokeConsentLabel: 'Einwilligung zur Weitergabe von Attributen widerrufen',
  revokeConsentChecked: false,
}
