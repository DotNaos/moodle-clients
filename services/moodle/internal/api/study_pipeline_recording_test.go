package api

import (
	"testing"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func TestStudyPipelineRunOutcomeRespectsExplicitFailure(t *testing.T) {
	status, runError := studyPipelineRunOutcome(&contract.StudyPipelineResponse{
		Stage:  "curated",
		Status: "failed",
		Error:  "Codex is not connected",
	})
	if status != "failed" || runError != "Codex is not connected" {
		t.Fatalf("expected explicit failure to persist, got status=%q error=%q", status, runError)
	}
}

func TestStudyPipelineRecordTargetsExtractionResources(t *testing.T) {
	targets, err := studyPipelineRecordTargetResourceIDs(&contract.StudyPipelineResponse{
		Stage: "extracted",
		Materials: []contract.StudyPipelineMaterial{
			{ID: "947711", Type: "task"},
			{ID: "947712", Type: "solution"},
			{ID: "947711", Type: "task"},
		},
	})
	if err != nil {
		t.Fatalf("targets: %v", err)
	}
	if got, want := targets, []string{"947711", "947712"}; !sameStrings(got, want) {
		t.Fatalf("targets = %#v, want %#v", got, want)
	}
}

func TestStudyPipelineRecordTargetsCuratedOutputResources(t *testing.T) {
	targets, err := studyPipelineRecordTargetResourceIDs(&contract.StudyPipelineResponse{
		Stage: "curated",
		Materials: []contract.StudyPipelineMaterial{
			{ID: "947711", Type: "task"},
			{ID: "947712", Type: "solution"},
			{ID: "947900", Type: "script"},
		},
		TaskLinks: []contract.StudyPipelineTaskLink{{
			Task:     contract.StudyPipelineMaterial{ID: "947711", Type: "task"},
			Solution: &contract.StudyPipelineMaterial{ID: "947712", Type: "solution"},
			Status:   "paired",
		}},
	})
	if err != nil {
		t.Fatalf("targets: %v", err)
	}
	if got, want := targets, []string{"947711", "947900"}; !sameStrings(got, want) {
		t.Fatalf("targets = %#v, want %#v", got, want)
	}
}

func TestStudyPipelineRecordTargetsRejectResourceStageWithoutTargets(t *testing.T) {
	_, err := studyPipelineRecordTargetResourceIDs(&contract.StudyPipelineResponse{
		Stage: "extracted",
	})
	if err == nil {
		t.Fatal("expected extracted stage without resource targets to fail")
	}

	_, err = studyPipelineRecordTargetResourceIDs(&contract.StudyPipelineResponse{
		Stage: "curated",
	})
	if err == nil {
		t.Fatal("expected curated stage without resource targets to fail")
	}
}

func sameStrings(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}
