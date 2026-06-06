# High Performance Computing Manual Pipeline Dry Run

This document records a manual classification pass through the Moodle course
`High Performance Computing` (`22584`, `(cds-110) FS26`).

The purpose is not to generate the final script yet. The purpose is to learn how
the pipeline should classify real Moodle material before we automate it.

## Finishing Criteria For This Pass

- Read the real Moodle course page, not only the file list.
- Include every visible Moodle activity type, including links and tools.
- Inspect the PDF text output for all Moodle file resources.
- Separate lectures, assignments, solutions, links, forums, tools, and labels.
- Decide how assignment sheets and solutions should appear in the task tree.
- Record where the current Moodle file listing is insufficient.

## Main Correction

The first naive pass was too file-list driven.

`moodle list files 22584 --json` returns 29 items, but the real Moodle page has
more visible activities:

```text
All visible Moodle activities: 56
├─ file resources: 29
├─ URL links: 4
├─ forums: 3
├─ external tools: 1
└─ labels / text blocks: 19
```

So the source set must not be called "all Moodle files". It needs to be:

```text
U_M = all Moodle course activities
```

Then we derive subsets:

```text
U_V = lecture PDFs and lecture-like source material
U_A = assignment sheets
U_S = solution artifacts
U_R = reference/support resources such as links, forums, tools, and labels
```

## Complete Moodle Activity Inventory

The course page has seven Moodle sections. The earlier model missed the
`Allgemeine Informationen` section because it contains mostly non-file
activities.

```text
High Performance Computing
├─ Allgemeine Informationen
│  ├─ forum: Nachrichten
│  ├─ url: Modulbeschreibungen
│  ├─ url: Semesterinformation
│  ├─ url: Anleitung GPU-Server
│  ├─ forum: Ankündigungen
│  ├─ forum: Diskussionsforum
│  ├─ label: text block
│  └─ lti: Webex
│
├─ Einführung
│  ├─ labels: Lernziele / Präsenz / Selbststudium
│  ├─ lecture_pdf: Teil 01
│  ├─ assignment_sheet: Aufgabenblatt 01
│  ├─ solution_pdf: Aufgabenblatt 01 -- Lösung
│  ├─ assignment_sheet: Aufgabenblatt 02
│  └─ solution_pdf: Aufgabenblatt 02 -- Lösung
│
├─ Netztopologien
│  ├─ labels: Lernziele / Präsenz / Selbststudium
│  ├─ lecture_pdf: Teil 02
│  ├─ assignment_sheet: Aufgabenblatt 03
│  ├─ solution_pdf: Aufgabenblatt 03 -- Lösung
│  ├─ assignment_sheet: Aufgabenblatt 04
│  ├─ solution_pdf: Aufgabenblatt 04 -- Lösung
│  ├─ assignment_sheet: Aufgabenblatt 05
│  └─ solution_pdf: Aufgabenblatt 05 -- Lösung
│
├─ Grundlagen der Parallelisierung
│  ├─ labels: Lernziele / Präsenz / Selbststudium
│  ├─ lecture_pdf: Teil 03
│  ├─ assignment_sheet: Aufgabenblatt 06
│  ├─ solution_pdf: Aufgabenblatt 06 -- Lösung
│  ├─ assignment_sheet: Aufgabenblatt 07
│  ├─ solution_pdf: Aufgabenblatt 07 -- Lösung
│  ├─ assignment_sheet: Aufgabenblatt 08
│  └─ solution_pdf: Aufgabenblatt 08 -- Lösung
│
├─ Nachrichtengekoppelte Systeme
│  ├─ labels: Lernziele / Präsenz / Selbststudium
│  ├─ lecture_pdf: Teil 04 (Update 23.04.26)
│  ├─ support_link: Zugang zum CDS-Cluster
│  ├─ assignment_sheet: Aufgabenblatt 09
│  ├─ assignment_sheet: Aufgabenblatt 10
│  └─ solution_pdf: Aufgabenblatt 10 -- Lösung
│
├─ Speichergekoppelte Systeme
│  ├─ labels: Lernziele / Präsenz / Selbststudium
│  ├─ lecture_pdf: Teil 05
│  ├─ assignment_sheet: Aufgabenblatt 11
│  └─ solution_pdf: Aufgabenblatt 11 -- Lösung
│
└─ Ausblick: Anwendungen
   ├─ labels: Lernziele / Präsenz / Selbststudium
   ├─ lecture_pdf: Teil 06
   ├─ assignment_sheet: Aufgabenblatt 12
   └─ solution_pdf: Aufgabenblatt 12 -- Lösung
```

## Labels

Use labels that describe the role in the generated course model, not only the
Moodle type.

```text
lecture_pdf
  A PDF that should feed the lecture/script tree.

assignment_sheet
  A PDF that defines exercises.

solution_pdf
  A PDF that belongs to an assignment sheet as a solution artifact.

support_link
  A link that supports a lecture/task workflow but is not itself lecture text.

course_info_link
  A link about module organization, semester information, or infrastructure.

communication
  Forum-like activity.

meeting_tool
  Webex or similar external teaching tool.

section_label
  Moodle text block such as Lernziele, Präsenz, or Selbststudium.

missing_solution
  Explicit placeholder when an assignment sheet has no matching solution.

low_ocr_solution
  A solution artifact whose text extraction is weak and should be treated
  image-first.
```

## PDF Classification

All 29 Moodle file resources were inspected with PDF text extraction. The
assignment sheets have useful text. The solution PDFs are mostly scanned or
handwritten and have weak OCR.

| Moodle ID | Section | File | Label | Inspected content |
| --- | --- | --- | --- | --- |
| `947709` | Einführung | Teil 01 | `lecture_pdf` | Course setup plus real technical introduction: architecture models, HPC motivation, memory hierarchy, cache, roofline, parallel performance model. |
| `947711` | Einführung | Aufgabenblatt 01 | `assignment_sheet` | Speicherzugriffe and roofline model. |
| `947712` | Einführung | Aufgabenblatt 01 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 01; OCR is noisy. |
| `947713` | Einführung | Aufgabenblatt 02 | `assignment_sheet` | Leistungsbemessung, Amdahl, speed-up, efficiency. |
| `947714` | Einführung | Aufgabenblatt 02 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 02; OCR is noisy. |
| `947717` | Netztopologien | Teil 02 | `lecture_pdf` | Definitions, static topologies, dynamic topologies, examples. |
| `947719` | Netztopologien | Aufgabenblatt 03 | `assignment_sheet` | Netztopologien I: diameter, bisection width, costs. |
| `947720` | Netztopologien | Aufgabenblatt 03 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 03; OCR is noisy. |
| `947721` | Netztopologien | Aufgabenblatt 04 | `assignment_sheet` | Netztopologien II: grid paths, hypercube paths, pyramid topology. |
| `947722` | Netztopologien | Aufgabenblatt 04 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 04; OCR is noisy. |
| `947723` | Netztopologien | Aufgabenblatt 05 | `assignment_sheet` | Netztopologien III: Beneš network and dynamic topology routing. |
| `947724` | Netztopologien | Aufgabenblatt 05 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 05; OCR is noisy. |
| `947727` | Grundlagen der Parallelisierung | Teil 03 | `lecture_pdf` | Terms, dependence analysis, process interaction, synchronization, load balancing. |
| `947729` | Grundlagen der Parallelisierung | Aufgabenblatt 06 | `assignment_sheet` | Parallelisierungsstrategien for matrix transposition. |
| `947730` | Grundlagen der Parallelisierung | Aufgabenblatt 06 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 06; OCR is noisy. |
| `947731` | Grundlagen der Parallelisierung | Aufgabenblatt 07 | `assignment_sheet` | Synchronisation. |
| `947732` | Grundlagen der Parallelisierung | Aufgabenblatt 07 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 07; OCR is noisy. |
| `947733` | Grundlagen der Parallelisierung | Aufgabenblatt 08 | `assignment_sheet` | Lastbalanzierung and synchronization. |
| `947734` | Grundlagen der Parallelisierung | Aufgabenblatt 08 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 08; OCR is weak. |
| `947737` | Nachrichtengekoppelte Systeme | Teil 04 (Update 23.04.26) | `lecture_pdf` | Message passing, collectives, MPI programming. |
| `947739` | Nachrichtengekoppelte Systeme | Aufgabenblatt 09 | `assignment_sheet` | MPI-Programmierung I: 2D torus summation and broadcast. |
| `947740` | Nachrichtengekoppelte Systeme | Aufgabenblatt 10 | `assignment_sheet` | MPI-Programmierung II: communication pattern and speed-up analysis. |
| `947741` | Nachrichtengekoppelte Systeme | Aufgabenblatt 10 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 10; OCR is noisy. |
| `947745` | Speichergekoppelte Systeme | Teil 05 | `lecture_pdf` | Cache coherence, memory consistency, dependency analysis. |
| `947747` | Speichergekoppelte Systeme | Aufgabenblatt 11 | `assignment_sheet` | Schleifenabhängigkeiten using distance and direction vectors. |
| `947748` | Speichergekoppelte Systeme | Aufgabenblatt 11 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 11; OCR is noisy. |
| `947751` | Ausblick: Anwendungen | Teil 06 | `lecture_pdf` | Parallel matrix operations, Jacobi, Gauss-Seidel, parallel sorting. |
| `947753` | Ausblick: Anwendungen | Aufgabenblatt 12 | `assignment_sheet` | Wiederholung: synchronization and broader review tasks. |
| `947754` | Ausblick: Anwendungen | Aufgabenblatt 12 -- Lösung | `solution_pdf`, `low_ocr_solution` | Matching solution for sheet 12; OCR is noisy. |

## Assignment And Solution Hierarchy

The solution should not become a separate sibling group in the task tree. It
belongs directly to the assignment sheet it solves.

Correct hierarchy:

```text
Task area
└─ Aufgabenblatt 03: Netztopologien I
   ├─ source: assignment PDF 947719
   ├─ tasks
   │  ├─ Aufgabe 1
   │  └─ ...
   └─ solution
      ├─ source: solution PDF 947720
      └─ extraction_state: low_ocr_solution
```

Not this:

```text
Task area
├─ Aufgabenblatt 03
└─ Lösung 03
```

Reason:

- The assignment sheet defines the exercise identity.
- The solution only has meaning through that assignment sheet.
- The user should open one task object and see the matching solution state
  there.
- We still keep solutions as separate source artifacts for traceability.

Missing solutions are explicit child states:

```text
Aufgabenblatt 09: MPI-Programmierung I
├─ source: assignment PDF 947739
└─ solution: missing_solution
```

## Resulting Lecture Tree

The lecture tree should use the six `Teil` PDFs, but it should not blindly copy
the Moodle section names as script headings.

`Einführung` is a weak final heading because `Teil 01` mixes organization with
technical content. In the generated script, course logistics should become
course metadata or a short preface, while the technical content should become
real lecture nodes.

```text
B_V: Lecture / script tree
├─ Course logistics
│  └─ source: Teil 01, selected pages only
├─ Architecture and performance foundations
│  ├─ source: Teil 01
│  └─ spans: architecture models, memory, cache, roofline, performance model
├─ Network topologies
│  ├─ source: Teil 02
│  └─ spans: degree, diameter, connectivity, bisection, static/dynamic networks
├─ Parallelization foundations
│  ├─ source: Teil 03
│  └─ spans: dependencies, strategies, synchronization, load balancing
├─ Message-passing systems
│  ├─ source: Teil 04
│  └─ spans: point-to-point, collectives, MPI
├─ Shared-memory systems
│  ├─ source: Teil 05
│  └─ spans: cache coherence, memory consistency, dependency analysis
└─ Applications
   ├─ source: Teil 06
   └─ spans: matrix operations, iterative solvers, sorting
```

## Resulting Task Tree

The task tree is separate from the lecture tree. It links to lecture topics, but
it is not embedded inside the script.

```text
B_A: Task tree
├─ Hardware and performance
│  ├─ Aufgabenblatt 01: Speicherzugriffe & Roofline-Modell
│  │  └─ solution: Aufgabenblatt 01 -- Lösung, low_ocr_solution
│  └─ Aufgabenblatt 02: Leistungsbemessung
│     └─ solution: Aufgabenblatt 02 -- Lösung, low_ocr_solution
│
├─ Network topologies
│  ├─ Aufgabenblatt 03: Netztopologien I
│  │  └─ solution: Aufgabenblatt 03 -- Lösung, low_ocr_solution
│  ├─ Aufgabenblatt 04: Netztopologien II
│  │  └─ solution: Aufgabenblatt 04 -- Lösung, low_ocr_solution
│  └─ Aufgabenblatt 05: Netztopologien III
│     └─ solution: Aufgabenblatt 05 -- Lösung, low_ocr_solution
│
├─ Parallelization foundations
│  ├─ Aufgabenblatt 06: Parallelisierungsstrategien
│  │  └─ solution: Aufgabenblatt 06 -- Lösung, low_ocr_solution
│  ├─ Aufgabenblatt 07: Synchronisation
│  │  └─ solution: Aufgabenblatt 07 -- Lösung, low_ocr_solution
│  └─ Aufgabenblatt 08: Lastbalanzierung & Synchronisation
│     └─ solution: Aufgabenblatt 08 -- Lösung, low_ocr_solution
│
├─ MPI / message passing
│  ├─ support_link: Zugang zum CDS-Cluster
│  ├─ Aufgabenblatt 09: MPI-Programmierung I
│  │  └─ solution: missing_solution
│  └─ Aufgabenblatt 10: MPI-Programmierung II
│     └─ solution: Aufgabenblatt 10 -- Lösung, low_ocr_solution
│
├─ Shared memory / dependencies
│  └─ Aufgabenblatt 11: Schleifenabhängigkeiten
│     └─ solution: Aufgabenblatt 11 -- Lösung, low_ocr_solution
│
└─ Review / applications
   └─ Aufgabenblatt 12: Wiederholung
      └─ solution: Aufgabenblatt 12 -- Lösung, low_ocr_solution
```

## Cross-Links From Tasks To Lectures

```text
h: B_A -> B_V
```

Initial manual mapping:

```text
Aufgabenblatt 01
  -> Architecture and performance foundations

Aufgabenblatt 02
  -> Architecture and performance foundations
  -> performance model, speed-up, efficiency

Aufgabenblatt 03-05
  -> Network topologies

Aufgabenblatt 06
  -> Parallelization foundations
  -> function/data/competitive parallelism

Aufgabenblatt 07
  -> Parallelization foundations
  -> synchronization

Aufgabenblatt 08
  -> Parallelization foundations
  -> load balancing and synchronization

Aufgabenblatt 09-10
  -> Message-passing systems
  -> MPI programming

Aufgabenblatt 11
  -> Shared-memory systems
  -> dependency analysis
  -> also Parallelization foundations, because dependency analysis appears there too

Aufgabenblatt 12
  -> Review / applications
  -> synchronization and broader course concepts
```

## Pipeline Implications

The automated pipeline should change from:

```text
1. Read Moodle course page
2. List all Moodle files
3. Classify files
```

to:

```text
1. Read Moodle course page as the primary source of all activities.
2. Extract all visible activity items from the course page.
3. List downloadable file resources as a subset, not as the full course.
4. Classify every activity with a role label.
5. Extract text and page images for PDFs.
6. Pair assignment sheets with solution artifacts.
7. Represent missing or weak solutions explicitly.
8. Build B_V from lecture material.
9. Build B_A from assignment and solution material.
10. Add links h: B_A -> B_V.
11. Keep raw PDF-to-script output as the baseline comparison.
```

## Key Learnings

1. `moodle list files` is not enough for complete course modeling.

It misses URL links, forums, external tools, and labels. For this course, it
sees 29 file resources while the page contains 56 visible activities.

2. The course page is the real inventory root.

The file list is only the downloadable-resource subset.

3. Solutions are child artifacts of assignment sheets.

They should not become independent task groups. They should be attached to the
matching assignment sheet and carry their own extraction state.

4. PDF content still matters.

`Teil 02` is plainly a lecture PDF, not an assignment. Assignment sheets expose
their actual exercise topics through the PDF title and task text. Solution PDFs
are mostly image-first because OCR quality is weak.

5. The first generated script heading should not necessarily be "Einführung".

The model should split course logistics from technical content and then create a
clean lecture tree from the actual content.
