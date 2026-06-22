package studypipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/DotNaos/moodle-services/internal/moodle"
	"github.com/DotNaos/moodle-services/internal/store"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

type CurationInput struct {
	ArtifactRoot    string
	CourseID        string
	UserID          string
	Model           string
	ReasoningEffort string
	TargetID        string
	Title           string
	Prompt          string
	ImagePaths      []string
	Emit            func(contract.StudyPipelineRefineEvent)
}

type CurationOutput struct {
	ContentMarkdown  string                        `json:"contentMarkdown"`
	ElementDecisions []CurationElementDecision     `json:"elementDecisions"`
	Checklist        CurationVerificationChecklist `json:"checklist"`
	Model            string                        `json:"-"`
}

type CurationElementDecision struct {
	SourceElementID string `json:"sourceElementId"`
	Outcome         string `json:"outcome"`
	Reason          string `json:"reason"`
	OutputReference string `json:"outputReference"`
	Confidence      string `json:"confidence"`
}

type CurationVerificationChecklist struct {
	PageImagesReviewed        bool `json:"pageImagesReviewed"`
	ExtractedElementsReviewed bool `json:"extractedElementsReviewed"`
	LayoutReconstructed       bool `json:"layoutReconstructed"`
	RenderedPreviewChecked    bool `json:"renderedPreviewChecked"`
	SourceMappingComplete     bool `json:"sourceMappingComplete"`
	FinalElementOutcomes      bool `json:"finalElementOutcomes"`
}

type codexCurationRun struct {
	CourseID     string                `json:"courseId"`
	RunID        string                `json:"runId"`
	Model        string                `json:"model"`
	GeneratedAt  string                `json:"generatedAt"`
	Targets      []codexCurationTarget `json:"targets"`
	ArtifactPath string                `json:"-"`
}

type codexCurationTarget struct {
	TargetID         string                        `json:"targetId"`
	ResourceID       string                        `json:"resourceId"`
	Kind             string                        `json:"kind"`
	Title            string                        `json:"title"`
	OutputPath       string                        `json:"outputPath"`
	ContentMarkdown  string                        `json:"contentMarkdown"`
	ElementDecisions []CurationElementDecision     `json:"elementDecisions"`
	Checklist        CurationVerificationChecklist `json:"checklist"`
}

func runCodexCuration(root string, courseID string, resources []moodle.Resource, plan contract.StudyPipelineResponse, options RunOptions, now time.Time) (*codexCurationRun, error) {
	model := sanitizeCodexModel(options.Model)
	if model == "" {
		return nil, nil
	}
	extracted, ok, err := readLatestExtractedDocuments(root, courseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("codex curation requires extracted document evidence")
	}
	curator := options.Curator
	if curator == nil {
		curator = DockerCodexCurator{}
	}
	run := &codexCurationRun{
		CourseID:    courseID,
		RunID:       "codex-curation-" + now.UTC().Format("20060102T150405Z"),
		Model:       model,
		GeneratedAt: now.UTC().Format(time.RFC3339),
	}
	for _, link := range effectiveTaskLinks(plan.Materials, plan.TaskLinks) {
		documents := documentsForTaskLink(extracted.Documents, link)
		if len(documents) == 0 {
			continue
		}
		if !documentsHavePagePreview(documents) {
			return nil, fmt.Errorf("codex curation for %s requires rendered PDF page images", link.Task.Name)
		}
		prompt := buildTaskCurationPrompt(root, courseID, link, documents)
		output, err := curator.Curate(context.Background(), CurationInput{
			ArtifactRoot:    root,
			CourseID:        courseID,
			UserID:          options.UserID,
			Model:           model,
			ReasoningEffort: options.ReasoningEffort,
			TargetID:        taskID(link.Task),
			Title:           link.Task.Name,
			Prompt:          prompt,
			ImagePaths:      curationImagePaths(documents),
			Emit:            options.RefineEvent,
		})
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(output.ContentMarkdown) == "" {
			return nil, fmt.Errorf("codex curation returned empty content for %s", link.Task.Name)
		}
		run.Targets = append(run.Targets, codexCurationTarget{
			TargetID:         taskID(link.Task),
			ResourceID:       link.Task.ID,
			Kind:             "task",
			Title:            link.Task.Name,
			OutputPath:       filepath.ToSlash(improvedPathForMaterial(root, courseID, link.Task, "task")),
			ContentMarkdown:  output.ContentMarkdown,
			ElementDecisions: output.ElementDecisions,
			Checklist:        output.Checklist,
		})
	}
	if len(run.Targets) == 0 {
		return nil, fmt.Errorf("codex curation found no task or script targets")
	}
	if err := writeCodexCurationRun(root, courseID, run); err != nil {
		return nil, err
	}
	return run, nil
}

func materializeCodexCuration(root string, courseID string, run *codexCurationRun, materials []contract.StudyPipelineMaterial, now time.Time) error {
	if run == nil {
		return nil
	}
	byID := map[string]contract.StudyPipelineMaterial{}
	for _, material := range materials {
		byID[material.ID] = material
	}
	for _, target := range run.Targets {
		material, ok := byID[target.ResourceID]
		if !ok {
			return fmt.Errorf("codex curation target %s no longer matches a pipeline material", target.ResourceID)
		}
		if strings.TrimSpace(target.ContentMarkdown) == "" {
			return fmt.Errorf("codex curation target %s has no content to materialize", target.ResourceID)
		}
		kind := strings.TrimSpace(target.Kind)
		if kind == "" {
			kind = "task"
		}
		if err := writeImprovedContent(root, courseID, material, kind, target.ContentMarkdown, firstNonEmpty(run.Model, "codex"), now); err != nil {
			return err
		}
	}
	return nil
}

type DockerCodexCurator struct{}

func (DockerCodexCurator) Curate(ctx context.Context, input CurationInput) (CurationOutput, error) {
	image := strings.TrimSpace(os.Getenv(EnvCodexDockerImage))
	if image == "" {
		return CurationOutput{}, fmt.Errorf("%s is not configured", EnvCodexDockerImage)
	}
	model := sanitizeCodexModel(input.Model)
	if model == "" {
		return CurationOutput{}, fmt.Errorf("codex model is required for curation")
	}
	authenticated, _, err := CodexAuthenticated(ctx, input.UserID, input.ArtifactRoot)
	if err != nil {
		return CurationOutput{}, err
	}
	if !authenticated {
		return CurationOutput{}, ErrCodexNotAuthenticated
	}
	attachments, err := prepareCurationAttachments(input.ArtifactRoot, input.UserID, input.ImagePaths)
	if err != nil {
		return CurationOutput{}, err
	}
	command := buildCodexChatCommand(model, sanitizeCodexOption(input.ReasoningEffort), true, attachments)
	if input.Emit != nil {
		input.Emit(contract.StudyPipelineRefineEvent{
			Type:            "runner",
			Message:         "Starting Codex curation with PDF page evidence.",
			Model:           model,
			ReasoningEffort: sanitizeCodexOption(input.ReasoningEffort),
		})
	}
	output, err := runDockerCodexWithOptions(ctx, dockerCodexOptions{
		Image:           image,
		Command:         command,
		Model:           model,
		ReasoningEffort: input.ReasoningEffort,
		ArtifactRoot:    input.ArtifactRoot,
		UserID:          input.UserID,
		Prompt:          input.Prompt,
		OutputPrefix:    "curation-" + safeSegment(input.TargetID),
		OutputSchema:    curationOutputSchema(),
		Emit:            input.Emit,
	})
	if err != nil {
		if isCodexAuthError(err.Error(), output) {
			return CurationOutput{}, ErrCodexNotAuthenticated
		}
		return CurationOutput{}, fmt.Errorf("codex curation failed for %s: %w", input.Title, err)
	}
	parsed, err := parseCurationOutput(output)
	if err != nil {
		return CurationOutput{}, fmt.Errorf("codex curation returned invalid output for %s: %w", input.Title, err)
	}
	parsed.Model = model
	return parsed, nil
}

func buildTaskCurationPrompt(root string, courseID string, link contract.StudyPipelineTaskLink, documents []contract.PDFDocument) string {
	var out strings.Builder
	out.WriteString("You are curating Moodle PDF content into a website-ready task.\n")
	out.WriteString("Use the rendered page screenshots and extracted assets as source evidence, not only OCR text.\n")
	out.WriteString("Reconstruct the task layout faithfully. Put important diagrams/images exactly where they belong in the task, not as a generic appendix.\n")
	out.WriteString("Do not invent facts. If an element is decorative or template-only, mark it ignored with a concrete reason.\n")
	out.WriteString("Every listed source element must receive exactly one final outcome: used, ignored, unsupported, or failed.\n")
	out.WriteString("If an image/diagram is needed for solving the task, include the provided HTML figure snippet in contentMarkdown at the correct location.\n")
	out.WriteString("For every elementDecision, always set outputReference and confidence. Use an empty outputReference only when the outcome is not used.\n")
	out.WriteString("Return JSON matching the schema only.\n\n")
	out.WriteString("Course ID: " + courseID + "\n")
	out.WriteString("Task: " + link.Task.Name + " (" + link.Task.ID + ")\n")
	if link.Solution != nil {
		out.WriteString("Linked solution: " + link.Solution.Name + " (" + link.Solution.ID + ")\n")
	}
	out.WriteString("\nExtracted source documents and required element IDs:\n")
	for _, document := range documents {
		out.WriteString("\n## Document " + document.Resource.Name + " [" + document.Resource.ID + "]\n")
		for _, page := range document.Pages {
			out.WriteString("\nPage " + fmt.Sprint(page.PageNumber) + "\n")
			if asset := pagePreviewAsset(document, page.PageNumber); asset != nil {
				out.WriteString("- page image: " + filepath.ToSlash(asset.Path) + "\n")
			}
			if strings.TrimSpace(page.Markdown) != "" {
				out.WriteString("\nExtracted markdown:\n" + strings.TrimSpace(page.Markdown) + "\n")
			} else if strings.TrimSpace(page.Text) != "" {
				out.WriteString("\nExtracted text:\n" + strings.TrimSpace(page.Text) + "\n")
			}
			for _, block := range page.Blocks {
				out.WriteString("- element " + block.ID + " kind=" + firstNonEmpty(block.Type, "text") + " label=" + block.Label + "\n")
			}
		}
		for _, asset := range document.Assets {
			if !isCuratedVisualAsset(asset) {
				continue
			}
			sourceID := document.ID + ":" + asset.ID
			out.WriteString("\nVisual element " + sourceID + "\n")
			out.WriteString("- file: " + filepath.ToSlash(asset.Path) + "\n")
			out.WriteString("- kind: " + asset.Kind + "\n")
			out.WriteString("- role: " + asset.Role + "\n")
			out.WriteString("- use this exact figure snippet if used:\n")
			out.WriteString(curatedAssetFigure(courseID, asset) + "\n")
		}
	}
	out.WriteString("\nExisting deterministic draft, for reference only:\n")
	out.WriteString(taskPrompt(root, courseID, link))
	return out.String()
}

func parseCurationOutput(output string) (CurationOutput, error) {
	text := strings.TrimSpace(output)
	if text == "" {
		return CurationOutput{}, fmt.Errorf("empty curation output")
	}
	var parsed CurationOutput
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		extracted := extractJSONObject(text)
		if extracted == "" {
			return CurationOutput{}, err
		}
		if err := json.Unmarshal([]byte(extracted), &parsed); err != nil {
			return CurationOutput{}, err
		}
	}
	if strings.TrimSpace(parsed.ContentMarkdown) == "" {
		return CurationOutput{}, fmt.Errorf("contentMarkdown is required")
	}
	return parsed, nil
}

func writeCodexCurationRun(root string, courseID string, run *codexCurationRun) error {
	dir := filepath.Join(courseDir(root, courseID), "curated", "codex", run.RunID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(dir, "curation.json")
	run.ArtifactPath = path
	return writeJSONFile(path, run)
}

func documentsForTaskLink(documents []contract.PDFDocument, link contract.StudyPipelineTaskLink) []contract.PDFDocument {
	wanted := map[string]bool{link.Task.ID: true}
	if link.Solution != nil {
		wanted[link.Solution.ID] = true
	}
	out := []contract.PDFDocument{}
	for _, document := range documents {
		if wanted[document.Resource.ID] {
			out = append(out, document)
		}
	}
	return out
}

func documentsHavePagePreview(documents []contract.PDFDocument) bool {
	for _, document := range documents {
		for _, asset := range document.Assets {
			if asset.Kind == "page_preview" && strings.TrimSpace(asset.Path) != "" {
				return true
			}
		}
	}
	return false
}

func curationImagePaths(documents []contract.PDFDocument) []string {
	seen := map[string]bool{}
	paths := []string{}
	for _, document := range documents {
		for _, asset := range document.Assets {
			if asset.Kind != "page_preview" && !isCuratedVisualAsset(asset) {
				continue
			}
			path := strings.TrimSpace(asset.Path)
			if path == "" || seen[path] {
				continue
			}
			seen[path] = true
			paths = append(paths, path)
		}
	}
	return paths
}

func pagePreviewAsset(document contract.PDFDocument, pageNumber int) *contract.DocumentAsset {
	for index := range document.Assets {
		asset := &document.Assets[index]
		if asset.Kind == "page_preview" && asset.PageNumber == pageNumber {
			return asset
		}
	}
	return nil
}

func prepareCurationAttachments(artifactRoot string, userID string, imagePaths []string) ([]string, error) {
	if len(imagePaths) == 0 {
		return nil, nil
	}
	stateRoot, err := prepareCodexStateRoot(firstNonEmpty(artifactRoot, ArtifactRootFromEnv()), userID)
	if err != nil {
		return nil, err
	}
	uploadsDir := filepath.Join(stateRoot, "uploads")
	if err := os.MkdirAll(uploadsDir, 0o700); err != nil {
		return nil, err
	}
	names := []string{}
	for index, source := range imagePaths {
		source = strings.TrimSpace(source)
		if source == "" {
			continue
		}
		name := safeUploadFileName(fmt.Sprintf("curation-%03d-%s", index+1, filepath.Base(source)))
		if name == "" {
			continue
		}
		if err := copyFile(source, filepath.Join(uploadsDir, name)); err != nil {
			return nil, fmt.Errorf("copy curation image %s: %w", source, err)
		}
		names = append(names, name)
	}
	return names, nil
}

func copyFile(source string, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func curationOutputSchema() []byte {
	schema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"contentMarkdown", "elementDecisions", "checklist"},
		"properties": map[string]any{
			"contentMarkdown": map[string]any{"type": "string"},
			"elementDecisions": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"sourceElementId", "outcome", "reason", "outputReference", "confidence"},
					"properties": map[string]any{
						"sourceElementId": map[string]any{"type": "string"},
						"outcome":         map[string]any{"type": "string", "enum": []string{"used", "ignored", "unsupported", "failed"}},
						"reason":          map[string]any{"type": "string"},
						"outputReference": map[string]any{"type": "string"},
						"confidence":      map[string]any{"type": "string"},
					},
				},
			},
			"checklist": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required": []string{
					"pageImagesReviewed",
					"extractedElementsReviewed",
					"layoutReconstructed",
					"renderedPreviewChecked",
					"sourceMappingComplete",
					"finalElementOutcomes",
				},
				"properties": map[string]any{
					"pageImagesReviewed":        map[string]any{"type": "boolean"},
					"extractedElementsReviewed": map[string]any{"type": "boolean"},
					"layoutReconstructed":       map[string]any{"type": "boolean"},
					"renderedPreviewChecked":    map[string]any{"type": "boolean"},
					"sourceMappingComplete":     map[string]any{"type": "boolean"},
					"finalElementOutcomes":      map[string]any{"type": "boolean"},
				},
			},
		},
	}
	data, _ := json.Marshal(schema)
	return data
}

func curationProofDecisions(run *codexCurationRun) map[string]CurationElementDecision {
	out := map[string]CurationElementDecision{}
	if run == nil {
		return out
	}
	for _, target := range run.Targets {
		for _, decision := range target.ElementDecisions {
			key := strings.TrimSpace(decision.SourceElementID)
			if key != "" {
				out[key] = decision
			}
		}
	}
	return out
}

func curationProofComplete(run *codexCurationRun) bool {
	if run == nil || len(run.Targets) == 0 {
		return false
	}
	for _, target := range run.Targets {
		if len(target.ElementDecisions) == 0 {
			return false
		}
		checklist := target.Checklist
		if !checklist.PageImagesReviewed ||
			!checklist.ExtractedElementsReviewed ||
			!checklist.LayoutReconstructed ||
			!checklist.RenderedPreviewChecked ||
			!checklist.SourceMappingComplete ||
			!checklist.FinalElementOutcomes {
			return false
		}
	}
	return true
}

func curationProofArtifactRefs(root string, courseID string, run *codexCurationRun) []store.StudyPipelineArtifactRef {
	if run == nil || strings.TrimSpace(run.ArtifactPath) == "" {
		return nil
	}
	return []store.StudyPipelineArtifactRef{{
		ID:         "artifact:codex-curation:" + courseID + ":" + run.RunID,
		Kind:       "codex_curation",
		URI:        filepath.ToSlash(run.ArtifactPath),
		StorageKey: storageKeyForPath(root, run.ArtifactPath),
		Metadata: map[string]any{
			"model":   run.Model,
			"targets": len(run.Targets),
		},
	}}
}
