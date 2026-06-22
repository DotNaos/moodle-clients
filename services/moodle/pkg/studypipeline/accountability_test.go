package studypipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DotNaos/moodle-services/internal/moodle"
	"github.com/DotNaos/moodle-services/internal/store"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func TestCuratedStageWritesElementAccountabilityAndUsesExtractedImages(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 13, 15, 18, 39, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nDie Schönauer-Vektortriade")
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID:     courseID,
		RunID:        "baseline-20260613T151839Z",
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
			RunID:  "baseline-20260613T151839Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Text:           "Aufgabe 1\n\nDie Schönauer-Vektortriade",
				Markdown:       "Aufgabe 1\n\nDie Schönauer-Vektortriade",
				PreviewAssetID: "page-001-preview",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Die Schönauer-Vektortriade",
					Markdown:   "Die Schönauer-Vektortriade",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{
				{
					ID:         "page-001-preview",
					Kind:       "page_preview",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260613T151839Z", "assets", "947711", "pages", "page-1.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "page_preview",
				},
				{
					ID:       "embedded-image-001",
					Kind:     "embedded_image",
					Path:     filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260613T151839Z", "assets", "947711", "images", "image-000.png"),
					MimeType: "image/png",
					Role:     "extracted_image",
				},
			},
		}},
	})

	response, err := RunStage(courseID, resources, "curated", RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("RunStage curated: %v", err)
	}
	if response.CurationChecklist == nil || response.CurationChecklist.Status != "complete" {
		t.Fatalf("expected complete checklist, got %#v", response.CurationChecklist)
	}
	if len(response.ElementDecisions) != 2 {
		t.Fatalf("expected text and image decisions, got %#v", response.ElementDecisions)
	}
	if response.ElementDecisions[0].Outcome != "used_in_output" {
		t.Fatalf("expected text block to be used, got %#v", response.ElementDecisions[0])
	}
	imageDecision := response.ElementDecisions[1]
	if imageDecision.SourceAssetID != "embedded-image-001" || imageDecision.Outcome != "used_in_output" {
		t.Fatalf("expected extracted image to be used in output, got %#v", imageDecision)
	}
	if len(response.ArtifactRefs) < 4 {
		t.Fatalf("expected page render, manifest, checklist, and preview refs, got %#v", response.ArtifactRefs)
	}
	manifestPath := filepath.Join(root, "courses", courseID, "curated", "accountability", "curated-20260613T151839Z", "element-accountability.json")
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("expected accountability manifest: %v", err)
	}
	taskPath := filepath.Join(root, "courses", courseID, "curated", "tasks", safeSegment(taskID(contract.StudyPipelineMaterial{
		ID:   "947711",
		Name: "Aufgabenblatt 01",
	}))+".mdx")
	taskOutput, err := os.ReadFile(taskPath)
	if err != nil {
		t.Fatalf("read curated task: %v", err)
	}
	if !strings.Contains(string(taskOutput), "embedded-image-001") || !strings.Contains(string(taskOutput), "/api/study-pipeline/courses/22584/study-pipeline/extracted-asset?path=") {
		t.Fatalf("expected curated task to include extracted image reference, got %q", string(taskOutput))
	}
}

func TestRequiredCurationProofMarksMissingDecisionsForReview(t *testing.T) {
	now := time.Date(2026, 6, 14, 21, 0, 0, 0, time.UTC)
	decisions := []store.StudyPipelineElementDecision{{
		SourceElementID: "doc-1:block-1",
		Outcome:         "used_in_output",
		Reason:          "heuristic match",
		DecidedBy:       "system",
		Confidence:      "medium",
	}}

	got := applyCurationProofs(decisions, map[string]CurationElementDecision{}, true, now)
	if len(got) != 1 {
		t.Fatalf("expected one decision, got %d", len(got))
	}
	if got[0].Outcome != "needs_review" {
		t.Fatalf("expected missing proof to require review, got %#v", got[0])
	}
	if !strings.Contains(got[0].Reason, "did not provide") {
		t.Fatalf("expected missing-proof reason, got %q", got[0].Reason)
	}
}

func TestCurationProofCompleteRequiresElementDecisions(t *testing.T) {
	run := &codexCurationRun{Targets: []codexCurationTarget{{
		Checklist: CurationVerificationChecklist{
			PageImagesReviewed:        true,
			ExtractedElementsReviewed: true,
			LayoutReconstructed:       true,
			RenderedPreviewChecked:    true,
			SourceMappingComplete:     true,
			FinalElementOutcomes:      true,
		},
	}}}
	if curationProofComplete(run) {
		t.Fatal("expected curation proof without element decisions to be incomplete")
	}
}

func TestCuratedStageAccountabilityOnlyChecksSelectedResources(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 12, 15, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nAusgewählter Inhalt.")
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID:     courseID,
		RunID:        "baseline-20260614T121500Z",
		GeneratedAt:  now.Format(time.RFC3339),
		Engine:       extractedDocumentEngine,
		ArtifactRoot: filepath.Join(root, "courses", courseID),
		Documents: []contract.PDFDocument{
			{
				ID: "947711",
				Resource: contract.StudyPipelineMaterial{
					ID:       "947711",
					Name:     "Aufgabenblatt 01",
					Type:     "task",
					FileType: "pdf",
				},
				RunID:  "baseline-20260614T121500Z",
				Engine: extractedDocumentEngine,
				Status: "machine-extracted",
				Pages: []contract.PDFPage{{
					ID:             "947711-page-001",
					PageNumber:     1,
					Text:           "Aufgabe 1\n\nAusgewählter Inhalt.",
					Markdown:       "Aufgabe 1\n\nAusgewählter Inhalt.",
					PreviewAssetID: "page-001-preview",
					Blocks: []contract.DocumentBlock{{
						ID:         "947711-p001-b001",
						PageNumber: 1,
						Type:       "paragraph",
						Label:      "task_paragraph",
						Text:       "Ausgewählter Inhalt.",
						Markdown:   "Ausgewählter Inhalt.",
						Source:     "extracted_text",
						Confidence: "high",
					}},
				}},
				Assets: []contract.DocumentAsset{{
					ID:         "page-001-preview",
					Kind:       "page_preview",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T121500Z", "assets", "947711", "pages", "page-1.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "page_preview",
				}},
			},
			{
				ID: "947740",
				Resource: contract.StudyPipelineMaterial{
					ID:       "947740",
					Name:     "Aufgabenblatt 10",
					Type:     "task",
					FileType: "pdf",
				},
				RunID:  "baseline-20260614T121500Z",
				Engine: extractedDocumentEngine,
				Status: "machine-extracted",
				Pages: []contract.PDFPage{{
					ID:         "947740-page-001",
					PageNumber: 1,
					Text:       "Nicht ausgewählter Inhalt.",
					Markdown:   "Nicht ausgewählter Inhalt.",
					Blocks: []contract.DocumentBlock{{
						ID:         "947740-p001-b001",
						PageNumber: 1,
						Type:       "paragraph",
						Label:      "task_paragraph",
						Text:       "Nicht ausgewählter Inhalt.",
						Markdown:   "Nicht ausgewählter Inhalt.",
						Source:     "extracted_text",
						Confidence: "high",
					}},
				}},
			},
		},
	})

	response, err := RunStage(courseID, resources, "curated", RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("RunStage curated: %v", err)
	}
	if response.CurationChecklist == nil || response.CurationChecklist.Status != "complete" {
		t.Fatalf("expected selected resource checklist to complete, got %#v", response.CurationChecklist)
	}
	if len(response.ElementDecisions) != 1 || response.ElementDecisions[0].SourceElementID != "947711-p001-b001" {
		t.Fatalf("expected accountability only for selected document, got %#v", response.ElementDecisions)
	}
}

func TestCuratedStageRestoresMeaningfulImagesAfterCleanupHook(t *testing.T) {
	root := t.TempDir()
	courseID := "22584"
	now := time.Date(2026, 6, 14, 10, 12, 0, 0, time.UTC)
	resources := []moodle.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01", FileType: "pdf", SectionName: "Week 1"},
	}
	writeExtractedFixture(t, root, courseID, "tasks", "947711-Aufgabenblatt 01", "Aufgabe 1\n\nInterpretieren Sie das Roofline-Diagramm.")
	writeLatestExtractedDocumentFixture(t, root, courseID, contract.ExtractedDocumentsResponse{
		CourseID:     courseID,
		RunID:        "baseline-20260614T101200Z",
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
			RunID:  "baseline-20260614T101200Z",
			Engine: extractedDocumentEngine,
			Status: "machine-extracted",
			Pages: []contract.PDFPage{{
				ID:             "947711-page-001",
				PageNumber:     1,
				Text:           "Aufgabe 1\n\nInterpretieren Sie das Roofline-Diagramm.",
				Markdown:       "Aufgabe 1\n\nInterpretieren Sie das Roofline-Diagramm.",
				PreviewAssetID: "page-001-preview",
				Blocks: []contract.DocumentBlock{{
					ID:         "947711-p001-b001",
					PageNumber: 1,
					Type:       "paragraph",
					Label:      "task_paragraph",
					Text:       "Interpretieren Sie das Roofline-Diagramm.",
					Markdown:   "Interpretieren Sie das Roofline-Diagramm.",
					Source:     "extracted_text",
					Confidence: "high",
				}},
			}},
			Assets: []contract.DocumentAsset{
				{
					ID:         "page-001-preview",
					Kind:       "page_preview",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T101200Z", "assets", "947711", "pages", "page-1.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "page_preview",
				},
				{
					ID:         "embedded-image-001",
					Kind:       "embedded_image",
					Path:       filepath.Join(root, "courses", courseID, "extracted", "runs", "baseline-20260614T101200Z", "assets", "947711", "images", "roofline.png"),
					PageNumber: 1,
					MimeType:   "image/png",
					Role:       "extracted_image",
				},
			},
		}},
	})
	hook := filepath.Join(root, "remove-images.sh")
	if err := os.WriteFile(hook, []byte(`#!/bin/sh
set -eu
for file in "$MOODLE_STUDY_TASKS_DIR"/*.mdx; do
  [ -f "$file" ] || continue
  printf '%s\n' '---' 'status: codex-improved' '---' '' '# Aufgabenblatt 01' '' 'Interpretieren Sie das Roofline-Diagramm.' > "$file"
done
`), 0o755); err != nil {
		t.Fatalf("write hook: %v", err)
	}
	t.Setenv(EnvCodexCommand, shellQuoteForTest(filepath.ToSlash(hook)))

	response, err := RunStage(courseID, resources, "curated", RunOptions{
		Root: root,
		Now:  now,
	})
	if err != nil {
		t.Fatalf("RunStage curated: %v", err)
	}
	imageDecision := response.ElementDecisions[len(response.ElementDecisions)-1]
	if imageDecision.SourceAssetID != "embedded-image-001" || imageDecision.Outcome != "used_in_output" {
		t.Fatalf("expected meaningful image to be restored and used, got %#v", imageDecision)
	}
	taskPath := filepath.Join(root, "courses", courseID, "curated", "tasks", safeSegment(taskID(contract.StudyPipelineMaterial{
		ID:   "947711",
		Name: "Aufgabenblatt 01",
	}))+".mdx")
	taskOutput, err := os.ReadFile(taskPath)
	if err != nil {
		t.Fatalf("read curated task: %v", err)
	}
	if !strings.Contains(string(taskOutput), "embedded-image-001") || !strings.Contains(string(taskOutput), "roofline.png") {
		t.Fatalf("expected reconciliation to restore meaningful image, got %q", string(taskOutput))
	}
}

func TestTextAccountabilityAcceptsWebsiteRestructuring(t *testing.T) {
	output := strings.Join([]string{
		"# Aufgabenblatt 12",
		"",
		"## Aufgabe 1",
		"Die Zugverbindung zweier Städte beinhaltet eine Brücke zwischen den Punkten A und B.",
		"Die Brücke ist eine exklusiv nutzbare Ressource und muss als kritische Sektion implementiert werden.",
	}, "\n")
	block := contract.DocumentBlock{
		ID:       "947753-p001-b002",
		Type:     "paragraph",
		Label:    "task_paragraph",
		Text:     "Aufgabe 1 Die Zugverbindung zweier Städte beinhaltet eine Brücke zwischen den Punkten A und B, die nur von einem einzelnen Zug überquert werden kann.",
		Markdown: "Aufgabe 1 Die Zugverbindung zweier Städte beinhaltet eine Brücke zwischen den Punkten A und B, die nur von einem einzelnen Zug überquert werden kann.",
	}

	if !textBlockRepresented(output, block) {
		t.Fatalf("expected restructured website output to represent the source block")
	}
}

func TestTaskAccountabilityStillFailsForMissingContent(t *testing.T) {
	document := contract.PDFDocument{
		Resource: contract.StudyPipelineMaterial{ID: "947711", Name: "Aufgabenblatt 01", Type: "task"},
		Pages: []contract.PDFPage{{
			PageNumber: 1,
			Blocks: []contract.DocumentBlock{{
				ID:         "947711-p001-b003",
				PageNumber: 1,
				Type:       "paragraph",
				Label:      "task_paragraph",
				Text:       "Gegeben sei eine idealisierte superskalare Architektur mit zwei Gleitkomma-Einheiten und einer Spitzenbandbreite gemäss Roofline-Diagramm.",
				Source:     "extracted_text",
			}},
		}},
	}

	decisions := blockElementDecisions(document, "# Aufgabenblatt 01\n\nNur Aufgabe 1 ist vorhanden.", nil, time.Now())
	if len(decisions) != 1 {
		t.Fatalf("expected one decision, got %#v", decisions)
	}
	if decisions[0].Outcome != "needs_review" {
		t.Fatalf("expected missing task content to need review, got %#v", decisions[0])
	}
}

func TestCuratedScriptCanAccountForSmallTransformedFragmentsAfterBroadCoverage(t *testing.T) {
	blocks := []contract.DocumentBlock{}
	outputLines := []string{"# Teil 06"}
	for index := 1; index <= 10; index++ {
		text := fmt.Sprintf("Parallel sorting topic %d covers merge sort communication and divide conquer behaviour.", index)
		blocks = append(blocks, contract.DocumentBlock{
			ID:         fmt.Sprintf("947751-p001-b%03d", index),
			PageNumber: 1,
			Type:       "paragraph",
			Label:      "lecture_paragraph",
			Text:       text,
			Source:     "extracted_text",
		})
		outputLines = append(outputLines, text)
	}
	blocks = append(blocks, contract.DocumentBlock{
		ID:         "947751-p001-b999",
		PageNumber: 1,
		Type:       "heading",
		Label:      "lecture_heading",
		Text:       "P1 P2 P3 P4 P5 P6 P7 P8",
		Source:     "extracted_text",
	})
	document := contract.PDFDocument{
		Resource: contract.StudyPipelineMaterial{ID: "947751", Name: "Teil 06", Type: "slide"},
		Pages: []contract.PDFPage{{
			PageNumber: 1,
			Blocks:     blocks,
		}},
	}
	output := strings.Join(outputLines, "\n\n")

	decisions := blockElementDecisions(document, output, nil, time.Now())
	if len(decisions) != 11 {
		t.Fatalf("expected eleven decisions, got %#v", decisions)
	}
	if decisions[0].Outcome != "used_in_output" {
		t.Fatalf("expected main script content to be used, got %#v", decisions[0])
	}
	if decisions[len(decisions)-1].Outcome != "ignored" {
		t.Fatalf("expected small transformed script fragment to be explicitly ignored, got %#v", decisions[len(decisions)-1])
	}
}

func writeLatestExtractedDocumentFixture(t *testing.T, root string, courseID string, response contract.ExtractedDocumentsResponse) {
	t.Helper()
	path := filepath.Join(root, "courses", safeSegment(courseID), "extracted", "latest-documents.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir latest extracted fixture: %v", err)
	}
	if err := writeJSONFile(path, response); err != nil {
		t.Fatalf("write latest extracted fixture: %v", err)
	}
}

func shellQuoteForTest(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
