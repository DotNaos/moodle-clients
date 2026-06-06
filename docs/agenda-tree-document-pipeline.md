# Agenda Tree Pipeline

This document captures the high-level model for turning Moodle PDFs into two
separate website areas:

- a lecture/script area
- a tasks area

The key idea is that Moodle files are the source material, but the website
should be organized by meaning, not by raw file order.

## 1. Lecture Tree

The lecture tree describes the knowledge space of a course.

```text
Urbild U_V
= Moodle lecture material
= theory PDFs, slide PDFs, script PDFs, page text, page images

        f_V
        "Which lecture topic does this material explain?"
        |
        v

Bild B_V
= lecture agenda tree
= the script/navigation structure shown in the website's script area
```

Abstractly:

```text
U_V: Lecture PDFs and pages                  B_V: Lecture agenda tree

PDF 1, pages 1-n
PDF 2, pages 1-n
PDF 3, pages 1-n
        ------------------------------->    Course
                                             ├─ Topic 1
                                             │  ├─ Concept 1.1
                                             │  └─ Concept 1.2
                                             ├─ Topic 2
                                             │  ├─ Concept 2.1
                                             │  └─ Concept 2.2
                                             └─ Topic 3
                                                └─ Concept 3.1
```

Each lecture node spans a knowledge area:

```text
Lecture agenda node
├─ title
├─ explanation scope
├─ source PDF references
├─ source page ranges
├─ useful diagrams or screenshots
└─ generated script section
```

Example shape for a course:

```text
Course
├─ Introduction
│  └─ spans: motivation, course setup, hardware foundations
├─ Architecture / systems
│  └─ spans: machines, memory, cache, performance models
├─ Networks
│  └─ spans: topology criteria, static networks, dynamic networks
├─ Parallelization
│  └─ spans: dependencies, strategies, synchronization, load balancing
├─ Message passing
│  └─ spans: send/receive, collectives, MPI
├─ Shared memory
│  └─ spans: cache coherence, consistency, multithreading
└─ Applications
   └─ spans: matrix operations, solvers, sorting, numerical examples
```

Important rule:

```text
One PDF can map to many lecture nodes.
One lecture node can receive material from many PDFs.
```

So the mapping is not necessarily one-to-one:

```text
PDF page range A  ----------------------->  Concept A
PDF page range B  ----------------------->  Concept B
PDF diagram C     ----------------------->  Concept B
PDF page range D  ----------------------->  Concept C
```

The script generator should write from `B_V`, not directly from raw PDF order.
The raw PDF order remains useful as a baseline for comparison.

## 2. Task Tree

The task tree describes the exercise space of a course.

It is separate from the lecture tree because the website has a separate tasks
area. Tasks should not be hidden inside the script structure.

```text
Urbild U_A
= Moodle exercise material
= assignment PDFs, task pages, solution PDFs, optional Moodle hints

        f_A
        "Which exercise structure does this material define?"
        |
        v

Bild B_A
= task tree
= the exercise/navigation structure shown in the website's tasks area
```

Abstractly:

```text
U_A: Assignment and solution PDFs            B_A: Task tree

Assignment sheet 01
Solution sheet 01
Assignment sheet 02
Solution sheet 02
        ------------------------------->    Task area
                                             ├─ Assignment sheet
                                             │  ├─ Task 1
                                             │  │  ├─ Part a
                                             │  │  ├─ Part b
                                             │  │  └─ Solution reference
                                             │  └─ Task 2
                                             └─ Next assignment sheet
```

Each task node spans an exercise area:

```text
Task tree node
├─ assignment sheet
├─ task
├─ subtask
├─ expected answer area
├─ solution reference
├─ progress state
└─ optional link to the lecture topic it practices
```

Example shape for a course:

```text
Tasks
├─ Assignment area 1
│  ├─ Sheet 01
│  │  ├─ Task 1
│  │  ├─ Task 2
│  │  └─ Solution 01
│  └─ Sheet 02
│     ├─ Task 1
│     └─ Solution 02
├─ Assignment area 2
│  ├─ Sheet 03
│  ├─ Sheet 04
│  └─ Sheet 05
└─ Assignment area 3
   └─ Sheet 06
```

Important rule:

```text
The task tree is its own image set.
It links to the lecture tree, but it is not a child of the lecture tree.
```

So the relation between both trees is a cross-reference:

```text
B_A: Task tree                              B_V: Lecture tree

Assignment sheet 03
├─ Task 1
├─ Task 2
└─ Task 3
        ------------------------------->    Network topologies
                                             spans: degree, diameter,
                                             connectivity, bisection width

Assignment sheet 06
├─ Task 1
└─ Task 2
        ------------------------------->    Parallelization
                                             spans: dependencies,
                                             Bernstein conditions,
                                             synchronization
```

Formally:

```text
f_V: U_V -> B_V
     lecture material maps to the lecture tree

f_A: U_A -> B_A
     task material maps to the task tree

h: B_A -> B_V
   task nodes link back to the lecture topics they practice
```

## 3. Combined Course Model

The website should treat both trees as first-class course outputs.

```text
Moodle course
├─ Lecture material U_V
│  └─ f_V -> Lecture tree B_V
│          └─ Script area
│
├─ Task material U_A
│  └─ f_A -> Task tree B_A
│          └─ Tasks area
│
└─ Cross-links
   └─ h: task nodes -> lecture nodes
```

This gives three useful outputs:

```text
1. Script
   generated from the lecture tree

2. Tasks
   generated from the task tree

3. Study links
   generated from task-to-lecture references
```

## 4. Automation Plan

The automated pipeline should follow this order:

```text
1. Read Moodle course page
2. List all Moodle files
3. Classify files into lecture material, task material, and solution material
4. Extract page text and useful page images
5. Build B_V from lecture material
6. Build B_A from task and solution material
7. Link B_A nodes to B_V nodes
8. Generate script from B_V
9. Generate tasks view from B_A
10. Keep raw PDF-to-script output as a comparison baseline
```

The comparison baseline is important:

```text
Raw baseline:
PDF order -> direct script

Agenda pipeline:
PDF material -> lecture tree -> script
Task material -> task tree -> tasks
Task tree -> lecture links
```

The agenda pipeline wins only if it stays traceable and produces a better
study experience than the raw baseline.

## 5. Acceptance Criteria

The pipeline is working when:

- lecture and task trees stay separate
- each generated script section has source references
- each task keeps its assignment sheet and solution reference
- task nodes can link to relevant lecture nodes
- the raw baseline can be generated for comparison
- no material is silently lost
- generated output remains useful even when some PDFs have weak text extraction

