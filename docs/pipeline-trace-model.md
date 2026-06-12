# Pipeline Trace Model

This document describes how Moodle course material should move through the
study pipeline while staying inspectable at every step.

The core idea is:

```text
reduce(course, pipeline_steps) -> final_course_view + trace_graph
```

The final course view is the clean user-facing output. The trace graph explains
where every output block came from, what changed, and what was dropped.

## 1. The Three States

```text
STATE 1                          STATE 2                                      STATE 3
RAW / COURSE INPUT               EXTRACTED / RENDERABLE STRUCTURE             CURATED / FINAL VIEW
──────────────────               ────────────────────────────────             ────────────────────

Course                           Course                                       Course View
└─ Moodle Resources              ├─ Task Group: Aufgabenblatt 01              ├─ Tasks
   │                             │  ├─ Sheet: PDF A                           │  └─ Aufgabenblatt 01
   ├─ PDF A ───────────────────► │  │  ├─ Page 1                              │     ├─ Title
   │  Aufgabenblatt 01           │  │  │  ├─ block_001 heading/sheet_title ─────────► │
   │                             │  │  │  ├─ block_002 image/logo ────────X dropped  │
   │                             │  │  │  ├─ block_003 paragraph/intro ─────────────► Intro
   │                             │  │  │  ├─ block_004 code/pseudo_code ────────────► Code
   │                             │  │  │  └─ block_005 image/diagram ───────────────► Diagram
   │                             │  │  └─ Page 2                              │     │
   │                             │  │     ├─ block_006 paragraph/task_text ─────────► Aufgabe 2
   │                             │  │     └─ block_007 paragraph/footer ────X dropped
   │                             │  │
   ├─ PDF B ───────────────────► │  └─ Solution: PDF B                        │     └─ Solution
   │  Aufgabenblatt 01 Lösung    │     └─ Page 1                              │        ├─ Visual
   │                             │        ├─ block_008 image/solution ──────────────► │
   │                             │        └─ block_009 paragraph/weak_ocr ──────────► OCR text
   │
   └─ PDF C ───────────────────► └─ Script Source: PDF C                      └─ Script
      Teil 01 Skript                └─ Page 1                                    └─ Chapter 1
                                       ├─ block_010 heading/chapter_title ───────────► Title
                                       └─ block_011 paragraph/theory_text ───────────► Paragraph


        f_fetch / f_download / f_group / f_pair              f_codex_curate / f_split / f_clean
────────────────────────────────────────────► ────────────────────────────────────────────────►
```

## 2. State 1: Raw Course Input

The first step fetches the full Moodle course and organizes it without creating
study content yet.

```text
Course Inventory
├─ Lecture Material
│  ├─ Teil 01.pdf
│  ├─ Teil 02.pdf
│  └─ ...
│
├─ Task Groups
│  ├─ Aufgabenblatt 01
│  │  ├─ sheet: Aufgabenblatt 01.pdf
│  │  ├─ solution: Aufgabenblatt 01 Lösung.pdf
│  │  └─ status: paired
│  │
│  └─ Aufgabenblatt 09
│     ├─ sheet: Aufgabenblatt 09.pdf
│     ├─ solution: missing
│     └─ status: missing_solution
│
├─ References
├─ Interactions
└─ Unknown
```

Every item keeps an explicit classification reason.

```text
Task Group: Aufgabenblatt 01
├─ sheet
│  ├─ moodle_id: 947711
│  └─ reason: title contains "Aufgabenblatt 01"
│
├─ solution
│  ├─ moodle_id: 947712
│  └─ reason: title contains "Aufgabenblatt 01" and "Lösung"
│
└─ pairing
   ├─ status: paired
   ├─ confidence: high
   └─ method: normalized title + sheet number
```

Nothing should silently disappear. Unknown items remain visible in the
inventory.

## 3. State 2: Extracted Renderable Structure

The extracted state is a website-like document structure. It is not yet the
final study view, but it must already be renderable and inspectable.

Each PDF becomes pages. Each page becomes blocks.

```text
PDF: Aufgabenblatt 01.pdf
├─ metadata
│  ├─ moodle_id: 947711
│  ├─ file_hash: 3f9049...
│  ├─ page_count: 2
│  └─ kind: task_sheet
│
├─ pages
│  ├─ page 1
│  │  ├─ page_image
│  │  ├─ text_extraction
│  │  │  ├─ engine: pdftotext
│  │  │  ├─ chars: 1820
│  │  │  └─ status: ok
│  │  │
│  │  ├─ image_extraction
│  │  │  ├─ engine: pdftohtml
│  │  │  ├─ images: 1
│  │  │  └─ status: ok
│  │  │
│  │  └─ blocks
│  │     ├─ block_001 heading / sheet_title
│  │     ├─ block_002 paragraph / task_intro
│  │     ├─ block_003 code / pseudo_code
│  │     └─ block_004 image / diagram
│  │
│  └─ page 2
│     └─ blocks
│        └─ block_005 paragraph / task_text
│
└─ diagnostics
   ├─ pages_missing_text: 0
   ├─ pages_visual_only: 0
   ├─ extracted_images: 1
   ├─ unused_images: 0
   ├─ unmapped_blocks: 0
   └─ overall_status: ok
```

Block `type` describes the form. Block `label` describes the meaning.

```text
block.type
├─ heading
├─ paragraph
├─ list
├─ table
├─ image
├─ formula
├─ code
├─ page_header
├─ page_footer
├─ caption
└─ unknown

block.label
├─ course_title
├─ sheet_title
├─ task_number
├─ task_intro
├─ task_question
├─ diagram
├─ formula_definition
├─ solution_step
├─ note
└─ unknown
```

The frontend should be able to render this state directly:

```text
left: original page preview
right: recognized document structure

Page 1 Structure
├─ heading / sheet_title
├─ paragraph / task_intro
├─ code / pseudo_code
├─ image / diagram
└─ paragraph / task_question
```

## 4. State 3: Curated Final View

Codex works from the extracted structure, not from raw PDFs.

Codex may clean, split, rewrite, summarize, and remove noise. It may not create
untraceable course content.

```text
PDF A: Aufgabenblatt 01
├─ block_001 sheet_title      ─────► Tasks / Aufgabenblatt 01 / Title
├─ block_002 logo             ──X──► dropped: decorative logo
├─ block_003 intro            ─────► Tasks / Aufgabenblatt 01 / Aufgabe 1 / Intro
├─ block_004 pseudo_code      ─────► Tasks / Aufgabenblatt 01 / Aufgabe 1 / Code
├─ block_005 diagram          ─────► Tasks / Aufgabenblatt 01 / Aufgabe 1 / Diagram
├─ block_006 task_text        ─────► Tasks / Aufgabenblatt 01 / Aufgabe 2
└─ block_007 footer           ──X──► dropped: page footer

PDF B: Aufgabenblatt 01 Lösung
├─ block_008 solution_image   ─────► Tasks / Aufgabenblatt 01 / Solution / Visual
└─ block_009 weak_ocr_text    ─────► Tasks / Aufgabenblatt 01 / Solution / OCR text

PDF C: Teil 01 Skript
├─ block_010 chapter_title    ─────► Script / Chapter 1 / Title
└─ block_011 theory_text      ─────► Script / Chapter 1 / Paragraph
```

Every extracted block must end in one of these states:

```text
kept
rewritten
split
merged
moved
dropped
unused_needs_review
```

Dropped content must always carry a reason:

```text
Dropped block_002
├─ type: image
├─ label: logo
├─ reason: decorative logo
└─ allowed: true
```

If Codex creates content that is not directly copied from one block, it still
needs source links.

```text
Generated paragraph
├─ derived_from
│  ├─ block_003
│  └─ block_004
├─ operation: rewrite_for_readability
└─ review_status: needs_review
```

## 5. Trace Graph

The trace graph is the inspectable record of the pipeline. It connects every
source item, page, block, and final view node.

```text
source_node
  └─ pipeline_step
      ├─ output_node
      └─ trace_event
```

Example:

```text
block_005: PDF A / Page 1 / image / diagram
  └─ f_codex_curate
      ├─ output: Tasks / Aufgabenblatt 01 / Aufgabe 1 / Diagram
      └─ trace
         ├─ action: kept
         ├─ status: ok
         └─ reason: learning-relevant diagram
```

Missing or suspicious content becomes visible through the same graph:

```text
block_012: PDF A / Page 2 / image / unknown
  └─ f_codex_curate
      ├─ output: none
      └─ trace
         ├─ action: unused_needs_review
         ├─ status: warning
         └─ reason: extracted image was not referenced in final view
```

## 6. Rerunnable Pipeline Steps

Pipeline steps should be stored as independent runs so a stage can be repeated
with a different engine or configuration.

```text
Course
└─ Resource
   └─ File hash
      ├─ run: extract-pages / v1
      ├─ run: extract-text / pdftotext / config-a
      ├─ run: extract-text / docling / config-b
      ├─ run: extract-images / pdftohtml / config-a
      └─ run: detect-blocks / model-x / config-c
```

A rerun should not overwrite prior results. It creates a new run and the system
chooses which run is active for the next pipeline step.

```text
block detection input
├─ active text run: pdftotext / run_123
├─ active image run: pdftohtml / run_456
└─ active page render run: poppler / run_789
```

This allows the frontend to compare outputs:

```text
Page 4
├─ pdftotext
│  ├─ chars: 0
│  └─ status: weak
│
├─ docling
│  ├─ chars: 540
│  └─ status: ok
│
└─ selected_for_curated_view: docling
```

## 7. Frontend Inspection Goals

The frontend should support these questions:

- What did Moodle provide?
- How was it grouped?
- Which sheet belongs to which solution?
- What did extraction recognize on each page?
- Which blocks became final task or script content?
- Which blocks were dropped, and why?
- Which images were extracted but not used?
- Which OCR or extraction engine produced the selected output?
- Which stage is stale because the source file changed?

The user-facing principle is:

```text
No content is silently lost.
Every output can be traced back to source blocks.
Every missing or dropped block has a visible reason.
```

## 8. Product Shape: Course Pipeline Inspector

The processing pipeline should be visible in a separate inspection surface, not
inside the normal learning UI. The normal task and script screens should stay
focused on studying. Pipeline details are operational/debugging information and
would confuse regular users if shown inline.

The inspector should be reachable in two ways:

```text
Admin
└─ Pipeline
   ├─ all courses
   ├─ all active runs
   ├─ failed or blocked runs
   ├─ review queue
   └─ engine/configuration overview

Course
└─ Pipeline
   └─ same inspector, filtered to this course
```

The root-level admin route makes the pipeline future-proof. Today the primary
source is a Moodle course, but later the same pipeline may ingest uploaded PDF
sets, another LMS, manually curated file collections, or batch imports. The
course-level entry keeps day-to-day debugging ergonomic because it opens the
same system already scoped to the course the user is looking at.

The domain model should therefore not hard-code "course" as the only root
entity. It should model a generic source, with Moodle courses as the first
source type.

```text
Pipeline Source
├─ type: moodle_course
├─ source_id: 22584
├─ display_name: High Performance Computing
└─ children: Moodle resources

Pipeline Source
├─ type: uploaded_pdf_set
├─ source_id: fs26-exam-pack
├─ display_name: FS26 Exam Prep Pack
└─ children: uploaded files
```

The course-specific view should still present the hierarchy in course terms:

```text
Pipeline
└─ Course
   ├─ Resources
   │  └─ Resource
   │     ├─ classification
   │     ├─ status
   │     └─ steps
   │
   ├─ Classification Buckets
   │  ├─ Lecture Material
   │  ├─ Assignment Sheets
   │  ├─ Solutions
   │  ├─ References
   │  ├─ Interactions
   │  └─ Unknown
   │
   └─ Outputs
      ├─ Tasks
      ├─ Script
      └─ Formulas
```

The hierarchy ends at the resource. Buckets, status chips, and steps are views
over that resource, not deeper source hierarchy.

## 9. Course Hierarchy and Classification

The first visible stage is the resource inventory and classification state. It
answers what Moodle provided, what the system recognized, what remains unknown,
and why every resource landed where it did.

```text
Course: High Performance Computing
└─ Resources
   ├─ 947709 · Teil 01
   │  ├─ classified_as: lecture_material
   │  ├─ status: extracted
   │  └─ classification_reason:
   │     title starts with "Teil" and file is a PDF
   │
   ├─ 947711 · Aufgabenblatt 01
   │  ├─ classified_as: assignment_sheet
   │  ├─ status: curated
   │  └─ classification_reason:
   │     title contains "Aufgabenblatt 01" and no solution keyword
   │
   ├─ 947712 · Aufgabenblatt 01 Lösung
   │  ├─ classified_as: solution_pdf
   │  ├─ paired_with: 947711
   │  ├─ status: needs_review
   │  └─ classification_reason:
   │     title contains "Aufgabenblatt 01" and "Lösung"
   │
   └─ 947715 · Zoom Link
      ├─ classified_as: interaction
      ├─ status: ignored_allowed
      └─ classification_reason:
         activity type is external tool / meeting
```

The same resources should also be visible as buckets:

```text
Classification Buckets
├─ Lecture Material
│  ├─ 947709 · Teil 01
│  ├─ 947718 · Teil 02
│  └─ ...
│
├─ Assignment Sheets
│  ├─ 947711 · Aufgabenblatt 01
│  ├─ 947713 · Aufgabenblatt 02
│  └─ ...
│
├─ Solutions
│  ├─ 947712 · Aufgabenblatt 01 Lösung
│  ├─ 947714 · Aufgabenblatt 02 Lösung
│  └─ ...
│
├─ References
├─ Interactions
└─ Unknown
```

The Unknown bucket is important. Unknown resources are not errors by default,
but they must be visible because they represent content the system has not
understood yet. This prevents silent loss.

## 10. Blueprint View for Pipeline Steps

The step inspector should use a node-based "blueprint" view. A table or
terminal-like dashboard is good for summaries, but the pipeline is fundamentally
a graph: sources flow into extraction runs, extraction runs create artifacts,
artifacts feed Codex, and Codex creates final outputs or review items.

React Flow is a good fit for this view because it supports custom node types,
edges, selection, zooming, side panels, and graph layouts.

The graph should not be decorative. It should be the primary debugging tool for
understanding how content moved.

```text
[Moodle Course]
      |
      v
[Inventory]
      |
      v
[Classification]
      |---------------------> [Lecture Material]
      |                              |
      |                              v
      |                        [Extract Script PDFs]
      |                              |
      |                              v
      |                        [Script Blocks]
      |                              |
      |                              v
      |                        [Curated Script]
      |
      |---------------------> [Assignment Sheets]
      |                              |
      |                              v
      |                        [Pair Solutions]
      |                              |
      |                              v
      |                        [Extract Task PDFs]
      |                              |
      |                              v
      |                        [Task Blocks]
      |                              |
      |                              v
      |                        [Curated Tasks]
      |
      |---------------------> [Solutions]
      |                              |
      |                              v
      |                        [Extract Solution PDFs]
      |
      `---------------------> [Unknown]
                                     |
                                     v
                               [Needs Review]
```

For one task group:

```text
[Aufgabenblatt 02.pdf] --------\
                                v
                           [Extract Pages]
                                |
                                v
                           [OCR: pdftotext]
                                |
                                v
                           [Detect Blocks]
                                |
                                v
                           [Codex Curate]
                                |
                                v
[Aufgabenblatt 02 Lösung.pdf] -> [Published Task: Aufgabe 1]
```

For OCR comparison:

```text
                 +------------> [OCR: pdftotext] --+
                 |                                  |
[Page Images] ---+------------> [OCR: docling] -----+--> [Select Active Text Run]
                 |                                  |
                 `------------> [OCR: marker] ------+
```

For missing or unused content:

```text
[Extract Images]
      |
      +----> [image_001: diagram] ----> [Task Diagram]       ok
      |
      `----> [image_002: unknown] ----> [Unused / Review]    warning
```

Node types:

```text
source node
  Moodle resource, PDF, page, extracted image, extracted text

process node
  inventory, classify, pair, render pages, OCR, detect blocks, Codex curate

artifact node
  page image, OCR text, document block, task draft, script draft

review node
  missing solution, weak OCR, unused image, dropped block, stale source

publish node
  shared task, shared script section, formula collection
```

Clicking a node should open a detail panel:

```text
Node Detail
├─ identity
│  ├─ type
│  ├─ id
│  └─ source path
│
├─ run info
│  ├─ stage
│  ├─ engine
│  ├─ config hash
│  ├─ run id
│  ├─ created by
│  └─ created at
│
├─ preview
│  ├─ PDF page
│  ├─ extracted text
│  ├─ extracted image
│  └─ final output block
│
├─ diagnostics
│  ├─ status
│  ├─ warnings
│  ├─ confidence
│  └─ stale source check
│
└─ actions
   ├─ rerun this step
   ├─ compare runs
   ├─ select as active run
   ├─ mark dropped as allowed
   └─ promote output
```

## 11. Task Page UX: Request, Not Manual Improvement

The current task UI should be simplified. The normal task page should not expose
many pipeline controls or a large "improve" workflow. Users should be able to
request work, see progress, and report problems.

Normal task page:

```text
Aufgaben
└─ Aufgabenblatt 01
   ├─ Aufgabe 1
   │  ├─ status: ready
   │  └─ actions:
   │     ├─ Start
   │     └─ Problem melden
   │
   ├─ Aufgabe 2
   │  ├─ status: missing
   │  └─ actions:
   │     └─ Request task
   │
   └─ Pipeline status
      ├─ progress: 45%
      └─ active step: OCR / detect blocks
```

The "Request task" action should create or reuse a pipeline request with default
settings. The user does not need to choose OCR engine, block detection model, or
Codex configuration.

```text
User clicks "Request task"
      |
      v
create pipeline request
      |
      v
enqueue default task pipeline
      |
      v
show progress indicator
      |
      v
publish task when done or show review-needed state
```

Progress should be visible to all users:

```text
Task generation
[##########----------] 50%
Current step: Extracting pages
```

Admin/debug users get an additional action:

```text
Task generation
[##########----------] 50%
Current step: Extracting pages

[View pipeline status]
```

For now, "admin" can effectively mean all internal users. The permission model
should still be designed so that later we can hide the pipeline inspector from
non-admins without changing the pipeline data model.

## 12. Permissions and Ownership

Pipeline outputs have different ownership levels.

```text
shared source artifacts
  Moodle resource metadata, downloaded PDFs, file hashes, extracted pages,
  extracted images, OCR text, detected blocks

shared published outputs
  admin-approved tasks, script, formulas

user-owned outputs
  personal Codex improvement runs, personal edits, private proposals
```

Normal users:

```text
normal user
├─ can view published tasks and script
├─ can request a missing task with default settings
├─ can see simple progress
├─ can report wrong/missing content
└─ can create a personal Codex improvement proposal
```

Codex runs:

```text
user-owned Codex run
├─ belongs to one user
├─ may improve a task once for that user
├─ does not overwrite shared content
└─ can become an admin-review proposal
```

Admins:

```text
admin
├─ can inspect the full graph
├─ can compare OCR/extraction runs
├─ can rerun stages with another engine/config
├─ can choose active runs
├─ can approve dropped content reasons
├─ can promote user-owned proposals
└─ can publish shared outputs
```

This keeps storage under control because expensive shared artifacts are not
duplicated per user, while user-specific Codex work remains isolated.

## 13. Storage and Scheduling Requirements

The pipeline scheduler should treat every stage as a rerunnable immutable run.
Rerunning a stage never overwrites previous output. It creates a new run and
optionally becomes the active run.

```text
pipeline_run
├─ run_id
├─ source_id
├─ resource_id
├─ file_hash
├─ stage
├─ engine
├─ config_hash
├─ created_by
├─ ownership: shared | user_owned
├─ status: queued | running | ok | warning | failed | needs_review
├─ started_at
├─ finished_at
└─ artifacts
```

```text
active_run_selection
├─ source_id
├─ resource_id
├─ stage
├─ active_run_id
├─ selected_by
├─ selected_at
└─ reason
```

Scheduling should support:

```text
default task pipeline
├─ fetch or reuse Moodle inventory
├─ classify resources
├─ pair assignment and solution PDFs
├─ extract pages
├─ extract text with default OCR/text engine
├─ extract images
├─ detect blocks
├─ curate tasks
└─ publish or mark needs_review
```

OCR experimentation should be expressed as alternate runs:

```text
resource: Aufgabenblatt 01 Lösung.pdf
├─ extract_text / pdftotext / run_123     weak
├─ extract_text / docling / run_456       ok
└─ extract_text / marker / run_789        ok

active text run: run_456
```

The frontend then compares runs instead of overwriting them.

## 14. Goal-Based Implementation Plan

The work should be delivered as separate goals. Each goal should leave the
system in a useful, shippable state and should be verifiable without relying on
later phases.

```text
Goal 0
└─ Commit and deploy current frontend baseline

Goal 1
└─ Define pipeline data contracts

Goal 2
└─ Expose course inventory and classification

Goal 3
└─ Add course pipeline inspector shell

Goal 4
└─ Simplify task page request/progress UX

Goal 5
└─ Add immutable pipeline run storage

Goal 6
└─ Render blueprint graph from real trace data

Goal 7
└─ Add extracted PDF/page/block inspection

Goal 8
└─ Add OCR/run comparison and active-run selection

Goal 9
└─ Add user feedback and user-owned Codex proposals

Goal 10
└─ Add admin promotion and publish controls
```

### Goal 0: Commit and Deploy Current Frontend Baseline

Purpose:
Make sure the current UI work is safely merged and deployed before changing the
pipeline internals.

Deliverables:

```text
frontend branch
├─ committed
├─ pushed
├─ PR opened or updated
├─ CI green
├─ merged into main
└─ Vercel production deployment verified
```

Verification:

```text
local checks
├─ bun run typecheck
└─ bun run web:build

production checks
├─ course page opens
├─ task page opens
├─ no 500
├─ no authentication required error
└─ expected task content loads after async data refresh
```

Non-goals:

```text
├─ no new pipeline functionality
└─ no storage/schema changes
```

### Goal 1: Define Pipeline Data Contracts

Purpose:
Create the vocabulary and shared shape for the whole system before building UI.
The pipeline needs stable contracts for sources, resources, classifications,
runs, artifacts, and trace edges.

Deliverables:

```text
contracts
├─ PipelineSource
├─ PipelineResource
├─ ResourceClassification
├─ PipelineRun
├─ PipelineArtifact
├─ TraceNode
├─ TraceEdge
├─ ActiveRunSelection
└─ PipelinePermission / ownership fields
```

Minimum model:

```text
PipelineSource
├─ id
├─ type: moodle_course | uploaded_pdf_set | future_source
├─ external_id
├─ display_name
└─ status

PipelineResource
├─ id
├─ source_id
├─ external_id
├─ title
├─ type
├─ file_hash
├─ classification
├─ classification_reason
└─ status

PipelineRun
├─ id
├─ source_id
├─ resource_id
├─ stage
├─ engine
├─ config_hash
├─ ownership: shared | user_owned
├─ status
└─ artifacts
```

Verification:

```text
├─ typecheck passes
├─ fixtures can represent High Performance Computing resources
├─ fixtures can represent missing solutions
├─ fixtures can represent multiple OCR runs
└─ fixtures can represent dropped/unused content
```

Non-goals:

```text
├─ no React Flow yet
├─ no real OCR reruns yet
└─ no admin mutation controls yet
```

### Goal 2: Expose Course Inventory and Classification

Purpose:
Make State 1 inspectable. Before extracted blocks or Codex output can be
debugged, we must see what Moodle provided and how each resource was grouped.

Deliverables:

```text
course inventory API/view model
├─ resources
├─ classification buckets
├─ assignment-sheet to solution pairing
├─ unknown resources
├─ ignored_allowed resources
└─ classification reasons
```

UI shape:

```text
Course Pipeline
└─ Resources
   ├─ 947711 · Aufgabenblatt 01
   │  ├─ assignment_sheet
   │  ├─ paired
   │  └─ reason visible
   │
   ├─ 947712 · Aufgabenblatt 01 Lösung
   │  ├─ solution_pdf
   │  ├─ paired_with: 947711
   │  └─ reason visible
   │
   └─ unknown / ignored items remain visible
```

Verification:

```text
High Performance Computing
├─ assignment sheets are visible
├─ solution PDFs are visible
├─ known missing solution cases are visible
├─ unknown resources are not hidden
└─ classification reasons are visible for each resource
```

Non-goals:

```text
├─ no PDF block extraction UI
├─ no OCR comparison
└─ no graph layout
```

### Goal 3: Add Course Pipeline Inspector Shell

Purpose:
Create the navigation and inspection surface where future pipeline details will
live. This is the course-level entry into the broader admin pipeline system.

Routes:

```text
/admin/pipeline
  global admin overview, may start simple or hidden

/courses/:courseId/pipeline
  pipeline inspector filtered to one course
```

Course-level UI shell:

```text
Pipeline / High Performance Computing

[Resources] [Buckets] [Runs] [Blueprint] [Review]

left:   resource list / bucket list
middle: selected resource or selected stage
right:  details, status, reasons, diagnostics
```

Deliverables:

```text
├─ course pipeline route
├─ entry point from course UI for admin/debug users
├─ resource list tab
├─ bucket tab
├─ placeholder blueprint tab
└─ route works with real course id
```

Verification:

```text
├─ course pipeline route opens directly
├─ browser refresh preserves route
├─ no normal user task flow regression
├─ mobile route does not break bottom navigation
└─ inspector can be hidden later behind permissions
```

Non-goals:

```text
├─ no real React Flow graph yet
├─ no mutation actions yet
└─ no scheduler integration yet
```

### Goal 4: Simplify Task Page Request and Progress UX

Purpose:
Remove heavy pipeline/improvement controls from the normal learning UI. The
task page should let users request missing work and see progress without
understanding OCR engines, extraction, or Codex internals.

Normal user UI:

```text
Task missing
├─ Request task
└─ Problem melden

Task generating
├─ progress bar
├─ current step label
└─ passive status text

Task ready
├─ Start
└─ Problem melden
```

Admin/debug addition:

```text
Task generating
├─ progress bar
├─ current step label
└─ View pipeline status
```

Deliverables:

```text
├─ reduce current "improve" UI
├─ add Request task action
├─ add progress indicator surface
├─ add View pipeline status action for admin/debug users
└─ connect button to placeholder/default request endpoint if scheduler is not ready
```

Verification:

```text
├─ missing task state has one primary action
├─ progress is visible to all users
├─ admin/debug can jump to course pipeline inspector
├─ existing ready tasks still work
└─ no pipeline internals shown in normal task content
```

Non-goals:

```text
├─ no custom OCR selection from task page
├─ no direct shared overwrite by normal users
└─ no final proposal/promotion system yet
```

### Goal 5: Add Immutable Pipeline Run Storage

Purpose:
Make stages rerunnable without losing old results. This is required before OCR
comparison or admin run selection can be reliable.

Storage:

```text
pipeline_runs
├─ id
├─ source_id
├─ resource_id
├─ file_hash
├─ stage
├─ engine
├─ config_hash
├─ ownership
├─ status
├─ created_by
├─ started_at
├─ finished_at
└─ artifact_refs

active_run_selections
├─ source_id
├─ resource_id
├─ stage
├─ active_run_id
├─ selected_by
├─ selected_at
└─ reason
```

Deliverables:

```text
├─ database schema / persistence layer
├─ run creation API
├─ run listing API
├─ active run selection API
├─ status updates
└─ basic scheduler-compatible state machine
```

Verification:

```text
├─ rerunning same stage creates a new run
├─ old run remains accessible
├─ active run can point to either run
├─ failed run is visible
├─ stale file hash can be represented
└─ user-owned and shared runs are distinguishable
```

Non-goals:

```text
├─ no full OCR engine matrix yet
└─ no final graph UI yet
```

### Goal 6: Render Blueprint Graph From Real Trace Data

Purpose:
Turn the pipeline from a list of statuses into a graph that explains content
flow. This should use React Flow or an equivalent node-based library.

Graph levels:

```text
course graph
├─ Moodle course
├─ inventory
├─ classification
├─ buckets
├─ extraction
├─ curation
└─ outputs

resource graph
├─ PDF
├─ pages
├─ OCR/text runs
├─ image extraction
├─ blocks
├─ Codex curation
└─ final task/script nodes
```

Deliverables:

```text
├─ React Flow dependency
├─ custom node types
├─ custom edge status styles
├─ graph data adapter from trace model
├─ node detail side panel
└─ warning/review nodes
```

Verification:

```text
├─ graph renders for a course
├─ graph renders for one assignment sheet
├─ clicking node opens details
├─ dropped/unused content is visible
├─ weak/failing stage is visible
└─ graph handles empty/missing data without crashing
```

Non-goals:

```text
├─ no manual graph editing yet
├─ no drag-to-change-pipeline semantics
└─ no admin promotion yet
```

### Goal 7: Add Extracted PDF/Page/Block Inspection

Purpose:
Make State 2 inspectable. The extracted state must be renderable like a
website, but still close enough to the source PDF that missing text/images are
obvious.

UI shape:

```text
Extracted Inspector
├─ left: original PDF/page preview
├─ middle: recognized page structure
└─ right: diagnostics and selected block details
```

Block view:

```text
Page 1
├─ block_001 heading / sheet_title
├─ block_002 image / logo
├─ block_003 paragraph / task_intro
├─ block_004 code / pseudo_code
└─ block_005 image / diagram
```

Deliverables:

```text
├─ page preview source
├─ extracted block renderer
├─ block labels and types
├─ image asset references
├─ diagnostics panel
└─ "unused/missing" warnings
```

Verification:

```text
├─ extracted text is visible
├─ extracted images are visible
├─ page with weak OCR is marked
├─ page with no text is marked
├─ selected block can be traced to source page
└─ image asset missing from output becomes obvious
```

Non-goals:

```text
├─ no Codex rewrite UI
└─ no OCR engine comparison controls yet
```

### Goal 8: Add OCR/Run Comparison and Active-Run Selection

Purpose:
Allow admins to compare extraction engines and choose which output feeds the
next pipeline stage.

UI shape:

```text
Page 4 OCR Runs
├─ pdftotext
│  ├─ status: weak
│  ├─ chars: 0
│  └─ preview
│
├─ docling
│  ├─ status: ok
│  ├─ chars: 540
│  └─ preview
│
└─ marker
   ├─ status: ok
   ├─ chars: 522
   └─ preview

active: docling
```

Deliverables:

```text
├─ run comparison view
├─ per-engine status summaries
├─ diff or side-by-side preview
├─ active run selector
├─ rerun with selected engine/config
└─ trace update when active run changes
```

Verification:

```text
├─ multiple OCR runs can coexist
├─ selected run feeds block detection
├─ changing active run does not delete old runs
├─ weak OCR is visible
└─ source hash changes mark old run stale
```

Non-goals:

```text
├─ no normal-user OCR controls
└─ no shared publish overwrite without admin action
```

### Goal 9: Add User Feedback and User-Owned Codex Proposals

Purpose:
Let users report missing or wrong content and create personal Codex
improvements without overwriting shared course output.

Feedback types:

```text
feedback
├─ task missing
├─ image missing
├─ solution wrong
├─ OCR bad
├─ task confusing
└─ other
```

User-owned proposal:

```text
user Codex run
├─ user_id
├─ source task/output id
├─ generated proposal
├─ source trace links
├─ status: private | submitted_for_review
└─ never overwrites shared output directly
```

Deliverables:

```text
├─ feedback action from task page
├─ feedback review item
├─ personal Codex improvement run
├─ proposal storage
└─ submit-for-review flow
```

Verification:

```text
├─ feedback appears in review queue
├─ user proposal is private by default
├─ shared task remains unchanged
├─ proposal keeps source trace links
└─ admin can see submitted proposal
```

Non-goals:

```text
├─ no automatic shared publishing
└─ no unrestricted user overwrite
```

### Goal 10: Add Admin Promotion and Publish Controls

Purpose:
Give admins control over what becomes shared/published while keeping trace
links and review history intact.

Admin actions:

```text
admin
├─ approve dropped block reason
├─ select active extraction run
├─ promote user proposal
├─ publish task/script output
├─ unpublish broken output
└─ mark review item resolved
```

Deliverables:

```text
├─ promotion API
├─ publish state model
├─ admin review queue
├─ audit trail
├─ trace-preserving publish operation
└─ rollback/unpublish path
```

Verification:

```text
├─ published output is visible to normal users
├─ unpublished output is hidden from normal users
├─ promotion keeps derived_from links
├─ audit trail shows who promoted it
└─ rollback does not delete source artifacts
```

Non-goals:

```text
└─ no destructive deletion of old pipeline artifacts
```

## 15. Suggested Goal Order

The practical order should be:

```text
1. Goal 0: Commit/deploy baseline
2. Goal 1: Data contracts
3. Goal 2: Inventory/classification
4. Goal 3: Inspector shell
5. Goal 4: Request/progress UX
6. Goal 5: Immutable run storage
7. Goal 6: Blueprint graph
8. Goal 7: Extracted block inspector
9. Goal 8: OCR/run comparison
10. Goal 9: Feedback/user proposals
11. Goal 10: Admin promotion/publish
```

The first real implementation goal after the current frontend baseline should
be Goal 1. Without stable contracts, the graph, storage, and UI will drift. The
first visible product goal should be Goal 2, because inventory/classification
is the earliest stage where missing resources become visible.
