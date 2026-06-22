package api

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/DotNaos/moodle-services/internal/store"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
	"github.com/DotNaos/moodle-services/pkg/studypipeline"
)

func recordLocalStudyPipeline(ctx context.Context, response *contract.StudyPipelineResponse) error {
	if response == nil {
		return nil
	}
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return nil
	}
	st, err := store.Open(databaseURL)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()

	userID, err := st.EnsureStudyPipelineSystemUser(ctx)
	if err != nil {
		return err
	}
	status, runError := studyPipelineRunOutcome(response)
	targetResourceIDs, err := studyPipelineRecordTargetResourceIDs(response)
	if err != nil {
		return err
	}
	var firstRun *store.StudyPipelineRunRecord
	for _, resourceID := range targetResourceIDs {
		run, err := st.RecordStudyPipeline(ctx, store.StudyPipelineRecordInput{
			UserID:            userID,
			CourseID:          response.CourseID,
			ResourceID:        resourceID,
			Stage:             defaultStudyPipelineStage(response.Stage),
			Engine:            response.Engine,
			ConfigHash:        response.ConfigHash,
			ArtifactRoot:      response.ArtifactRoot,
			Status:            status,
			Error:             runError,
			ArtifactRefs:      response.ArtifactRefs,
			CurationChecklist: response.CurationChecklist,
			ElementDecisions:  response.ElementDecisions,
			Summary:           response.Summary,
			Materials:         studyPipelineMaterialRecords(response.Materials),
			TaskLinks:         studyPipelineTaskLinkRecords(response.TaskLinks),
		})
		if err != nil {
			return err
		}
		if run.ID != "" && firstRun == nil {
			firstRun = &run
		}
	}
	if firstRun != nil {
		response.Run = firstRun
	}
	if status == "failed" {
		response.Status = "failed"
		response.Error = runError
	}
	return nil
}

func studyPipelineRecordTargetResourceIDs(response *contract.StudyPipelineResponse) ([]string, error) {
	if response == nil {
		return []string{""}, nil
	}
	stage := defaultStudyPipelineStage(response.Stage)
	switch stage {
	case "extracted":
		return requiredUniqueStudyPipelineResourceIDs(stage, response.Materials)
	case "curated":
		return requiredUniqueStrings(stage, curatedStudyPipelineRecordTargetResourceIDs(response))
	default:
		return []string{""}, nil
	}
}

func curatedStudyPipelineRecordTargetResourceIDs(response *contract.StudyPipelineResponse) []string {
	ids := make([]string, 0, len(response.TaskLinks)+len(response.Materials))
	for _, link := range response.TaskLinks {
		ids = append(ids, link.Task.ID)
	}
	taskIDs := map[string]struct{}{}
	for _, link := range response.TaskLinks {
		if trimmed := strings.TrimSpace(link.Task.ID); trimmed != "" {
			taskIDs[trimmed] = struct{}{}
		}
		if link.Solution != nil {
			if trimmed := strings.TrimSpace(link.Solution.ID); trimmed != "" {
				taskIDs[trimmed] = struct{}{}
			}
		}
	}
	for _, material := range response.Materials {
		if material.Type != "script" && material.Type != "slide" {
			continue
		}
		if _, isTaskInput := taskIDs[strings.TrimSpace(material.ID)]; isTaskInput {
			continue
		}
		ids = append(ids, material.ID)
	}
	return uniqueStrings(ids)
}

func requiredUniqueStudyPipelineResourceIDs(stage string, materials []contract.StudyPipelineMaterial) ([]string, error) {
	ids := make([]string, 0, len(materials))
	for _, material := range materials {
		ids = append(ids, material.ID)
	}
	return requiredUniqueStrings(stage, ids)
}

func requiredUniqueStrings(stage string, values []string) ([]string, error) {
	out := uniqueStrings(values)
	if len(out) == 0 {
		return nil, fmt.Errorf("%s run cannot be recorded without concrete resource targets", stage)
	}
	return out, nil
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func studyPipelineRunOutcome(response *contract.StudyPipelineResponse) (string, string) {
	if response == nil {
		return "succeeded", ""
	}
	if strings.TrimSpace(response.Status) == "failed" {
		return "failed", firstNonEmpty(response.Error, "study pipeline stage failed")
	}
	if response.CurationChecklist == nil {
		return "succeeded", ""
	}
	for _, decision := range response.ElementDecisions {
		switch strings.TrimSpace(decision.Outcome) {
		case "needs_review", "failed":
			return "failed", "element accountability incomplete"
		}
	}
	if strings.TrimSpace(response.CurationChecklist.Status) != "complete" {
		return "failed", "curation checklist incomplete"
	}
	return "succeeded", ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func recordLocalStudyPipelineFailure(ctx context.Context, courseID string, stage string, options studypipeline.RunOptions, err error) error {
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" || strings.TrimSpace(courseID) == "" {
		return nil
	}
	st, openErr := store.Open(databaseURL)
	if openErr != nil {
		return openErr
	}
	defer func() { _ = st.Close() }()

	userID, ensureErr := st.EnsureStudyPipelineSystemUser(ctx)
	if ensureErr != nil {
		return ensureErr
	}
	now := time.Now().UTC()
	_, recordErr := st.RecordStudyPipeline(ctx, store.StudyPipelineRecordInput{
		UserID:       userID,
		CourseID:     courseID,
		Stage:        defaultStudyPipelineStage(stage),
		Engine:       options.Engine,
		ConfigHash:   options.ConfigHash,
		ArtifactRoot: studypipeline.CourseArtifactRoot("", courseID),
		Status:       "failed",
		Error:        errorMessage(err),
		StartedAt:    now,
		FinishedAt:   now,
	})
	return recordErr
}

func studyPipelineMaterialRecords(materials []contract.StudyPipelineMaterial) []store.StudyPipelineMaterialRecord {
	records := make([]store.StudyPipelineMaterialRecord, 0, len(materials))
	for _, material := range materials {
		records = append(records, store.StudyPipelineMaterialRecord{
			ID:             material.ID,
			Name:           material.Name,
			URL:            material.URL,
			ResourceType:   material.ResourceType,
			FileType:       material.FileType,
			SectionID:      material.SectionID,
			SectionName:    material.SectionName,
			Classification: material.Type,
		})
	}
	return records
}

func defaultStudyPipelineStage(stage string) string {
	stage = contract.NormalizeStudyPipelineStage(stage)
	if stage == "" {
		return "curated"
	}
	return stage
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func studyPipelineTaskLinkRecords(links []contract.StudyPipelineTaskLink) []store.StudyPipelineTaskLinkRecord {
	records := make([]store.StudyPipelineTaskLinkRecord, 0, len(links))
	for _, link := range links {
		record := store.StudyPipelineTaskLinkRecord{
			TaskResourceID: link.Task.ID,
			Status:         link.Status,
		}
		if link.Solution != nil {
			record.SolutionResourceID = link.Solution.ID
		}
		records = append(records, record)
	}
	return records
}
