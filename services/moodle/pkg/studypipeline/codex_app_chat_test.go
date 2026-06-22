package studypipeline

import (
	"encoding/json"
	"testing"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

func TestCodexAppTurnTextCollectorEmitsDeltas(t *testing.T) {
	var events []contract.StudyPipelineRefineEvent
	collector := codexAppTurnTextCollector{
		threadID: "thread-1",
		turnID:   "turn-1",
		emit: func(event contract.StudyPipelineRefineEvent) {
			events = append(events, event)
		},
	}

	done, err := collector.handle(codexAppTestMessage("item/agentMessage/delta", map[string]any{
		"threadId": "thread-1",
		"turnId":   "turn-1",
		"delta":    "Hal",
	}))
	if err != nil {
		t.Fatalf("handle delta: %v", err)
	}
	if done {
		t.Fatalf("delta should not complete the turn")
	}
	_, err = collector.handle(codexAppTestMessage("item/agentMessage/delta", map[string]any{
		"threadId": "thread-1",
		"turnId":   "turn-1",
		"delta":    "lo",
	}))
	if err != nil {
		t.Fatalf("handle second delta: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("expected 2 emitted delta events, got %d", len(events))
	}
	if events[0].Category != "delta" || events[0].ContentPreview != "Hal" {
		t.Fatalf("unexpected first event: %#v", events[0])
	}
	if events[1].Category != "delta" || events[1].ContentPreview != "lo" {
		t.Fatalf("unexpected second event: %#v", events[1])
	}

	text, err := collector.text()
	if err != nil {
		t.Fatalf("collector text: %v", err)
	}
	if text != "Hallo" {
		t.Fatalf("text = %q, want Hallo", text)
	}
}

func TestCodexAppTurnTextCollectorUsesCompletedText(t *testing.T) {
	collector := codexAppTurnTextCollector{threadID: "thread-1", turnID: "turn-1"}
	_, err := collector.handle(codexAppTestMessage("item/agentMessage/delta", map[string]any{
		"threadId": "thread-1",
		"turnId":   "turn-1",
		"delta":    "partial",
	}))
	if err != nil {
		t.Fatalf("handle delta: %v", err)
	}
	_, err = collector.handle(codexAppTestMessage("item/completed", map[string]any{
		"threadId": "thread-1",
		"turnId":   "turn-1",
		"item": map[string]any{
			"type": "agentMessage",
			"text": "final text",
		},
	}))
	if err != nil {
		t.Fatalf("handle completed item: %v", err)
	}

	text, err := collector.text()
	if err != nil {
		t.Fatalf("collector text: %v", err)
	}
	if text != "final text" {
		t.Fatalf("text = %q, want final text", text)
	}
}

func TestCodexAppTurnTextCollectorCompletesMatchingTurn(t *testing.T) {
	collector := codexAppTurnTextCollector{threadID: "thread-1", turnID: "turn-1"}
	done, err := collector.handle(codexAppTestMessage("turn/completed", map[string]any{
		"threadId": "thread-1",
		"turn": map[string]any{
			"id": "turn-1",
		},
	}))
	if err != nil {
		t.Fatalf("handle turn completed: %v", err)
	}
	if !done {
		t.Fatal("expected matching turn to complete")
	}
}

func TestBuildCodexAppTurnStartParamsDoesNotSetServiceTier(t *testing.T) {
	params := buildCodexAppTurnStartParams("thread-1", "Hallo", []string{"page.png"}, "gpt-5.4-mini", "low")

	if _, ok := params["serviceTier"]; ok {
		t.Fatalf("serviceTier must be opt-in and should not be set by the default chat path")
	}
	if params["model"] != "gpt-5.4-mini" {
		t.Fatalf("model = %q, want gpt-5.4-mini", params["model"])
	}
	if params["effort"] != "low" {
		t.Fatalf("effort = %q, want low", params["effort"])
	}
}

func codexAppTestMessage(method string, params any) codexAppRPCMessage {
	body, err := json.Marshal(params)
	if err != nil {
		panic(err)
	}
	return codexAppRPCMessage{Method: method, Params: body}
}
