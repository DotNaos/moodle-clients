package studypipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DotNaos/moodle-services/internal/moodle"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func TestBuildClassifiesAndLinksCourseMaterials(t *testing.T) {
	payload := Build("22584", []moodle.Resource{
		{ID: "1", Name: "01 Memory Hierarchy", FileType: "pdf", SectionID: "s1", SectionName: "Week 1"},
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionID: "s1", SectionName: "Week 1"},
		{ID: "3", Name: "Loesung Aufgabenblatt 01", FileType: "pdf", SectionID: "s1", SectionName: "Week 1"},
		{ID: "4", Name: "Aufgabenblatt 02", FileType: "pdf", SectionID: "s2", SectionName: "Week 2"},
	}, "created", time.Date(2026, 6, 7, 10, 0, 0, 0, time.UTC))

	if payload.CourseID != "22584" || payload.Status != "created" {
		t.Fatalf("unexpected payload identity: %#v", payload)
	}
	if payload.Summary.Slides != 1 || payload.Summary.Tasks != 2 || payload.Summary.Solutions != 1 {
		t.Fatalf("unexpected summary: %#v", payload.Summary)
	}
	if payload.Summary.LinkedSolutions != 1 || payload.Summary.MissingSolutions != 1 {
		t.Fatalf("unexpected solution summary: %#v", payload.Summary)
	}
	if len(payload.TaskLinks) != 2 {
		t.Fatalf("expected two task links, got %d", len(payload.TaskLinks))
	}
	if payload.TaskLinks[0].Solution == nil || payload.TaskLinks[0].Solution.ID != "3" {
		t.Fatalf("expected first task to link solution 3, got %#v", payload.TaskLinks[0])
	}
	if got := payload.MissingSolutions[0].ID; got != "4" {
		t.Fatalf("expected task 4 to miss solution, got %q", got)
	}
}

func TestBuildRecognizesGermanUmlauts(t *testing.T) {
	payload := Build("1", []moodle.Resource{
		{ID: "1", Name: "Übung 03", FileType: "pdf"},
		{ID: "2", Name: "Musterlösung 03", FileType: "pdf"},
	}, "", time.Unix(0, 0))

	if payload.Summary.Tasks != 1 || payload.Summary.Solutions != 1 || payload.Summary.LinkedSolutions != 1 {
		t.Fatalf("unexpected summary: %#v", payload.Summary)
	}
}

func TestBuildRecognizesCourseSpecificTaskNames(t *testing.T) {
	payload := Build("22576", []moodle.Resource{
		{ID: "1", Name: "Arbeitsauftrag", FileType: "docx", SectionName: "Woche 3"},
		{ID: "2", Name: "Auftrag Abschlussarbeit & Inhaltsverzeichnis", FileType: "docx", SectionName: "Woche 3"},
		{ID: "3", Name: "Bewertungskriterien Schlusspräsentation", FileType: "xlsx", SectionName: "Woche 3"},
		{ID: "4", Name: "Powerpoint Vorlage", FileType: "pptx", SectionName: "Allgemein"},
	}, "", time.Unix(0, 0))

	if payload.Summary.Tasks != 2 {
		t.Fatalf("expected two real task-like resources, got summary %#v", payload.Summary)
	}
	if payload.Summary.Other != 2 {
		t.Fatalf("expected criteria/template to stay non-task, got summary %#v", payload.Summary)
	}
}

func TestBuildDoesNotPairNeighborSolutionBySectionWhenTaskHasNumber(t *testing.T) {
	payload := Build("22584", []moodle.Resource{
		{ID: "9", Name: "Aufgabenblatt 09", FileType: "pdf", SectionID: "s4", SectionName: "Nachrichtengekoppelte Systeme"},
		{ID: "10", Name: "Aufgabenblatt 10", FileType: "pdf", SectionID: "s4", SectionName: "Nachrichtengekoppelte Systeme"},
		{ID: "10s", Name: "Aufgabenblatt 10 -- Lösung", FileType: "pdf", SectionID: "s4", SectionName: "Nachrichtengekoppelte Systeme"},
	}, "", time.Unix(0, 0))

	if payload.Summary.LinkedSolutions != 1 || payload.Summary.MissingSolutions != 1 {
		t.Fatalf("unexpected solution summary: %#v", payload.Summary)
	}
	for _, link := range payload.TaskLinks {
		if link.Task.ID == "9" && link.Solution != nil {
			t.Fatalf("task 9 should not receive task 10 solution: %#v", link)
		}
		if link.Task.ID == "10" && (link.Solution == nil || link.Solution.ID != "10s") {
			t.Fatalf("task 10 should receive its own solution: %#v", link)
		}
	}
}

func TestBuildInventoryGroupsTasksSolutionsAndReferences(t *testing.T) {
	inventory := BuildInventory("22584", []moodle.Resource{
		{ID: "1", Name: "Teil 01 Memory Hierarchy", FileType: "pdf", SectionID: "s1", SectionName: "Woche 1"},
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionID: "s1", SectionName: "Woche 1"},
		{ID: "3", Name: "Lösung Aufgabenblatt 01", FileType: "pdf", SectionID: "s1", SectionName: "Woche 1"},
		{ID: "4", Name: "Aufgabenblatt 09", FileType: "pdf", SectionID: "s4", SectionName: "Woche 4"},
		{ID: "5", Name: "Aufgabenblatt 10", FileType: "pdf", SectionID: "s4", SectionName: "Woche 4"},
		{ID: "6", Name: "Aufgabenblatt 10 -- Lösung", FileType: "pdf", SectionID: "s4", SectionName: "Woche 4"},
		{ID: "7", Name: "Modulbeschreibung", FileType: "pdf", SectionID: "s0", SectionName: "Allgemein"},
		{ID: "8", Name: "Forum Fragen", Type: "forum", SectionID: "s0", SectionName: "Allgemein"},
		{ID: "9", Name: "Externes Werkzeug", Type: "url", SectionID: "s0", SectionName: "Allgemein"},
	}, time.Date(2026, 6, 12, 10, 0, 0, 0, time.UTC))

	if inventory.CourseID != "22584" || inventory.GeneratedAt != "2026-06-12T10:00:00Z" {
		t.Fatalf("unexpected inventory identity: %#v", inventory)
	}
	if inventory.Summary.TotalResources != 9 || inventory.Summary.LectureMaterial != 1 || inventory.Summary.TaskGroups != 3 {
		t.Fatalf("unexpected summary: %#v", inventory.Summary)
	}
	if inventory.Summary.PairedTaskGroups != 2 || inventory.Summary.MissingSolutionGroups != 1 || inventory.Summary.AmbiguousTaskGroups != 0 {
		t.Fatalf("unexpected pairing summary: %#v", inventory.Summary)
	}
	if inventory.Summary.References != 1 || inventory.Summary.Interactions != 1 || inventory.Summary.Unknown != 1 {
		t.Fatalf("unexpected non-task summary: %#v", inventory.Summary)
	}

	if len(inventory.TaskGroups) != 3 {
		t.Fatalf("expected three task groups, got %d", len(inventory.TaskGroups))
	}
	firstGroup := inventory.TaskGroups[0]
	if firstGroup.ID != "task-group-1" || firstGroup.PairingStatus != "paired" {
		t.Fatalf("unexpected first group: %#v", firstGroup)
	}
	if firstGroup.Solution == nil || firstGroup.Solution.ID != "3" {
		t.Fatalf("expected first group to link solution 3, got %#v", firstGroup)
	}
	secondGroup := inventory.TaskGroups[1]
	if secondGroup.ID != "task-group-9" || secondGroup.PairingStatus != "missing_solution" {
		t.Fatalf("unexpected second group: %#v", secondGroup)
	}
	thirdGroup := inventory.TaskGroups[2]
	if thirdGroup.ID != "task-group-10" || thirdGroup.Solution == nil || thirdGroup.Solution.ID != "6" {
		t.Fatalf("expected task 10 to link its own solution, got %#v", thirdGroup)
	}
	if len(inventory.Unknown) != 1 || inventory.Unknown[0].ID != "9" {
		t.Fatalf("expected unknown resource 7 to be preserved, got %#v", inventory.Unknown)
	}
}

func TestLoadInventoryPersistsCourseInventory(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	_, err := LoadInventory(courseID, []moodle.Resource{
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionID: "s1"},
		{ID: "3", Name: "Lösung Aufgabenblatt 01", FileType: "pdf", SectionID: "s1"},
	}, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
	})
	if err != nil {
		t.Fatalf("LoadInventory: %v", err)
	}

	path := filepath.Join(root, "courses", courseID, "inventory", "course-inventory.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read inventory: %v", err)
	}
	var persisted contract.CourseInventoryResponse
	if err := json.Unmarshal(data, &persisted); err != nil {
		t.Fatalf("decode inventory: %v", err)
	}
	if persisted.Summary.PairedTaskGroups != 1 || persisted.TaskGroups[0].Solution == nil {
		t.Fatalf("unexpected persisted inventory: %#v", persisted)
	}
}

func TestLoadExtractedDocumentsBuildsRenderableStructure(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	resources := []moodle.Resource{
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Einführung"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "2-Aufgabenblatt 01", strings.Join([]string{
		"# Aufgabe 1",
		"",
		"- Teil A",
		"- Teil B",
		"",
		"E = mc^2",
	}, "\n"))

	response, err := LoadExtractedDocuments(courseID, resources, RunOptions{
		Root: root,
		Now:  time.Date(2026, 6, 12, 10, 30, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("LoadExtractedDocuments: %v", err)
	}
	if response.RunID != "baseline-20260612T103000Z" || response.Engine == "" {
		t.Fatalf("unexpected run metadata: %#v", response)
	}
	if response.Summary.TotalDocuments != 1 || response.Summary.TotalPages != 1 || response.Summary.TotalBlocks != 3 {
		t.Fatalf("unexpected summary: %#v", response.Summary)
	}
	document := response.Documents[0]
	if document.Resource.ID != "2" || document.Status != "machine-extracted" {
		t.Fatalf("unexpected document: %#v", document)
	}
	blocks := document.Pages[0].Blocks
	if blocks[0].Type != "heading" || blocks[1].Type != "list" || blocks[2].Type != "formula" {
		t.Fatalf("unexpected blocks: %#v", blocks)
	}
	latestPath := filepath.Join(root, "courses", courseID, "extracted", "latest-documents.json")
	if _, err := os.Stat(latestPath); err != nil {
		t.Fatalf("expected latest document structure to be written: %v", err)
	}

	cached, err := LoadExtractedDocuments(courseID, resources, RunOptions{
		Root: root,
		Now:  time.Date(2026, 6, 12, 10, 31, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("LoadExtractedDocuments cached: %v", err)
	}
	if cached.RunID != response.RunID {
		t.Fatalf("expected cached document run %q, got %q", response.RunID, cached.RunID)
	}
	unexpectedRunPath := filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260612T103100Z")
	if _, err := os.Stat(unexpectedRunPath); !os.IsNotExist(err) {
		t.Fatalf("expected cached read not to create a new run, stat err=%v", err)
	}
}

func TestOpenExtractedAssetServesOnlyCourseArtifacts(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	assetPath := filepath.Join(root, "courses", courseID, "extracted", "runs", "run-1", "assets", "page.png")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatalf("mkdir asset dir: %v", err)
	}
	if err := os.WriteFile(assetPath, []byte{0x89, 0x50, 0x4e, 0x47}, 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	data, contentType, err := OpenExtractedAsset(courseID, assetPath, RunOptions{Root: root})
	if err != nil {
		t.Fatalf("OpenExtractedAsset: %v", err)
	}
	if string(data) != string([]byte{0x89, 0x50, 0x4e, 0x47}) || !strings.Contains(contentType, "image/png") {
		t.Fatalf("unexpected asset response data=%v contentType=%q", data, contentType)
	}

	outsidePath := filepath.Join(root, "other-course.png")
	if err := os.WriteFile(outsidePath, []byte("nope"), 0o644); err != nil {
		t.Fatalf("write outside asset: %v", err)
	}
	_, _, err = OpenExtractedAsset(courseID, outsidePath, RunOptions{Root: root})
	if !errors.Is(err, ErrInvalidExtractedAssetPath) {
		t.Fatalf("expected invalid asset path, got %v", err)
	}
}

func TestLoadTaskViewDoesNotGenerateFakeTasksWhenCourseHasNoTaskSheets(t *testing.T) {
	root := t.TempDir()
	courseID := "17503"
	resources := []moodle.Resource{
		{ID: "1", Name: "Folien 1.1 - Einführung", FileType: "pdf", SectionName: "Termin 1"},
		{ID: "2", Name: "Powerpoint Vorlage", FileType: "pptx", SectionName: "Allgemein"},
		{ID: "3", Name: "Bewertungskriterien", FileType: "pdf", SectionName: "Leistungsnachweis"},
	}
	writeExtractedFixture(t, root, courseID, "slides", "1-Folien 1.1 - Einführung", "course slide text")

	view, err := LoadTaskView(courseID, resources, true, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if len(view.Sheets) != 0 {
		t.Fatalf("expected no fake generated task sheets, got %#v", view.Sheets)
	}
}

func TestRecordTaskStatusPersistsDoneProgress(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	resources := []moodle.Resource{
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Einführung"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "2-Aufgabenblatt 01", "task text")
	id := taskID(contract.StudyPipelineMaterial{ID: "2", Name: "Aufgabenblatt 01"})
	if err := RecordTaskStatus(root, courseID, id, "done"); err != nil {
		t.Fatalf("RecordTaskStatus: %v", err)
	}

	view, err := LoadTaskView(courseID, resources, false, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if got := view.Sheets[0].Tasks[0].Status; got != "done" {
		t.Fatalf("status = %q, want done", got)
	}
	if view.Progress.Done != 1 || view.Progress.Checked != 1 || view.Progress.Open != 0 {
		t.Fatalf("unexpected progress: %#v", view.Progress)
	}
}

func TestCuratedStageDoesNotDownloadRawMaterials(t *testing.T) {
	_, err := RunStage("17503", []moodle.Resource{
		{ID: "1", Name: "Folien 1.1 - Einführung", URL: "https://example.invalid/material.pdf", FileType: "pdf"},
	}, "curated", RunOptions{
		Root:       t.TempDir(),
		Now:        time.Unix(0, 0),
		Downloader: failingDownloader{},
	})
	if err == nil {
		t.Fatalf("expected curated stage to fail without complete element accountability")
	}
	if strings.Contains(err.Error(), "downloader should not be called") {
		t.Fatalf("curated stage called downloader: %v", err)
	}
	if !strings.Contains(err.Error(), "element accountability incomplete") {
		t.Fatalf("expected accountability error, got %v", err)
	}
}

func TestRunStageCarriesRequestedEngineMetadata(t *testing.T) {
	response, err := RunStage("22584", []moodle.Resource{
		{ID: "1", Name: "Aufgabenblatt 01", FileType: "pdf"},
	}, "extracted", RunOptions{
		Root:       t.TempDir(),
		Now:        time.Unix(0, 0),
		Engine:     "marker",
		ConfigHash: "config:extracted:marker:layout-v1",
	})
	if err != nil {
		t.Fatalf("RunStage extracted: %v", err)
	}
	if response.Engine != "marker" || response.ConfigHash != "config:extracted:marker:layout-v1" {
		t.Fatalf("unexpected run metadata engine=%q config=%q", response.Engine, response.ConfigHash)
	}
}

func TestCuratedStageCarriesCodexModelMetadata(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	resources := []moodle.Resource{
		{ID: "1", Name: "Lecture Teil 03", URL: "https://example.invalid/teil-03.txt", FileType: "txt"},
	}
	if _, err := RunStage(courseID, resources, "extracted", RunOptions{
		Root:       root,
		Now:        time.Unix(0, 0),
		Downloader: staticDownloader{data: []byte("real extracted lecture text"), contentType: "text/plain"},
	}); err != nil {
		t.Fatalf("RunStage extracted: %v", err)
	}

	response, err := RunStage(courseID, resources, "codex", RunOptions{
		Root:            root,
		Now:             time.Unix(0, 0),
		Model:           "gpt-test",
		ReasoningEffort: "high",
	})
	if err == nil {
		t.Fatalf("expected curated stage to fail without complete element accountability")
	}
	if response.Stage != "curated" || response.Engine != "codex" {
		t.Fatalf("expected canonical curated codex response, got stage=%q engine=%q", response.Stage, response.Engine)
	}
	if response.ConfigHash != "config:curated:codex:gpt-test:high" {
		t.Fatalf("unexpected config hash: %q", response.ConfigHash)
	}
}

func TestCuratedStageRunsCodexCurationWhenModelIsSelected(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 16, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 2\n\nGegeben sei ein Diagramm.\n\nBestimmen Sie die Intensität.")
	imagePath := filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T160000Z", "assets", "947711", "images", "roofline.png")
	pagePath := filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T160000Z", "assets", "947711", "pages", "page-1.png")
	for _, path := range []string{imagePath, pagePath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir image fixture: %v", err)
		}
		if err := os.WriteFile(path, []byte("fake image"), 0o644); err != nil {
			t.Fatalf("write image fixture: %v", err)
		}
	}
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID: courseID,
		RunID:    "baseline-20260614T160000Z",
		Engine:   extractedDocumentEngine,
		Documents: []contract.PDFDocument{{
			ID: "947711",
			Resource: contract.StudyPipelineMaterial{
				ID:       "947711",
				Name:     "Aufgabenblatt 01",
				Type:     "task",
				FileType: "pdf",
			},
			RunID:  "baseline-20260614T160000Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Markdown:       "Aufgabe 2\n\nGegeben sei ein Diagramm.\n\nBestimmen Sie die Intensität.",
				PreviewAssetID: "page-001-preview",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Gegeben sei ein Diagramm.",
					Markdown:   "Gegeben sei ein Diagramm.",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{
				{ID: "page-001-preview", Kind: "page_preview", Path: pagePath, PageNumber: 1, MimeType: "image/png", Role: "page_preview"},
				{ID: "embedded-image-001", Kind: "embedded_image", Path: imagePath, PageNumber: 1, MimeType: "image/png", Role: "extracted_image"},
			},
		}},
	})
	curator := &fakeCurator{
		output: CurationOutput{
			ContentMarkdown: strings.Join([]string{
				"# Aufgabe 2",
				"",
				"Gegeben sei ein Diagramm.",
				"",
				curatedAssetFigure(courseID, contract.DocumentAsset{ID: "embedded-image-001", Kind: "embedded_image", Path: imagePath}),
				"",
				"Bestimmen Sie die Intensität.",
			}, "\n"),
			ElementDecisions: []CurationElementDecision{
				{SourceElementID: "947711-p001-b001", Outcome: "used", Reason: "The paragraph is represented in the final task.", Confidence: "high"},
				{SourceElementID: "947711:embedded-image-001", Outcome: "used", Reason: "The roofline diagram is required and placed inline.", Confidence: "high"},
			},
			Checklist: CurationVerificationChecklist{
				PageImagesReviewed:        true,
				ExtractedElementsReviewed: true,
				LayoutReconstructed:       true,
				RenderedPreviewChecked:    true,
				SourceMappingComplete:     true,
				FinalElementOutcomes:      true,
			},
			Model: "gpt-test",
		},
	}

	response, err := RunStage(courseID, resources, "codex", RunOptions{
		Root:    root,
		Now:     now,
		Model:   "gpt-test",
		Curator: curator,
	})
	if err != nil {
		t.Fatalf("RunStage codex: %v", err)
	}
	if curator.input.Model != "gpt-test" || !strings.Contains(curator.input.Prompt, "Every listed source element") {
		t.Fatalf("curator did not receive the curation prompt: %#v", curator.input)
	}
	if response.CurationChecklist == nil || response.CurationChecklist.Status != "complete" {
		t.Fatalf("expected complete curation checklist, got %#v", response.CurationChecklist)
	}
	taskOutput, err := os.ReadFile(filepath.Join(root, "courses", courseID, "curated", "tasks", safeSegment(taskID(contract.StudyPipelineMaterial{ID: "947711", Name: "Aufgabenblatt 01"}))+".mdx"))
	if err != nil {
		t.Fatalf("read curated task: %v", err)
	}
	if !strings.Contains(string(taskOutput), "embedded-image-001") {
		t.Fatalf("expected curated task to include codex-placed image, got %q", string(taskOutput))
	}
	view, err := LoadTaskView(courseID, resources, false, RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("LoadTaskView after Codex curation: %v", err)
	}
	if len(view.Sheets) != 1 || view.Sheets[0].Readiness != "ready" || view.Sheets[0].ReadOnly {
		t.Fatalf("expected Codex-curated sheet to be ready, got %#v", view.Sheets)
	}
	for _, decision := range response.ElementDecisions {
		if decision.DecidedBy != "codex" {
			t.Fatalf("expected Codex-backed decision, got %#v", decision)
		}
	}
}

func TestCuratedStageCanUseCodexSDKRunner(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 23, 8, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nBestimmen Sie den Speedup.")
	pagePath := filepath.Join(root, "courses", courseID, "extracted", "runs", "sdk-test", "assets", "947711", "pages", "page-1.png")
	if err := os.MkdirAll(filepath.Dir(pagePath), 0o755); err != nil {
		t.Fatalf("mkdir page fixture: %v", err)
	}
	if err := os.WriteFile(pagePath, []byte("fake page"), 0o644); err != nil {
		t.Fatalf("write page fixture: %v", err)
	}
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID: courseID,
		RunID:    "sdk-test",
		Engine:   extractedDocumentEngine,
		Documents: []contract.PDFDocument{{
			ID: "947711",
			Resource: contract.StudyPipelineMaterial{
				ID:       "947711",
				Name:     "Aufgabenblatt 01",
				Type:     "task",
				FileType: "pdf",
			},
			RunID:  "sdk-test",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Markdown:       "Aufgabe 1\n\nBestimmen Sie den Speedup.",
				PreviewAssetID: "page-001-preview",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Bestimmen Sie den Speedup.",
					Markdown:   "Bestimmen Sie den Speedup.",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{{ID: "page-001-preview", Kind: "page_preview", Path: pagePath, PageNumber: 1, MimeType: "image/png", Role: "page_preview"}},
		}},
	})
	curationJSON := `{"contentMarkdown":"# Aufgabenblatt 01\n\nSource: [Moodle resource](moodle-resource:947711)\n\nBestimmen Sie den Speedup.","elementDecisions":[{"sourceElementId":"947711-p001-b001","outcome":"used","reason":"The task statement is preserved.","outputReference":"Aufgabenblatt 01","confidence":"high"}],"checklist":{"pageImagesReviewed":true,"extractedElementsReviewed":true,"layoutReconstructed":true,"renderedPreviewChecked":true,"sourceMappingComplete":true,"finalElementOutcomes":true}}`
	requestPath := filepath.Join(root, "sdk-request.json")
	responsePath := filepath.Join(root, "sdk-response.json")
	if err := os.WriteFile(responsePath, []byte(`{"finalResponse":`+strconv.Quote(curationJSON)+`,"threadId":"test-sdk-thread","usage":null}`+"\n"), 0o644); err != nil {
		t.Fatalf("write SDK response: %v", err)
	}
	runnerPath := filepath.Join(root, "fake-sdk-runner.sh")
	if err := os.WriteFile(runnerPath, []byte("#!/bin/sh\nset -eu\ncat > "+shellQuoteForTest(requestPath)+"\ncat "+shellQuoteForTest(responsePath)+"\n"), 0o755); err != nil {
		t.Fatalf("write SDK runner: %v", err)
	}

	response, err := RunStage(courseID, resources, "codex", RunOptions{
		Root:  root,
		Now:   now,
		Model: "gpt-test",
		Curator: SDKCommandCodexCurator{
			Command: shellQuoteForTest(runnerPath),
		},
	})
	if err != nil {
		t.Fatalf("RunStage codex with SDK runner: %v", err)
	}
	if response.CurationChecklist == nil || response.CurationChecklist.Status != "complete" {
		t.Fatalf("expected complete SDK curation checklist, got %#v", response.CurationChecklist)
	}
	view, err := LoadTaskView(courseID, resources, false, RunOptions{Root: root, Now: now})
	if err != nil {
		t.Fatalf("LoadTaskView after SDK curation: %v", err)
	}
	if len(view.Sheets) != 1 || view.Sheets[0].Readiness != "ready" || view.Sheets[0].ReadOnly {
		t.Fatalf("expected SDK-curated sheet to be ready, got %#v", view.Sheets)
	}
	requestData, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatalf("read SDK runner request: %v", err)
	}
	if !strings.Contains(string(requestData), `"outputSchema"`) || !strings.Contains(string(requestData), pagePath) {
		t.Fatalf("SDK runner request did not include schema and image evidence: %s", string(requestData))
	}
}

func TestCuratedStageDoesNotMaterializeCodexContentWithoutElementProof(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 17, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"}}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 2\n\nGegeben sei ein Diagramm.")
	pagePath := filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T170000Z", "assets", "947711", "pages", "page-1.png")
	if err := os.MkdirAll(filepath.Dir(pagePath), 0o755); err != nil {
		t.Fatalf("mkdir page fixture: %v", err)
	}
	if err := os.WriteFile(pagePath, []byte("fake page"), 0o644); err != nil {
		t.Fatalf("write page fixture: %v", err)
	}
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID: courseID,
		RunID:    "baseline-20260614T170000Z",
		Engine:   extractedDocumentEngine,
		Documents: []contract.PDFDocument{{
			ID: "947711",
			Resource: contract.StudyPipelineMaterial{
				ID:       "947711",
				Name:     "Aufgabenblatt 01",
				Type:     "task",
				FileType: "pdf",
			},
			RunID:  "baseline-20260614T170000Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Markdown:       "Aufgabe 2\n\nGegeben sei ein Diagramm.",
				PreviewAssetID: "page-001-preview",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Gegeben sei ein Diagramm.",
					Markdown:   "Gegeben sei ein Diagramm.",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{{ID: "page-001-preview", Kind: "page_preview", Path: pagePath, PageNumber: 1, MimeType: "image/png", Role: "page_preview"}},
		}},
	})
	curator := &fakeCurator{
		output: CurationOutput{
			ContentMarkdown:  "# Codex-only content that must not become active",
			ElementDecisions: []CurationElementDecision{},
			Checklist: CurationVerificationChecklist{
				PageImagesReviewed:        true,
				ExtractedElementsReviewed: true,
				LayoutReconstructed:       true,
				RenderedPreviewChecked:    true,
				SourceMappingComplete:     true,
				FinalElementOutcomes:      true,
			},
			Model: "gpt-test",
		},
	}

	response, err := RunStage(courseID, resources, "codex", RunOptions{
		Root:    root,
		Now:     now,
		Model:   "gpt-test",
		Curator: curator,
	})
	if err == nil {
		t.Fatal("expected missing Codex element proof to fail the stage")
	}
	if response.Status != "failed" {
		t.Fatalf("expected failed response, got %#v", response)
	}
	taskOutput, readErr := os.ReadFile(filepath.Join(root, "courses", courseID, "curated", "tasks", safeSegment(taskID(contract.StudyPipelineMaterial{ID: "947711", Name: "Aufgabenblatt 01"}))+".mdx"))
	if readErr != nil {
		t.Fatalf("read deterministic task output: %v", readErr)
	}
	if strings.Contains(string(taskOutput), "Codex-only content") {
		t.Fatalf("failed Codex curation content was materialized: %s", string(taskOutput))
	}
}

type failingDownloader struct{}

func (failingDownloader) DownloadFileToBuffer(string) (moodle.DownloadResult, error) {
	return moodle.DownloadResult{}, fmt.Errorf("downloader should not be called")
}

type staticDownloader struct {
	data        []byte
	contentType string
}

func (downloader staticDownloader) DownloadFileToBuffer(string) (moodle.DownloadResult, error) {
	return moodle.DownloadResult{Data: downloader.data, ContentType: downloader.contentType}, nil
}

func TestCuratedStageRunsExtractionWhenMissing(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	resources := []moodle.Resource{
		{ID: "1", Name: "Lecture Teil 03", URL: "https://example.invalid/teil-03.txt", FileType: "txt"},
	}
	_, err := RunStage(courseID, resources, "curated", RunOptions{
		Root:       root,
		Now:        time.Unix(0, 0),
		Downloader: staticDownloader{data: []byte("real extracted lecture text"), contentType: "text/plain"},
	})
	if err == nil {
		t.Fatalf("expected curated stage to fail without complete element accountability")
	}
	if !strings.Contains(err.Error(), "element accountability incomplete") {
		t.Fatalf("expected accountability error, got %v", err)
	}

	script, err := os.ReadFile(filepath.Join(root, "courses", courseID, "curated", "script", "Script.mdx"))
	if err != nil {
		t.Fatalf("read script: %v", err)
	}
	if !strings.Contains(string(script), "real extracted lecture text") {
		t.Fatalf("expected curated script to include extracted text, got %q", string(script))
	}
	if strings.Contains(string(script), "No extracted text was available") {
		t.Fatalf("curated script still contains missing extraction placeholder: %q", string(script))
	}
}

func TestStatusDoesNotReportCuratedWithoutExtractedArtifacts(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	curatedTasksDir := filepath.Join(root, "courses", courseID, "curated", "tasks")
	if err := os.MkdirAll(curatedTasksDir, 0o755); err != nil {
		t.Fatalf("mkdir curated tasks: %v", err)
	}
	if err := os.WriteFile(filepath.Join(curatedTasksDir, "Tasks.mdx"), []byte("# Tasks\n"), 0o644); err != nil {
		t.Fatalf("write stale curated tasks: %v", err)
	}

	status := Status(courseID, nil, RunOptions{Root: root, Now: time.Unix(0, 0)})
	if status.Stage == "curated" || status.Status == "curated-ready" {
		t.Fatalf("stale curated artifacts without extraction reported ready: %#v", status)
	}
}

func TestCuratedStageBuildsScriptFromExtractedContent(t *testing.T) {
	root := t.TempDir()
	courseID := "22585"
	resources := []moodle.Resource{
		{ID: "1", Name: "Neural Networks", FileType: "pdf", SectionName: "Week 1"},
		{ID: "2", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "slides", "1-Neural Networks", "Hidden layers transform tensors into useful representations.")
	writeExtractedFixture(t, root, courseID, "tasks", "2-Aufgabenblatt 01", "Berechnen Sie die Anzahl Parameter des neuronalen Netzes.")

	view, err := LoadTaskView(courseID, resources, true, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if !strings.Contains(view.ScriptMarkdown, "Hidden layers transform tensors") {
		t.Fatalf("expected script to include extracted slide content, got %q", view.ScriptMarkdown)
	}
	if strings.Contains(view.ScriptMarkdown, "ready for the Codex cleanup stage") {
		t.Fatalf("script still contains placeholder cleanup text: %q", view.ScriptMarkdown)
	}
	if len(view.Sheets) != 1 || !strings.Contains(view.Sheets[0].Tasks[0].PromptMarkdown, "Berechnen Sie die Anzahl Parameter") {
		t.Fatalf("expected task prompt to include extracted task text, got %#v", view.Sheets)
	}
	if len(view.ScriptSections) != 1 || view.ScriptSections[0].Status != "machine-extracted" {
		t.Fatalf("expected script section status to be machine-extracted, got %#v", view.ScriptSections)
	}
	if view.Sheets[0].Tasks[0].ContentState.Status != "machine-extracted" {
		t.Fatalf("expected task status to be machine-extracted, got %#v", view.Sheets[0].Tasks[0].ContentState)
	}
}

func TestLoadTaskViewMarksUnprocessedSheetsReadOnly(t *testing.T) {
	root := t.TempDir()
	courseID := "22586"
	now := time.Date(2026, 6, 22, 12, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "1", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
		{ID: "2", Name: "Aufgabenblatt 02", FileType: "pdf", SectionName: "Week 2"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "1-Aufgabenblatt 01", "Rohtext 1")
	writeExtractedFixture(t, root, courseID, "tasks", "2-Aufgabenblatt 02", "Rohtext 2")
	if err := writeImprovedContent(root, courseID, contract.StudyPipelineMaterial{
		ID:   "1",
		Name: "Aufgabenblatt 01",
		Type: "task",
	}, "task", "Codex aufbereitete Aufgabe 1", "gpt-test", now); err != nil {
		t.Fatalf("write improved task: %v", err)
	}

	view, err := LoadTaskView(courseID, resources, false, RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if len(view.Sheets) != 2 {
		t.Fatalf("expected two sheets, got %#v", view.Sheets)
	}
	if view.Sheets[0].Readiness != "ready" || view.Sheets[0].ReadOnly {
		t.Fatalf("expected first sheet to be usable, got %#v", view.Sheets[0])
	}
	if view.Sheets[0].ContentState.Status != "codex-improved" {
		t.Fatalf("expected first sheet to be Codex improved, got %#v", view.Sheets[0].ContentState)
	}
	if view.Sheets[1].Readiness != "unprocessed" || !view.Sheets[1].ReadOnly {
		t.Fatalf("expected second sheet to be read-only and unprocessed, got %#v", view.Sheets[1])
	}
	if view.Sheets[1].ContentState.Status != "machine-extracted" {
		t.Fatalf("expected second sheet to be machine extracted, got %#v", view.Sheets[1].ContentState)
	}
}

func TestPromoteCodexCurationOutputWritesImprovedTask(t *testing.T) {
	root := t.TempDir()
	t.Setenv(EnvArtifactRoot, root)
	courseID := "22584"
	userID := "user_test"
	resourceID := "947711"
	now := time.Date(2026, 6, 22, 22, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: resourceID, Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	stateRoot := filepath.Join(root, "codex-users", safeSegment(userID))
	if err := os.MkdirAll(stateRoot, 0o700); err != nil {
		t.Fatalf("mkdir codex state: %v", err)
	}
	curationPath := "last-curation-task-947711-aufgabenblatt-01-gpt-5.5.md"
	curation := CurationOutput{
		Model:           "gpt-5.5",
		ContentMarkdown: "# Aufgabenblatt 01\n\nBearbeiten Sie Aufgabe 1.",
	}
	data, err := json.Marshal(curation)
	if err != nil {
		t.Fatalf("marshal curation: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateRoot, curationPath), data, 0o600); err != nil {
		t.Fatalf("write curation: %v", err)
	}

	response, err := PromoteCodexCurationOutput(courseID, resources, contract.StudyPipelinePromoteCurationRequest{
		ResourceID:   resourceID,
		CurationPath: curationPath,
	}, RunOptions{
		Root:   root,
		Now:    now,
		UserID: userID,
	})
	if err != nil {
		t.Fatalf("PromoteCodexCurationOutput: %v", err)
	}
	if response.Target.Status != "codex-improved" || response.Target.Model != "gpt-5.5" {
		t.Fatalf("unexpected target: %#v", response.Target)
	}
	promoted := improvedContentForMaterial(root, courseID, contract.StudyPipelineMaterial{
		ID:   resourceID,
		Name: "Aufgabenblatt 01",
		Type: "task",
	}, "task")
	if !strings.Contains(promoted, "Bearbeiten Sie Aufgabe 1.") || !strings.Contains(promoted, "moodle-resource:"+resourceID) {
		t.Fatalf("unexpected promoted content: %q", promoted)
	}
}

func TestLoadTaskViewIncludesExtractedImageAssets(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 9, 10, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nMit Diagramm.")
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID:     courseID,
		RunID:        "baseline-20260614T091000Z",
		GeneratedAt:  now.Format(time.RFC3339),
		Engine:       extractedDocumentEngine,
		ArtifactRoot: filepath.Join(root, "courses", courseID),
		Documents: []contract.PDFDocument{{
			ID: "947711",
			Resource: contract.StudyPipelineMaterial{
				ID:       "947711",
				Name:     "Aufgabenblatt 01",
				Type:     "task",
				FileType: "pdf",
			},
			RunID:  "baseline-20260614T091000Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:         "947711-page-001",
				PageNumber: 1,
				Text:       "Aufgabe 1\n\nMit Diagramm.",
				Markdown:   "Aufgabe 1\n\nMit Diagramm.",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Mit Diagramm.",
					Markdown:   "Mit Diagramm.",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{{
				ID:       "embedded-image-001",
				Kind:     "embedded_image",
				Path:     filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T091000Z", "assets", "947711-aufgabenblatt-01", "images", "image-000.png"),
				MimeType: "image/png",
				Role:     "extracted_image",
			}},
			Diagnostics: contract.ExtractedDocumentDiagnostics{
				ExtractedImageAssets: 1,
				UnusedImageAssets:    []string{"embedded-image-001"},
			},
		}},
	})

	view, err := LoadTaskView(courseID, resources, false, RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if len(view.Sheets) != 1 || len(view.Sheets[0].Tasks) != 1 {
		t.Fatalf("expected one task, got %#v", view.Sheets)
	}
	prompt := view.Sheets[0].Tasks[0].PromptMarkdown
	if !strings.Contains(prompt, "embedded-image-001") || !strings.Contains(prompt, "/api/study-pipeline/courses/22584/study-pipeline/extracted-asset?path=") {
		t.Fatalf("expected task view prompt to include extracted image figure, got %q", prompt)
	}
}

func TestLoadTaskViewPlacesExtractedDiagramInline(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 14, 0, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeImprovedContent(root, courseID, contract.StudyPipelineMaterial{
		ID:       "947711",
		Name:     "Aufgabenblatt 01",
		Type:     "task",
		FileType: "pdf",
	}, "task", strings.Join([]string{
		"# Aufgabenblatt 01",
		"",
		"## Aufgabe 2: Roofline-Analyse",
		"",
		"Gegeben sei eine Spitzenbandbreite gemäss folgendem Diagramm.",
		"",
		"Bestimmen Sie für die Schönauer-Vektortriade:",
		"",
		"- die Arbeit W",
		"",
		"## PDF-Bilder",
		"",
		"<figure>old appendix</figure>",
	}, "\n"), "test", now)
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID:     courseID,
		RunID:        "baseline-20260614T140000Z",
		GeneratedAt:  now.Format(time.RFC3339),
		Engine:       extractedDocumentEngine,
		ArtifactRoot: filepath.Join(root, "courses", courseID),
		Documents: []contract.PDFDocument{{
			ID: "947711",
			Resource: contract.StudyPipelineMaterial{
				ID:       "947711",
				Name:     "Aufgabenblatt 01",
				Type:     "task",
				FileType: "pdf",
			},
			RunID:  "baseline-20260614T140000Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Text:           "Aufgabe 2\nGegeben sei eine Spitzenbandbreite gemäss folgendem Diagramm.\nBestimmen Sie...",
				Markdown:       "Aufgabe 2\nGegeben sei eine Spitzenbandbreite gemäss folgendem Diagramm.\nBestimmen Sie...",
				PreviewAssetID: "page-001-preview",
			}},
			Assets: []contract.DocumentAsset{
				{
					ID:         "page-001-preview",
					Kind:       "page_preview",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T140000Z", "assets", "947711", "pages", "page-1.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "page_preview",
				},
				{
					ID:         "embedded-image-001",
					Kind:       "embedded_image",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T140000Z", "assets", "947711", "images", "roofline.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "extracted_image",
				},
			},
		}},
	})

	view, err := LoadTaskView(courseID, resources, false, RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	prompt := view.Sheets[0].Tasks[0].PromptMarkdown
	if strings.Contains(prompt, "page-001-preview") {
		t.Fatalf("expected page preview to stay out of task content, got %q", prompt)
	}
	if strings.Contains(prompt, "old appendix") || strings.Contains(prompt, "## PDF-Bilder") {
		t.Fatalf("expected generated image appendix to be removed, got %q", prompt)
	}
	diagramIndex := strings.Index(prompt, "folgendem Diagramm")
	imageIndex := strings.Index(prompt, "embedded-image-001")
	questionIndex := strings.Index(prompt, "Bestimmen Sie")
	if diagramIndex < 0 || imageIndex < 0 || questionIndex < 0 {
		t.Fatalf("expected diagram reference, embedded image, and question text, got %q", prompt)
	}
	if !(diagramIndex < imageIndex && imageIndex < questionIndex) {
		t.Fatalf("expected image between diagram reference and question text, diagram=%d image=%d question=%d prompt=%q", diagramIndex, imageIndex, questionIndex, prompt)
	}
}

func TestLoadTaskViewSerializesCuratedWritesForSameCourse(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
		{ID: "947712", Name: "Aufgabenblatt 01 -- Lösung", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nMit Diagramm.")
	writeExtractedFixture(t, root, courseID, "solutions", "947712-Aufgabenblatt 01 -- Lösung", "Lösung 1")

	var wg sync.WaitGroup
	errs := make(chan error, 24)
	for i := 0; i < cap(errs); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := LoadTaskView(courseID, resources, false, RunOptions{
				Root: root,
				Now:  time.Unix(0, 0),
			})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("LoadTaskView returned concurrent curated write error: %v", err)
		}
	}
}

func TestRefineContentWritesSeparateImprovedArtifact(t *testing.T) {
	root := t.TempDir()
	courseID := "22585"
	resources := []moodle.Resource{
		{ID: "1", Name: "Neural Networks", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "slides", "1-Neural Networks", "ugly extracted tensor text")

	response, err := RefineContent(context.Background(), courseID, resources, contractRefineRequest("script-section", "1"), RunOptions{
		Root:    root,
		Now:     time.Unix(0, 0),
		UserID:  "user-1",
		Refiner: fakeRefiner{content: "## Neural Networks\n\nCleaned text with $x$ and structure.", model: "test-model"},
	})
	if err != nil {
		t.Fatalf("RefineContent: %v", err)
	}
	if response.Target.Status != "codex-improved" || response.Target.Model != "test-model" {
		t.Fatalf("unexpected target state: %#v", response.Target)
	}

	extracted := extractedContentForMaterial(root, courseID, Build(courseID, resources, "", time.Unix(0, 0)).Materials[0])
	if extracted != "ugly extracted tensor text" {
		t.Fatalf("extracted content was modified: %q", extracted)
	}
	view, err := LoadTaskView(courseID, resources, true, RunOptions{Root: root, Now: time.Unix(0, 0)})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if !strings.Contains(view.ScriptMarkdown, "Cleaned text with $x$") {
		t.Fatalf("expected improved content in script, got %q", view.ScriptMarkdown)
	}
	if strings.Contains(view.ScriptMarkdown, "ugly extracted tensor text") {
		t.Fatalf("expected improved content to replace display text only, got %q", view.ScriptMarkdown)
	}
	if len(view.ScriptSections) != 1 || view.ScriptSections[0].Status != "codex-improved" {
		t.Fatalf("expected improved section status, got %#v", view.ScriptSections)
	}
}

func TestRefineContentPassesCustomPromptToRefiner(t *testing.T) {
	root := t.TempDir()
	courseID := "22585"
	resources := []moodle.Resource{
		{ID: "1", Name: "CNN", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "slides", "1-CNN", "extracted convolution text")
	refiner := &captureRefiner{content: "## CNN\n\nCleaned text.", model: "test-model"}

	_, err := RefineContent(context.Background(), courseID, resources, contract.StudyPipelineRefineRequest{
		Kind:         "script-section",
		TargetID:     "1",
		CustomPrompt: "Bitte deutsche Begriffe bevorzugen und wichtige Formeln stärker strukturieren.",
	}, RunOptions{
		Root:    root,
		Now:     time.Unix(0, 0),
		UserID:  "user-1",
		Refiner: refiner,
	})
	if err != nil {
		t.Fatalf("RefineContent: %v", err)
	}
	if refiner.input.CustomPrompt != "Bitte deutsche Begriffe bevorzugen und wichtige Formeln stärker strukturieren." {
		t.Fatalf("custom prompt was not forwarded: %q", refiner.input.CustomPrompt)
	}
}

func TestRefineContentCanUseCodexSDKRunner(t *testing.T) {
	root := t.TempDir()
	courseID := "22585"
	resources := []moodle.Resource{
		{ID: "1", Name: "Lecture Teil 03", FileType: "txt", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "slides", "1-Lecture Teil 03", "Raw lecture text")
	requestPath := filepath.Join(root, "sdk-refine-request.json")
	responsePath := filepath.Join(root, "sdk-refine-response.json")
	if err := os.WriteFile(responsePath, []byte(`{"finalResponse":"## Lecture Teil 03\n\nClean refined text.","threadId":"test-sdk-thread","usage":null}`+"\n"), 0o644); err != nil {
		t.Fatalf("write SDK refine response: %v", err)
	}
	runnerPath := filepath.Join(root, "fake-sdk-refiner.sh")
	if err := os.WriteFile(runnerPath, []byte("#!/bin/sh\nset -eu\ncat > "+shellQuoteForTest(requestPath)+"\ncat "+shellQuoteForTest(responsePath)+"\n"), 0o755); err != nil {
		t.Fatalf("write SDK refine runner: %v", err)
	}

	response, err := RefineContent(context.Background(), courseID, resources, contract.StudyPipelineRefineRequest{
		Kind:            "script-section",
		TargetID:        "1",
		Model:           "gpt-test",
		ReasoningEffort: "high",
	}, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
		Refiner: SDKCommandCodexRefiner{
			Command: shellQuoteForTest(runnerPath),
		},
	})
	if err != nil {
		t.Fatalf("RefineContent with SDK runner: %v", err)
	}
	if response.Target.Status != "codex-improved" || !strings.Contains(response.ContentPreview, "Clean refined text") {
		t.Fatalf("unexpected SDK refine response: %#v", response)
	}
	requestData, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatalf("read SDK refine request: %v", err)
	}
	if !strings.Contains(string(requestData), `"reasoningEffort":"high"`) || !strings.Contains(string(requestData), "Raw lecture text") {
		t.Fatalf("SDK refine request did not include expected prompt data: %s", string(requestData))
	}
}

func TestBuildRefinePromptIncludesCustomPromptAsGuidance(t *testing.T) {
	prompt := buildRefinePrompt(RefineInput{
		CourseID:     "22585",
		Kind:         "task",
		TargetID:     "task-1",
		Title:        "Aufgabe",
		CustomPrompt: "Mach die Aufgabenstellung prüfungsfreundlicher.",
		Content:      "Original source text.",
	})

	if !strings.Contains(prompt, "Additional user instructions for this refinement:") {
		t.Fatalf("custom prompt section missing: %s", prompt)
	}
	if !strings.Contains(prompt, "Mach die Aufgabenstellung prüfungsfreundlicher.") {
		t.Fatalf("custom prompt missing: %s", prompt)
	}
	if !strings.Contains(prompt, "Do not use them to add facts") {
		t.Fatalf("anti-hallucination guard missing: %s", prompt)
	}
}

func TestCuratedStageRemovesStaleGeneratedTaskFiles(t *testing.T) {
	root := t.TempDir()
	courseID := "19489"
	writeExtractedFixture(t, root, courseID, "slides", "1-Einführungsfolien", "slide text")
	staleTaskPath := filepath.Join(root, "courses", courseID, "curated", "tasks", "task-old.mdx")
	if err := os.MkdirAll(filepath.Dir(staleTaskPath), 0o755); err != nil {
		t.Fatalf("mkdir stale task: %v", err)
	}
	if err := os.WriteFile(staleTaskPath, []byte("This task was detected from Moodle material."), 0o644); err != nil {
		t.Fatalf("write stale task: %v", err)
	}

	view, err := LoadTaskView(courseID, []moodle.Resource{
		{ID: "1", Name: "Einführungsfolien", FileType: "pdf", SectionName: "Week 1"},
	}, false, RunOptions{
		Root: root,
		Now:  time.Unix(0, 0),
	})
	if err != nil {
		t.Fatalf("LoadTaskView: %v", err)
	}
	if len(view.Sheets) != 0 {
		t.Fatalf("expected no task sheets, got %#v", view.Sheets)
	}
	if _, err := os.Stat(staleTaskPath); !os.IsNotExist(err) {
		t.Fatalf("expected stale generated task file to be removed, stat err: %v", err)
	}
}

func TestExtractedTextDoesNotUseRawPDFBytesWhenExtractionFails(t *testing.T) {
	content := extractedText(moodle.Resource{
		ID:       "1",
		Name:     "Broken PDF",
		FileType: "pdf",
	}, moodle.DownloadResult{
		Data:        []byte("%PDF-1.7\nxref\ntrailer\n%%EOF"),
		ContentType: "application/pdf",
	})

	if strings.Contains(content, "%PDF-1.7") || strings.Contains(content, "xref") {
		t.Fatalf("expected raw PDF bytes to be excluded, got %q", content)
	}
	if !strings.Contains(content, "No text could be extracted from Broken PDF") {
		t.Fatalf("expected extraction failure marker, got %q", content)
	}
}

func TestReadCodexDeviceAuthStartParsesCLIOutput(t *testing.T) {
	output := strings.Join([]string{
		"Welcome to Codex [v\x1b[90m0.130.0\x1b[0m]",
		"Follow these steps to sign in with ChatGPT using device code authorization:",
		"1. Open this link in your browser and sign in to your account",
		"   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m",
		"2. Enter this one-time code \x1b[90m(expires in 15 minutes)\x1b[0m",
		"   \x1b[94mBGWE-JHZCL\x1b[0m",
	}, "\n")

	start, err := readCodexDeviceAuthStart(strings.NewReader(output))
	if err != nil {
		t.Fatalf("readCodexDeviceAuthStart: %v", err)
	}
	if start.VerificationURI != "https://auth.openai.com/codex/device" {
		t.Fatalf("unexpected verification URI: %q", start.VerificationURI)
	}
	if start.UserCode != "BGWE-JHZCL" {
		t.Fatalf("unexpected user code: %q", start.UserCode)
	}
	if start.ExpiresInSeconds != 15*60 {
		t.Fatalf("unexpected expiry: %d", start.ExpiresInSeconds)
	}
}

func TestParseCodexChatOutputUsesAnswerAndValidActions(t *testing.T) {
	courseID := "22585"
	resourceID := "949833"
	reason := "Open the task sheet the user asked for."
	output := `{"answer":"Opening the task sheet.","actions":[{"type":"open_resource","courseId":"22585","resourceId":"949833","reason":"Open the task sheet the user asked for."},{"type":"open_resource","courseId":null,"resourceId":"bad"},{"type":"unknown","courseId":"22585"}]}`

	result, err := parseCodexChatOutput(output)
	if err != nil {
		t.Fatalf("parseCodexChatOutput: %v", err)
	}
	if result.FinalResponse != "Opening the task sheet." {
		t.Fatalf("unexpected response: %q", result.FinalResponse)
	}
	if len(result.Actions) != 1 {
		t.Fatalf("expected one valid action, got %#v", result.Actions)
	}
	if result.Actions[0].Type != "open_resource" || *result.Actions[0].CourseID != courseID || *result.Actions[0].ResourceID != resourceID || *result.Actions[0].Reason != reason {
		t.Fatalf("unexpected action: %#v", result.Actions[0])
	}
}

func TestParseCodexChatOutputFallsBackToText(t *testing.T) {
	result, err := parseCodexChatOutput("Plain answer from Codex")
	if err != nil {
		t.Fatalf("parseCodexChatOutput: %v", err)
	}
	if result.FinalResponse != "Plain answer from Codex" || len(result.Actions) != 0 {
		t.Fatalf("unexpected fallback result: %#v", result)
	}
}

func TestSelectDefaultCodexChatModelUsesCatalog(t *testing.T) {
	model, effort := selectDefaultCodexChatModel(contract.CodexModelCatalogResponse{
		Models: []contract.CodexModelOption{{
			ID:                     "gpt-5.5",
			DefaultReasoningEffort: "high",
		}},
	}, "")
	if model != "gpt-5.5" || effort != "high" {
		t.Fatalf("default model = %q/%q, want gpt-5.5/high", model, effort)
	}
}

func TestDockerHostMountPathTranslatesStudyDataPath(t *testing.T) {
	t.Setenv("MOODLE_DOCKER_CONTAINER_DATA_DIR", "/data")
	t.Setenv("MOODLE_DOCKER_HOST_DATA_DIR", "/opt/platform/apps/moodle-staging/services-data")

	got := dockerHostMountPath("/data/study/codex-users/user_123")
	want := "/opt/platform/apps/moodle-staging/services-data/study/codex-users/user_123"
	if got != want {
		t.Fatalf("dockerHostMountPath = %q, want %q", got, want)
	}
}

func TestPrepareCodexStateRootUsesGlobalArtifactRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv(EnvArtifactRoot, root)

	got, err := prepareCodexStateRoot(filepath.Join(root, "courses", "22584"), "user-123")
	if err != nil {
		t.Fatalf("prepareCodexStateRoot: %v", err)
	}
	want := filepath.Join(root, "codex-users", "user-123")
	if got != want {
		t.Fatalf("prepareCodexStateRoot = %q, want %q", got, want)
	}
}

func writeExtractedFixture(t *testing.T, root string, courseID string, dirName string, name string, body string) {
	t.Helper()
	path := filepath.Join(root, "courses", safeSegment(courseID), "extracted", dirName, safeSegment(name)+".mdx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir fixture: %v", err)
	}
	content := strings.Join([]string{
		"---",
		"status: extracted",
		"---",
		"",
		body,
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
}

type fakeRefiner struct {
	content string
	model   string
}

func (f fakeRefiner) Refine(context.Context, RefineInput) (RefineOutput, error) {
	return RefineOutput{Content: f.content, Model: f.model}, nil
}

type captureRefiner struct {
	content string
	input   RefineInput
	model   string
}

type fakeCurator struct {
	input  CurationInput
	output CurationOutput
}

func (f *fakeCurator) Curate(_ context.Context, input CurationInput) (CurationOutput, error) {
	f.input = input
	return f.output, nil
}

func (f *captureRefiner) Refine(_ context.Context, input RefineInput) (RefineOutput, error) {
	f.input = input
	return RefineOutput{Content: f.content, Model: f.model}, nil
}

func contractRefineRequest(kind string, targetID string) contract.StudyPipelineRefineRequest {
	return contract.StudyPipelineRefineRequest{Kind: kind, TargetID: targetID}
}
