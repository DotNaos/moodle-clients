package moodleservices

import (
	"context"
	"fmt"
	"strings"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func RecordStudyPipelineResponse(ctx context.Context, st *Store, userID string, response contract.StudyPipelineResponse) (StudyPipelineRunRecord, error) {
	if st == nil || strings.TrimSpace(userID) == "" {
		return StudyPipelineRunRecord{}, nil
	}
	materials := make([]StudyPipelineMaterialRecord, 0, len(response.Materials))
	for _, material := range response.Materials {
		materials = append(materials, StudyPipelineMaterialRecord{
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
	links := make([]StudyPipelineTaskLinkRecord, 0, len(response.TaskLinks))
	for _, link := range response.TaskLinks {
		record := StudyPipelineTaskLinkRecord{
			TaskResourceID: link.Task.ID,
			Status:         link.Status,
		}
		if link.Solution != nil {
			record.SolutionResourceID = link.Solution.ID
		}
		links = append(links, record)
	}
	status, runError := studyPipelineRunOutcome(response)
	targetResourceIDs, err := studyPipelineRecordTargetResourceIDs(response)
	if err != nil {
		return StudyPipelineRunRecord{}, err
	}
	var firstRun StudyPipelineRunRecord
	for _, resourceID := range targetResourceIDs {
		run, err := st.RecordStudyPipeline(ctx, StudyPipelineRecordInput{
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
			Materials:         materials,
			TaskLinks:         links,
		})
		if err != nil {
			return StudyPipelineRunRecord{}, err
		}
		if firstRun.ID == "" {
			firstRun = run
		}
	}
	return firstRun, nil
}

func studyPipelineRecordTargetResourceIDs(response contract.StudyPipelineResponse) ([]string, error) {
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

func curatedStudyPipelineRecordTargetResourceIDs(response contract.StudyPipelineResponse) []string {
	ids := make([]string, 0, len(response.TaskLinks)+len(response.Materials))
	taskIDs := map[string]struct{}{}
	for _, link := range response.TaskLinks {
		ids = append(ids, link.Task.ID)
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

func studyPipelineRunOutcome(response contract.StudyPipelineResponse) (string, string) {
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

func defaultStudyPipelineStage(stage string) string {
	stage = contract.NormalizeStudyPipelineStage(stage)
	if stage == "" {
		return "curated"
	}
	return stage
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
