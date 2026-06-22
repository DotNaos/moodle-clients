package studypipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/DotNaos/moodle-services/internal/moodle"
	"github.com/DotNaos/moodle-services/internal/store"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

type curatedAccountabilityReport struct {
	RunID            string
	ArtifactRefs     []store.StudyPipelineArtifactRef
	Checklist        *store.StudyPipelineCurationChecklist
	ElementDecisions []store.StudyPipelineElementDecision
}

func (report curatedAccountabilityReport) CompletionError() error {
	if report.Checklist == nil {
		return fmt.Errorf("element accountability incomplete: curation checklist missing")
	}
	if strings.TrimSpace(report.Checklist.Status) != "complete" {
		return fmt.Errorf("element accountability incomplete: curation checklist status is %q", report.Checklist.Status)
	}
	for _, decision := range report.ElementDecisions {
		switch strings.TrimSpace(decision.Outcome) {
		case "needs_review", "failed":
			return fmt.Errorf("element accountability incomplete: %s is %s", decision.SourceElementID, decision.Outcome)
		}
	}
	return nil
}

type elementAccountabilityManifest struct {
	CourseID         string                               `json:"courseId"`
	RunID            string                               `json:"runId"`
	GeneratedAt      string                               `json:"generatedAt"`
	ExtractedRunID   string                               `json:"extractedRunId,omitempty"`
	TotalElements    int                                  `json:"totalElements"`
	Used             int                                  `json:"used"`
	Ignored          int                                  `json:"ignored"`
	Unsupported      int                                  `json:"unsupported"`
	Failed           int                                  `json:"failed"`
	NeedsReview      int                                  `json:"needsReview"`
	ElementDecisions []store.StudyPipelineElementDecision `json:"elementDecisions"`
}

func buildCuratedAccountability(root string, courseID string, moodleResources []moodle.Resource, resources []contract.StudyPipelineMaterial, now time.Time, curation *codexCurationRun) (curatedAccountabilityReport, error) {
	if now.IsZero() {
		now = time.Now()
	}
	extracted, ok, err := readLatestExtractedDocuments(root, courseID)
	if err != nil {
		return curatedAccountabilityReport{}, err
	}
	if !ok {
		var err error
		extracted, err = LoadExtractedDocuments(courseID, moodleResources, RunOptions{Root: root, Now: now})
		if err != nil {
			return curatedAccountabilityReport{}, err
		}
	}

	runID := "curated-" + now.UTC().Format("20060102T150405Z")
	runDir := filepath.Join(courseDir(root, courseID), "curated", "accountability", runID)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return curatedAccountabilityReport{}, err
	}

	scopedDocuments := extractedDocumentsForMaterials(extracted.Documents, resources)
	outputs := curatedOutputsByResource(root, courseID, resources)
	for resourceID, output := range curationOutputsByResource(curation) {
		outputs[resourceID] = output
	}
	pageRenderRefs := pageRenderArtifactRefs(root, courseID, runID, scopedDocuments)
	pageRenderByDocumentPage := pageRenderArtifactIDsByDocumentPage(scopedDocuments)
	curationDecisions := curationProofDecisions(curation)
	curationProofRequired := curation != nil
	decisions := make([]store.StudyPipelineElementDecision, 0)
	for _, document := range scopedDocuments {
		output := outputs[document.Resource.ID]
		decisions = append(decisions, applyCurationProofs(blockElementDecisions(document, output, pageRenderByDocumentPage, now), curationDecisions, curationProofRequired, now)...)
		decisions = append(decisions, applyCurationProofs(assetElementDecisions(document, output, pageRenderByDocumentPage, now), curationDecisions, curationProofRequired, now)...)
	}

	manifest := elementAccountabilityManifest{
		CourseID:         courseID,
		RunID:            runID,
		GeneratedAt:      now.UTC().Format(time.RFC3339),
		ExtractedRunID:   extracted.RunID,
		TotalElements:    len(decisions),
		ElementDecisions: decisions,
	}
	for _, decision := range decisions {
		switch decision.Outcome {
		case "used_in_output":
			manifest.Used++
		case "ignored":
			manifest.Ignored++
		case "unsupported":
			manifest.Unsupported++
		case "failed":
			manifest.Failed++
		case "needs_review":
			manifest.NeedsReview++
		}
	}

	manifestPath := filepath.Join(runDir, "element-accountability.json")
	checklistPath := filepath.Join(runDir, "checklist.json")
	previewPath := filepath.Join(runDir, "rendered-preview.md")
	if err := writeJSONFile(manifestPath, manifest); err != nil {
		return curatedAccountabilityReport{}, err
	}
	if err := os.WriteFile(previewPath, []byte(curatedPreviewMarkdown(root, courseID, resources)), 0o644); err != nil {
		return curatedAccountabilityReport{}, err
	}

	manifestArtifactID := "artifact:element-accountability:" + courseID + ":" + runID
	checklistArtifactID := "artifact:curation-checklist:" + courseID + ":" + runID
	previewArtifactID := "artifact:rendered-preview:" + courseID + ":" + runID
	checklist := buildCurationChecklist(now, manifest, manifestArtifactID, firstPageRenderArtifactID(pageRenderRefs), previewArtifactID, curation)
	if err := writeJSONFile(checklistPath, checklist); err != nil {
		return curatedAccountabilityReport{}, err
	}

	artifactRefs := make([]store.StudyPipelineArtifactRef, 0, len(pageRenderRefs)+4)
	artifactRefs = append(artifactRefs, pageRenderRefs...)
	artifactRefs = append(artifactRefs, curationProofArtifactRefs(root, courseID, curation)...)
	artifactRefs = append(artifactRefs,
		store.StudyPipelineArtifactRef{
			ID:         manifestArtifactID,
			Kind:       "element_accountability_manifest",
			StorageKey: storageKeyForPath(root, manifestPath),
			URI:        filepath.ToSlash(manifestPath),
			Metadata: map[string]any{
				"totalElements": manifest.TotalElements,
				"needsReview":   manifest.NeedsReview,
				"failed":        manifest.Failed,
			},
		},
		store.StudyPipelineArtifactRef{
			ID:         checklistArtifactID,
			Kind:       "curation_checklist",
			StorageKey: storageKeyForPath(root, checklistPath),
			URI:        filepath.ToSlash(checklistPath),
			Metadata: map[string]any{
				"status": checklist.Status,
			},
		},
		store.StudyPipelineArtifactRef{
			ID:         previewArtifactID,
			Kind:       "rendered_preview",
			StorageKey: storageKeyForPath(root, previewPath),
			URI:        filepath.ToSlash(previewPath),
		},
	)

	return curatedAccountabilityReport{
		RunID:            runID,
		ArtifactRefs:     artifactRefs,
		Checklist:        checklist,
		ElementDecisions: decisions,
	}, nil
}

func extractedDocumentsForMaterials(documents []contract.PDFDocument, materials []contract.StudyPipelineMaterial) []contract.PDFDocument {
	if len(materials) == 0 {
		return documents
	}
	selected := make(map[string]bool, len(materials))
	for _, material := range materials {
		if strings.TrimSpace(material.ID) != "" {
			selected[material.ID] = true
		}
	}
	if len(selected) == 0 {
		return documents
	}
	filtered := make([]contract.PDFDocument, 0, len(documents))
	for _, document := range documents {
		if selected[document.Resource.ID] {
			filtered = append(filtered, document)
		}
	}
	return filtered
}

func curatedOutputsByResource(root string, courseID string, materials []contract.StudyPipelineMaterial) map[string]string {
	outputs := map[string]string{}
	for _, material := range materials {
		switch material.Type {
		case "task":
			path := filepath.Join(courseDir(root, courseID), "curated", "tasks", safeSegment(taskID(material))+".mdx")
			outputs[material.ID] = readTextFile(path)
		case "solution":
			path := filepath.Join(courseDir(root, courseID), "curated", "tasks", "solutions", safeSegment(taskID(material))+".mdx")
			outputs[material.ID] = readTextFile(path)
		case "slide", "script":
			outputs[material.ID] = readTextFile(filepath.Join(courseDir(root, courseID), "curated", "script", "Script.mdx"))
		}
	}
	return outputs
}

func curationOutputsByResource(curation *codexCurationRun) map[string]string {
	outputs := map[string]string{}
	if curation == nil {
		return outputs
	}
	for _, target := range curation.Targets {
		if strings.TrimSpace(target.ResourceID) == "" {
			continue
		}
		outputs[target.ResourceID] = target.ContentMarkdown
	}
	return outputs
}

func blockElementDecisions(document contract.PDFDocument, output string, pageRenderByDocumentPage map[string]string, now time.Time) []store.StudyPipelineElementDecision {
	decisions := []store.StudyPipelineElementDecision{}
	coverage := documentTextCoverage(document, output)
	for _, page := range document.Pages {
		for _, block := range page.Blocks {
			outcome := "used_in_output"
			reason := "The extracted text block is represented in the curated output."
			confidence := block.Confidence
			if confidence == "" {
				confidence = "medium"
			}
			if !textBlockRepresented(output, block) {
				outcome = "needs_review"
				reason = "The extracted text block was not found in the curated output."
				confidence = "medium"
			}
			if outcome == "needs_review" && canIgnoreCuratedScriptFragment(document, block, coverage) {
				outcome = "ignored"
				reason = "The curated script already represents the source document, and this small slide fragment was intentionally not kept as standalone website text."
				confidence = "medium"
			}
			if block.Type == "unknown" {
				outcome = "unsupported"
				reason = "The extracted block type is unknown and must be reviewed before richer rendering is possible."
				confidence = "low"
			}
			decisions = append(decisions, store.StudyPipelineElementDecision{
				ID:                        "element-decision:" + block.ID,
				SourceElementID:           block.ID,
				SourceArtifactID:          "artifact:document-block:" + block.ID,
				SourcePageImageArtifactID: pageRenderByDocumentPage[documentPageKey(document.ID, page.PageNumber)],
				OutputArtifactID:          outputArtifactID(document.Resource),
				ElementKind:               pipelineElementKind(block.Type),
				Outcome:                   outcome,
				Reason:                    reason,
				DecidedBy:                 "system",
				Confidence:                confidence,
				PageNumber:                page.PageNumber,
				CreatedAt:                 now.UTC().Format(time.RFC3339),
				Metadata: map[string]any{
					"resourceId": document.Resource.ID,
					"label":      block.Label,
					"source":     block.Source,
				},
			})
		}
	}
	return decisions
}

func assetElementDecisions(document contract.PDFDocument, output string, pageRenderByDocumentPage map[string]string, now time.Time) []store.StudyPipelineElementDecision {
	decisions := []store.StudyPipelineElementDecision{}
	for _, asset := range document.Assets {
		if asset.Kind == "page_preview" {
			continue
		}
		outcome := "needs_review"
		reason := "The extracted visual asset is not referenced in the curated output and must be either placed or intentionally ignored."
		confidence := "medium"
		if assetReferenced(output, asset) {
			outcome = "used_in_output"
			reason = "The extracted visual asset is referenced in the curated output."
			confidence = "high"
		} else if looksDecorativeAsset(document, asset) {
			outcome = "ignored"
			reason = "The visual asset appears to be decorative or template-originated and is not part of the task content."
			confidence = "low"
		}
		decisions = append(decisions, store.StudyPipelineElementDecision{
			ID:                        "element-decision:" + document.ID + ":" + asset.ID,
			SourceElementID:           document.ID + ":" + asset.ID,
			SourceArtifactID:          "artifact:" + asset.Kind + ":" + document.ID + ":" + asset.ID,
			SourceAssetID:             asset.ID,
			SourcePageImageArtifactID: pageRenderByDocumentPage[documentPageKey(document.ID, asset.PageNumber)],
			OutputArtifactID:          outputArtifactID(document.Resource),
			ElementKind:               pipelineElementKind(asset.Kind),
			Outcome:                   outcome,
			Reason:                    reason,
			DecidedBy:                 "system",
			Confidence:                confidence,
			PageNumber:                asset.PageNumber,
			CreatedAt:                 now.UTC().Format(time.RFC3339),
			Metadata: map[string]any{
				"resourceId": document.Resource.ID,
				"path":       asset.Path,
				"role":       asset.Role,
				"mimeType":   asset.MimeType,
			},
		})
	}
	return decisions
}

func applyCurationProofs(decisions []store.StudyPipelineElementDecision, proofs map[string]CurationElementDecision, proofRequired bool, now time.Time) []store.StudyPipelineElementDecision {
	if !proofRequired {
		return decisions
	}
	for index := range decisions {
		decision := &decisions[index]
		proof, ok := proofs[decision.SourceElementID]
		if !ok {
			decision.Outcome = "needs_review"
			decision.Reason = "Codex curation did not provide an explicit final outcome for this source element."
			decision.DecidedBy = "system"
			decision.Confidence = "low"
			continue
		}
		outcome := normalizeCurationOutcome(proof.Outcome)
		if outcome == "" {
			decision.Outcome = "needs_review"
			decision.Reason = "Codex curation returned an unsupported outcome for this source element."
			decision.DecidedBy = "system"
			decision.Confidence = "low"
			continue
		}
		if decision.SourceAssetID != "" && outcome == "used_in_output" && decision.Outcome != "used_in_output" {
			decision.Outcome = "failed"
			decision.Reason = "Codex marked this visual element as used, but the curated output does not reference the extracted asset."
			decision.DecidedBy = "system"
			decision.Confidence = "high"
			continue
		}
		decision.Outcome = outcome
		decision.Reason = firstNonEmpty(proof.Reason, decision.Reason)
		decision.DecidedBy = "codex"
		decision.Confidence = firstNonEmpty(proof.Confidence, decision.Confidence)
		decision.CreatedAt = now.UTC().Format(time.RFC3339)
		if decision.Metadata == nil {
			decision.Metadata = map[string]any{}
		}
		if proof.OutputReference != "" {
			decision.Metadata["outputReference"] = proof.OutputReference
		}
	}
	return decisions
}

func normalizeCurationOutcome(value string) string {
	switch strings.TrimSpace(value) {
	case "used", "used_in_output":
		return "used_in_output"
	case "ignored", "unsupported", "failed":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func buildCurationChecklist(now time.Time, manifest elementAccountabilityManifest, manifestArtifactID string, pageRenderArtifactID string, previewArtifactID string, curation *codexCurationRun) *store.StudyPipelineCurationChecklist {
	status := "complete"
	accountabilityStatus := "checked"
	accountabilityReason := ""
	layoutStatus := "checked"
	layoutReason := ""
	codexStatus := "checked"
	codexReason := ""
	if manifest.NeedsReview > 0 || manifest.Failed > 0 {
		status = "incomplete"
		accountabilityStatus = "failed"
		accountabilityReason = fmt.Sprintf("%d detected element(s) still need review and %d failed.", manifest.NeedsReview, manifest.Failed)
		layoutStatus = "missing"
		layoutReason = "Layout reconstruction is blocked until all visual and text elements have final outcomes."
	}
	if curation != nil && !curationProofComplete(curation) {
		status = "incomplete"
		codexStatus = "failed"
		codexReason = "The Codex curation proof did not confirm page review, element review, layout reconstruction, preview review, source mapping, and final outcomes."
	}
	pageStatus := "checked"
	pageReason := ""
	if pageRenderArtifactID == "" {
		status = "incomplete"
		pageStatus = "missing"
		pageReason = "No rendered PDF page image was available as visual evidence."
	}
	extractedStatus := "checked"
	if manifest.TotalElements == 0 {
		status = "incomplete"
		extractedStatus = "missing"
	}
	return &store.StudyPipelineCurationChecklist{
		Status:                  status,
		CheckedBy:               "system",
		CheckedAt:               now.UTC().Format(time.RFC3339),
		RenderPreviewArtifactID: previewArtifactID,
		Items: []store.StudyPipelineCurationChecklistItem{
			{ID: "codex_curation_completed", Label: "Codex curation produced a structured proof", Status: codexStatus, EvidenceArtifactID: firstCurationArtifactID(curation), Reason: codexReason},
			{ID: "page_images_reviewed", Label: "Rendered PDF page images were available for review", Status: pageStatus, EvidenceArtifactID: pageRenderArtifactID, Reason: pageReason},
			{ID: "extracted_elements_reviewed", Label: "Extracted PDF elements were inspected", Status: extractedStatus, EvidenceArtifactID: manifestArtifactID},
			{ID: "element_accountability_complete", Label: "Every detected PDF element has a final outcome", Status: accountabilityStatus, EvidenceArtifactID: manifestArtifactID, Reason: accountabilityReason},
			{ID: "layout_reconstructed", Label: "Task layout was reconstructed from the PDF evidence", Status: layoutStatus, EvidenceArtifactID: previewArtifactID, Reason: layoutReason},
			{ID: "rendered_preview_reviewed", Label: "Rendered website preview was generated", Status: "checked", EvidenceArtifactID: previewArtifactID},
			{ID: "source_mapping_complete", Label: "Output source mapping is complete", Status: "checked", EvidenceArtifactID: manifestArtifactID},
		},
	}
}

func firstCurationArtifactID(curation *codexCurationRun) string {
	if curation == nil {
		return ""
	}
	return "artifact:codex-curation:" + curation.CourseID + ":" + curation.RunID
}

func pageRenderArtifactRefs(root string, courseID string, runID string, documents []contract.PDFDocument) []store.StudyPipelineArtifactRef {
	refs := []store.StudyPipelineArtifactRef{}
	for _, document := range documents {
		for _, asset := range document.Assets {
			if asset.Kind != "page_preview" {
				continue
			}
			refs = append(refs, store.StudyPipelineArtifactRef{
				ID:         pageRenderArtifactID(document.ID, asset.PageNumber),
				Kind:       "page_render",
				URI:        asset.Path,
				StorageKey: storageKeyForPath(root, asset.Path),
				PageNumber: asset.PageNumber,
				Metadata: map[string]any{
					"documentId": document.ID,
					"resourceId": document.Resource.ID,
					"runId":      runID,
				},
			})
		}
	}
	return refs
}

func pageRenderArtifactIDsByDocumentPage(documents []contract.PDFDocument) map[string]string {
	out := map[string]string{}
	for _, document := range documents {
		for _, asset := range document.Assets {
			if asset.Kind == "page_preview" {
				out[documentPageKey(document.ID, asset.PageNumber)] = pageRenderArtifactID(document.ID, asset.PageNumber)
			}
		}
	}
	return out
}

func curatedPreviewMarkdown(root string, courseID string, materials []contract.StudyPipelineMaterial) string {
	var out strings.Builder
	script := readTextFile(filepath.Join(courseDir(root, courseID), "curated", "script", "Script.mdx"))
	if strings.TrimSpace(script) != "" {
		out.WriteString("# Script Preview\n\n")
		out.WriteString(stripFrontmatter(script))
		out.WriteString("\n\n")
	}
	out.WriteString("# Task Preview\n\n")
	for _, material := range materials {
		if material.Type != "task" {
			continue
		}
		content := readTextFile(filepath.Join(courseDir(root, courseID), "curated", "tasks", safeSegment(taskID(material))+".mdx"))
		if strings.TrimSpace(content) == "" {
			continue
		}
		out.WriteString(stripFrontmatter(content))
		out.WriteString("\n\n")
	}
	return strings.TrimSpace(out.String()) + "\n"
}

func textBlockRepresented(output string, block contract.DocumentBlock) bool {
	needle := normalizeComparable(firstNonEmpty(block.Text, block.Markdown))
	if needle == "" {
		return true
	}
	if len(needle) > 120 {
		needle = needle[:120]
	}
	normalizedOutput := normalizeComparable(output)
	if strings.Contains(normalizedOutput, needle) {
		return true
	}
	return textBlockFuzzyRepresented(normalizedOutput, block)
}

func textBlockFuzzyRepresented(normalizedOutput string, block contract.DocumentBlock) bool {
	tokens := significantComparableTokens(firstNonEmpty(block.Text, block.Markdown))
	if len(tokens) == 0 {
		return true
	}
	if numericOnlyTokens(tokens) && len(tokens) <= 2 {
		return true
	}
	uniqueTokens := uniqueStrings(tokens)
	found := 0
	for _, token := range uniqueTokens {
		if strings.Contains(normalizedOutput, token) {
			found++
		}
	}
	coverage := float64(found) / float64(len(uniqueTokens))
	switch {
	case len(uniqueTokens) <= 4:
		return coverage >= 0.75
	case len(uniqueTokens) <= 10:
		return found >= 4 && coverage >= 0.65
	default:
		return found >= 8 && coverage >= 0.55
	}
}

func documentTextCoverage(document contract.PDFDocument, output string) float64 {
	total := 0
	represented := 0
	for _, page := range document.Pages {
		for _, block := range page.Blocks {
			if normalizeComparable(firstNonEmpty(block.Text, block.Markdown)) == "" {
				continue
			}
			total++
			if textBlockRepresented(output, block) {
				represented++
			}
		}
	}
	if total == 0 {
		return 1
	}
	return float64(represented) / float64(total)
}

func canIgnoreCuratedScriptFragment(document contract.PDFDocument, block contract.DocumentBlock, documentCoverage float64) bool {
	if document.Resource.Type != "slide" && document.Resource.Type != "script" {
		return false
	}
	if documentCoverage < 0.9 {
		return false
	}
	tokens := significantComparableTokens(firstNonEmpty(block.Text, block.Markdown))
	return len(tokens) > 0 && len(tokens) <= 10
}

func assetReferenced(output string, asset contract.DocumentAsset) bool {
	output = strings.ToLower(output)
	path := strings.ToLower(asset.Path)
	return strings.Contains(output, strings.ToLower(asset.ID)) ||
		(path != "" && strings.Contains(output, filepath.Base(path))) ||
		(path != "" && strings.Contains(output, path))
}

func looksDecorativeAsset(document contract.PDFDocument, asset contract.DocumentAsset) bool {
	name := normalize(document.Resource.Name + " " + asset.ID + " " + asset.Path + " " + asset.Role)
	return containsAny(name, "logo", "fhgr", "banner", "header", "footer", "template", "icon")
}

func pipelineElementKind(kind string) string {
	switch strings.TrimSpace(kind) {
	case "heading", "paragraph", "list", "code":
		return "text"
	case "table":
		return "table"
	case "formula":
		return "formula"
	case "caption":
		return "caption"
	case "page_header":
		return "header"
	case "page_footer":
		return "footer"
	case "embedded_image", "image":
		return "image"
	case "figure":
		return "figure"
	case "chart":
		return "chart"
	case "diagram":
		return "diagram"
	default:
		return "unknown"
	}
}

func outputArtifactID(material contract.StudyPipelineMaterial) string {
	switch material.Type {
	case "task":
		return "artifact:task-draft:" + material.ID
	case "solution":
		return "artifact:solution-draft:" + material.ID
	case "slide", "script":
		return "artifact:script-draft:" + material.ID
	default:
		return "artifact:curated-output:" + material.ID
	}
}

func pageRenderArtifactID(documentID string, pageNumber int) string {
	return fmt.Sprintf("artifact:page-render:%s:p%d", documentID, pageNumber)
}

func firstPageRenderArtifactID(refs []store.StudyPipelineArtifactRef) string {
	for _, ref := range refs {
		if ref.Kind == "page_render" {
			return ref.ID
		}
	}
	return ""
}

func documentPageKey(documentID string, pageNumber int) string {
	return fmt.Sprintf("%s:%d", documentID, pageNumber)
}

func storageKeyForPath(root string, path string) string {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return filepath.ToSlash(path)
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	if rel, err := filepath.Rel(absRoot, absPath); err == nil && !strings.HasPrefix(rel, "..") {
		return filepath.ToSlash(rel)
	}
	return filepath.ToSlash(path)
}

func readTextFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func normalizeComparable(value string) string {
	value = strings.ToLower(stripMarkdownMarkers(value))
	value = strings.Join(strings.Fields(value), " ")
	return value
}

func significantComparableTokens(value string) []string {
	normalized := normalizeComparable(value)
	raw := strings.FieldsFunc(normalized, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	tokens := make([]string, 0, len(raw))
	for _, token := range raw {
		token = strings.TrimSpace(token)
		if len([]rune(token)) < 2 || comparableStopWords[token] {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

var comparableStopWords = map[string]bool{
	"and": true, "are": true, "can": true, "das": true, "dem": true, "den": true,
	"der": true, "des": true, "die": true, "ein": true, "eine": true, "einer": true,
	"for": true, "from": true, "has": true, "have": true, "ist": true, "mit": true,
	"oder": true, "that": true, "the": true, "this": true, "und": true, "von": true,
	"was": true, "with": true, "you": true, "zur": true, "zum": true,
}

func numericOnlyTokens(tokens []string) bool {
	for _, token := range tokens {
		for _, r := range token {
			if !unicode.IsNumber(r) {
				return false
			}
		}
	}
	return len(tokens) > 0
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
