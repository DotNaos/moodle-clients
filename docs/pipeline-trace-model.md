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
