# Pipeline Blackbox Inspector Plan

## Ziel

Ein Admin kann fuer einen Kurs nachvollziehen, wie aus Moodle-Ressourcen
fertige website-faehige Lerninhalte entstehen. Die Pipeline wird als
React-Flow-Verkabelung von Blackbox-Nodes dargestellt. Jeder Node zeigt, was
hineinging, was herauskam, womit es verarbeitet wurde, wo es gerade laeuft und
welche Probleme sichtbar sind.

Das Feature ist erst fertig, wenn die Pipeline nicht nur visualisiert wird,
sondern echte validierte Outputs produziert:

- Aufgaben
- Script-Sections
- Formelsammlung, wenn vorhanden

Diese Outputs muessen im normalen Kurs-UI nutzbar sein und im Inspector bis zur
Quelle zurueckverfolgbar bleiben.

## Nicht-Ziel

Kein reines Status-Dashboard. Wenn der User nur Nodes sieht, aber nicht
versteht, welcher Input zu welchem Output wurde, ist das Feature nicht fertig.

Kein Pipeline-Spielzeug mit Demo-Daten als Endzustand. Mock-Daten duerfen nur
helfen, die UI zu bauen. Die finale Akzeptanz haengt an echten Runs und echten
Outputs.

## Kernmodell

Jede Pipeline-Stufe ist eine Blackbox mit Kabeln.

```text
Split Node:
  one input cable
  many output cables
  shape: 1 -> N

Transform Node:
  one input cable
  one output cable
  shape: 1 -> 1

Collect Node:
  many input cables
  one output cable
  shape: N -> 1
```

Pipeline-Stufen duerfen nicht uebersprungen werden. Ein finaler Output ist nur
glaubwuerdig, wenn seine komplette Spur sichtbar ist.

```text
Falsch:

Task Group 01 ───────────────────────────────▶ Aufgabe 1

Richtig:

Task Group 01
  -> Sheet PDF + Solution PDF
  -> Pages
  -> Sections
  -> Extraction Variants
  -> Selected Extraction
  -> Collect Pair
  -> Codex Transform
  -> Aufgabe 1
```

## Zielbild im React Flow

Der Graph laeuft von links nach rechts. Jede Spur bleibt stufenweise
nachvollziehbar.

```text
┌────────┐
│ Course │
└───┬────┘
    │ 1 -> 1
    ▼
┌──────────────┐
│ Resource Set │
└───┬──────────┘
    │ 1 -> N
    ├────────────────────────────────────────────────────────────────────────────┐
    ▼                                                                            ▼
┌──────────────────┐                                                     ┌──────────────────┐
│ Task Group 01    │                                                     │ Script Group 01   │
│ sheet + solution │                                                     │ script pdf        │
└───┬──────────────┘                                                     └───┬──────────────┘
    │ 1 -> N                                                                  │ 1 -> 1
    ├──────────────────────────────┐                                           ▼
    ▼                              ▼                                    ┌──────────────────┐
┌──────────────┐              ┌──────────────┐                          │ PDF Bundle       │
│ Sheet PDF    │              │ Solution PDF │                          │ Teil 01          │
└──────┬───────┘              └──────┬───────┘                          └───┬──────────────┘
       │ 1 -> N                       │ 1 -> N                                │ 1 -> N
       ▼                              ▼                                       ▼
┌──────────────┐              ┌──────────────┐                         ┌────────┐
│ Sheet Pages  │              │ Sol. Pages   │                         │ Pages  │
└──────┬───────┘              └──────┬───────┘                         └───┬────┘
       │ 1 -> N                       │ 1 -> N                               │ 1 -> N
       ▼                              ▼                                      ▼
┌──────────────┐              ┌──────────────┐                         ┌──────────┐
│ Sheet        │              │ Solution     │                         │ Sections │
│ Sections     │              │ Sections     │                         └───┬──────┘
└──────┬───────┘              └──────┬───────┘                             │ 1 -> N
       │ 1 -> N OCR variants          │ 1 -> N OCR variants                  ▼
       ▼                              ▼                               ┌──────────────────────┐
┌──────────────┐              ┌──────────────┐                       │ Extraction Variants  │
│ Sheet        │              │ Solution     │                       │ pdftotext/docling/...│
│ Extractions  │              │ Extractions  │                       └───┬──────────────────┘
└──────┬───────┘              └──────┬───────┘                           │ 1 -> 1 selected
       │                              │                                    ▼
       └──────────────┬───────────────┘                            ┌──────────────────────┐
                      ▼                                            │ Selected Extraction  │
              ┌──────────────────┐                                └───┬──────────────────┘
              │ Collect Pair     │                                    │ 1 -> N sections
              │ sheet + solution │                                    ▼
              └──────┬───────────┘                            ┌────────────┐ ┌────────────┐
                     │ N -> 1                                  │ Codex S1   │ │ Codex S2   │
                     ▼                                         └────┬───────┘ └────┬───────┘
              ┌──────────────────┐                                  │ 1 -> 1       │ 1 -> 1
              │ Codex Transform  │                                  ▼             ▼
              └──────┬───────────┘                           ┌────────────┐ ┌────────────┐
                     │ 1 -> N, if sheet has tasks             │ Script Sec │ │ Script Sec │
       ┌─────────────┼─────────────┐                         └────────────┘ └────────────┘
       ▼             ▼             ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Aufgabe 1│   │ Aufgabe 2│   │ Aufgabe 3│
└──────────┘   └──────────┘   └──────────┘
```

## Node Inspector

Jeder Node muss anklickbar sein. Der Inspector zeigt fuer jeden Step dieselbe
Grundstruktur, damit der User nie raten muss.

```text
Selected Node
├─ Status
│  queued / running / succeeded / warning / failed
│
├─ Input
│  what came in
│
├─ Config
│  engine, model, prompt version, settings
│
├─ Output
│  what came out
│
├─ Rendered Preview
│  website-like preview where possible
│
├─ Artifacts
│  source PDFs, page images, crops, extracted images, logs
│
├─ Problems
│  missing images, missing solution, weak OCR, render errors
│
└─ Actions
   rerun, compare, select active extraction, open source
```

## Output-Qualitaet

Ein Output ist nur akzeptabel, wenn er website-ready ist.

```text
Valid Task Output
├─ title
├─ task body
├─ optional subparts
├─ optional solution / check
├─ rendered LaTeX
├─ working images
├─ no broken encoding
├─ no pipeline/debug text
├─ source mapping
│  ├─ source Moodle resource
│  ├─ source PDF
│  ├─ pages
│  ├─ sections
│  └─ extraction / codex run
└─ status
   ├─ ready
   ├─ needs_review
   └─ failed
```

Nicht akzeptabel:

- leere Aufgabe
- nur generischer Titel ohne Aufgabeninhalt
- kaputte Bildreferenzen
- ungerendertes oder zerstoertes LaTeX
- kaputte ASCII- oder Encoding-Zeichen
- Loesung ohne Aufgabenstellung
- Output ohne Source Mapping
- Codex-Inhalt ohne nachvollziehbare Quelle

## Acceptance Criteria

### AC 0: Pipeline produziert validierte Outputs

- Fuer einen Kurs kann die Pipeline vollstaendig gestartet werden.
- Am Ende entstehen echte Outputs im normalen Kurs-UI.
- Outputs sind nach Typ validiert: task, script section, formula collection.
- Ungueltige Outputs werden nicht als fertig angezeigt.
- Wenn kein Output entsteht, zeigt der Inspector den blockierenden Step.

### AC 1: Finaler Output sieht wie Website-Content aus

- Aufgaben und Script-Sections werden als echte Website-Inhalte gerendert.
- Bilder sind eingebettet und laden.
- LaTeX ist gerendert.
- Tabellen, Listen und Absaetze sind sauber strukturiert.
- Es gibt keine kaputten ASCII-/Encoding-Zeichen.
- Es gibt keine sichtbaren Debug- oder Pipeline-Artefakte im normalen UI.

### AC 2: Graph zeigt echte Pipeline

- Der Graph laeuft von links nach rechts.
- Nodes springen keine Stufen.
- Es gibt sichtbare `1 -> 1`, `1 -> N` und `N -> 1` Blackboxen.
- Ein Kurs kann mehrere finale Outputs haben.
- Aufgabe und Loesung koennen getrennt verarbeitet und spaeter gesammelt werden.

### AC 3: Jeder Node ist inspizierbar

- Klick auf jeden Node oeffnet Details.
- Details zeigen Input, Output, Status, Config, Preview, Artifacts, Problems.
- Collect-Nodes zeigen alle Inputs und den kombinierten Output.
- Codex-Nodes zeigen Input-Bundle, Output-Draft und erkennbare Aenderungen.

### AC 4: OCR/Extraction ist vergleichbar

- Pro relevanter Section koennen mehrere Extraction-Varianten existieren.
- Varianten zeigen Engine, Status, Textmenge, Bilder, Formeln und Preview.
- Eine aktive Variante ist klar markiert.
- Admins koennen eine weitere Engine starten oder eine Variante aktiv setzen.

### AC 5: Fehlende oder falsche Inhalte sind sichtbar

- Fehlende Bilder werden am betroffenen Node markiert.
- Fehlende Loesungen werden am Collect- oder Output-Node markiert.
- Leere oder schwache OCR-Ergebnisse werden markiert.
- Ungenutzte Source-Sections werden sichtbar.
- Codex-Entfernungen sind nachvollziehbar und begruendet.

### AC 6: Laufender Zustand ist sichtbar

- Nodes zeigen queued, running, succeeded, warning oder failed.
- Der aktuelle Step ist im Graph erkennbar.
- Logs und Fehler haengen am betroffenen Node.
- Refresh macht den aktuellen Stand sichtbar, ohne dass der User raten muss.

### AC 7: Kontrolle ist moeglich

- Admins koennen Extraction neu starten.
- Admins koennen OCR/Extraction-Engine wechseln.
- Admins koennen aktive Extraction setzen.
- Admins koennen vom finalen Output zur Quelle navigieren.
- Normale User sehen einfache Aktionen wie Aufgaben erstellen oder Verbesserung
  anfragen, aber nicht die volle Admin-Komplexitaet.

### AC 8: End-to-End Trace funktioniert

Fuer eine finale Aufgabe muss dieser Rueckweg im UI nachvollziehbar sein:

```text
Final Aufgabe
<- Codex Transform
<- Collect Pair
<- Sheet Extraction + Solution Extraction
<- Sheet Sections + Solution Sections
<- Pages
<- Sheet PDF + Solution PDF
<- Moodle Resource
<- Course
```

### AC 9: Verlust-Test funktioniert

Wenn bei einer Aufgabe ein Bild fehlt, muss der User sehen:

- wo das Bild urspruenglich war
- ob die Extraction es erkannt hat
- ob Codex es entfernt hat
- welcher Step dafuer verantwortlich ist
- ob ein anderer OCR/Extraction-Run das Bild behalten hat

## Phasen / Goals

### Goal 1: Datenmodell fuer Blackbox-Traces

Ergebnis:

- Einheitliches Trace-Modell fuer Nodes, Edges, Inputs, Outputs und Artifacts.
- Node-Typen fuer split, transform und collect.
- Output-Validation-Status pro finalem Output.

Fertig, wenn:

- Ein Course Trace mehrere finale Outputs modellieren kann.
- Aufgabe + Loesung getrennt und gesammelt modellierbar sind.
- Jeder Node Input- und Output-Referenzen speichern kann.

### Goal 2: Echte Run-Daten statt Demo-Graph

Ergebnis:

- Der Pipeline-Inspector liest echte Run-Daten.
- Fehlende Run-Daten werden als fehlende Steps angezeigt, nicht als Fake-Erfolg.
- Bestehende Kursdaten werden in das neue Trace-Modell projiziert.

Fertig, wenn:

- Der HPC-Kurs echte Ressourcen, Gruppen, Runs und Outputs im Graph zeigt.
- Kein Node behauptet fertig zu sein, wenn keine Daten existieren.

### Goal 3: React-Flow Conveyor Belt

Ergebnis:

- Der Graph ist die zentrale Inspect-Oberflaeche.
- Nodes sind von links nach rechts in Pipeline-Stufen angeordnet.
- Split, transform und collect sind visuell unterscheidbar.

Fertig, wenn:

- Der User die Pipeline ohne Erklaerung als Datenfluss lesen kann.
- Keine roten Cross-Links oder Sprung-Pfeile das Layout kaputt machen.

### Goal 4: Node Inspector mit Input/Output/Preview

Ergebnis:

- Jeder Node zeigt Input, Config, Output, Preview, Artifacts und Problems.
- Preview ist wo moeglich gerendert, nicht nur Rohtext.

Fertig, wenn:

- OCR-Nodes zeigen Source-Crop und extracted render preview.
- Codex-Nodes zeigen vorher/nachher.
- Collect-Nodes zeigen alle Inputs und den kombinierten Output.

### Goal 5: Website-ready Output Validation

Ergebnis:

- Final Outputs werden gegen Qualitaetskriterien geprueft.
- Render-, Asset-, LaTeX- und Encoding-Probleme werden sichtbar.

Fertig, wenn:

- Eine Aufgabe mit kaputtem Bild nicht als ready erscheint.
- Eine Aufgabe mit ungerendertem LaTeX nicht als ready erscheint.
- Eine valide Aufgabe im normalen Aufgaben-UI nutzbar ist.

### Goal 6: OCR/Extraction Compare und Rerun

Ergebnis:

- Mehrere Extraction-Engines koennen pro Section verglichen werden.
- Admins koennen eine Engine neu starten und eine Variante aktiv setzen.

Fertig, wenn:

- pdftotext, docling und marker als Varianten vergleichbar sind.
- Unterschiede bei Text, Bildern, Formeln und Problemen sichtbar sind.

### Goal 7: Live Progress

Ergebnis:

- Laufende Jobs sind im Graph sichtbar.
- Der User sieht, was gerade passiert und wo es haengt.

Fertig, wenn:

- queued/running/succeeded/warning/failed direkt am Node sichtbar sind.
- Logs und Fehler beim richtigen Node stehen.

### Goal 8: User- und Admin-Pfad trennen

Ergebnis:

- Normale User triggern einfache Requests.
- Admins inspizieren und steuern die Pipeline.

Fertig, wenn:

- Im Aufgaben-UI gibt es nur einfache Aktionen und Progress.
- Der volle Pipeline-Inspector ist separat auf Kursebene.

## Endgueltiger Abnahmetest

Ein Admin oeffnet `High Performance Computing`, startet oder oeffnet die
Pipeline und prueft `Aufgabe 1`.

Der Admin kann:

1. die finale Aufgabe als website-ready Preview sehen
2. sehen, dass Bilder laden und LaTeX gerendert ist
3. vom Output zur Codex-Transformation zurueckgehen
4. sehen, welches Aufgabenblatt und welche Loesung gesammelt wurden
5. die verwendeten Sections sehen
6. Source-Pages und Artifacts oeffnen
7. OCR/Extraction-Varianten vergleichen
8. erkennen, ob Inhalte fehlen oder veraendert wurden
9. bei Bedarf eine Extraction neu starten
10. danach den neuen Output wieder im normalen Kurs-UI sehen

Wenn dieser Test nicht moeglich ist, ist das Feature nicht fertig.
