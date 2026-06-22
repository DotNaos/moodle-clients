package moodleservices

import (
	"testing"

	"github.com/DotNaos/moodle-services/internal/store"
	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func TestStudyPipelineRunOutcomeUsesCurationAccountability(t *testing.T) {
	cases := []struct {
		name       string
		response   contract.StudyPipelineResponse
		wantStatus string
		wantError  string
	}{
		{
			name: "non curated response succeeds",
			response: contract.StudyPipelineResponse{
				Stage: "extracted",
			},
			wantStatus: "succeeded",
		},
		{
			name: "explicit failed response fails",
			response: contract.StudyPipelineResponse{
				Stage:  "curated",
				Status: "failed",
				Error:  "Codex is not connected",
			},
			wantStatus: "failed",
			wantError:  "Codex is not connected",
		},
		{
			name: "complete curated response succeeds",
			response: contract.StudyPipelineResponse{
				Stage: "curated",
				CurationChecklist: &store.StudyPipelineCurationChecklist{
					Status: "complete",
				},
				ElementDecisions: []store.StudyPipelineElementDecision{
					{SourceElementID: "text-1", Outcome: "used_in_output"},
					{SourceElementID: "image-1", Outcome: "ignored"},
				},
			},
			wantStatus: "succeeded",
		},
		{
			name: "incomplete checklist fails",
			response: contract.StudyPipelineResponse{
				Stage: "curated",
				CurationChecklist: &store.StudyPipelineCurationChecklist{
					Status: "incomplete",
				},
			},
			wantStatus: "failed",
			wantError:  "curation checklist incomplete",
		},
		{
			name: "unaccounted element fails",
			response: contract.StudyPipelineResponse{
				Stage: "curated",
				CurationChecklist: &store.StudyPipelineCurationChecklist{
					Status: "complete",
				},
				ElementDecisions: []store.StudyPipelineElementDecision{
					{SourceElementID: "image-1", Outcome: "needs_review"},
				},
			},
			wantStatus: "failed",
			wantError:  "element accountability incomplete",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotStatus, gotError := studyPipelineRunOutcome(tc.response)
			if gotStatus != tc.wantStatus || gotError != tc.wantError {
				t.Fatalf("unexpected outcome status=%q error=%q", gotStatus, gotError)
			}
		})
	}
}

func TestStudyPipelineRecordTargetsResourceStages(t *testing.T) {
	cases := []struct {
		name     string
		response contract.StudyPipelineResponse
		want     []string
	}{
		{
			name: "extracted records each material",
			response: contract.StudyPipelineResponse{
				Stage: "extracted",
				Materials: []contract.StudyPipelineMaterial{
					{ID: "947711"},
					{ID: "947712"},
					{ID: "947711"},
				},
			},
			want: []string{"947711", "947712"},
		},
		{
			name: "curated records task input",
			response: contract.StudyPipelineResponse{
				Stage: "curated",
				TaskLinks: []contract.StudyPipelineTaskLink{
					{Task: contract.StudyPipelineMaterial{ID: "947711"}, Solution: &contract.StudyPipelineMaterial{ID: "947712"}},
				},
			},
			want: []string{"947711"},
		},
		{
			name: "inventory remains course scoped",
			response: contract.StudyPipelineResponse{
				Stage: "inventory",
			},
			want: []string{""},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := studyPipelineRecordTargetResourceIDs(tc.response)
			if err != nil {
				t.Fatalf("studyPipelineRecordTargetResourceIDs returned error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("target count mismatch: got %#v want %#v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("target mismatch: got %#v want %#v", got, tc.want)
				}
			}
		})
	}
}

func TestStudyPipelineRecordTargetsRejectResourceStageWithoutTargets(t *testing.T) {
	cases := []contract.StudyPipelineResponse{
		{Stage: "extracted"},
		{Stage: "curated"},
	}
	for _, response := range cases {
		t.Run(response.Stage, func(t *testing.T) {
			if _, err := studyPipelineRecordTargetResourceIDs(response); err == nil {
				t.Fatalf("expected %s without targets to fail", response.Stage)
			}
		})
	}
}
