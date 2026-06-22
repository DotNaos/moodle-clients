package handler

import (
	"testing"

	svc "github.com/DotNaos/moodle-services/pkg/moodleservices"
)

func TestFilterStudyPipelineResourcesKeepsRequestedScope(t *testing.T) {
	resources := []svc.Resource{
		{ID: "947711", Name: "Aufgabenblatt 01"},
		{ID: "947712", Name: "Aufgabenblatt 01 Lösung"},
		{ID: "947740", Name: "Aufgabenblatt 10"},
	}

	filtered, ok := filterStudyPipelineResources(resources, []string{"947711", "947712"})
	if !ok {
		t.Fatal("expected selected resources to match")
	}
	if len(filtered) != 2 {
		t.Fatalf("expected only selected resources, got %d", len(filtered))
	}
	for _, resource := range filtered {
		if resource.ID == "947740" {
			t.Fatalf("unexpected unselected resource in filtered result: %#v", resource)
		}
	}
}

func TestFilterStudyPipelineResourcesRejectsUnknownSelection(t *testing.T) {
	resources := []svc.Resource{{ID: "947711", Name: "Aufgabenblatt 01"}}

	filtered, ok := filterStudyPipelineResources(resources, []string{"missing"})
	if ok {
		t.Fatalf("expected unknown selection to be rejected, got %#v", filtered)
	}
}
