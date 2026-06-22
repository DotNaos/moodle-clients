package studypipeline

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

type codexAppMessageBacklog struct {
	mu       sync.Mutex
	messages []codexAppRPCMessage
}

func (b *codexAppMessageBacklog) Pop() (codexAppRPCMessage, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.messages) == 0 {
		return codexAppRPCMessage{}, false
	}
	message := b.messages[0]
	b.messages = b.messages[1:]
	return message, true
}

func (b *codexAppMessageBacklog) Prepend(messages []codexAppRPCMessage) {
	if len(messages) == 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.messages = append(append([]codexAppRPCMessage{}, messages...), b.messages...)
}

type codexAppTurnTextCollector struct {
	threadID      string
	turnID        string
	emit          func(contract.StudyPipelineRefineEvent)
	delta         strings.Builder
	completedText string
}

func (c *codexAppTurnTextCollector) handle(message codexAppRPCMessage) (bool, error) {
	switch message.Method {
	case "item/agentMessage/delta":
		var params struct {
			ThreadID string `json:"threadId"`
			TurnID   string `json:"turnId"`
			Delta    string `json:"delta"`
		}
		if err := json.Unmarshal(message.Params, &params); err != nil {
			return false, err
		}
		if params.ThreadID == c.threadID && params.TurnID == c.turnID && params.Delta != "" {
			c.delta.WriteString(params.Delta)
			// This notification is the real streaming signal observed from the
			// app server. Forward each delta immediately to the HTTP NDJSON layer.
			if c.emit != nil {
				c.emit(contract.StudyPipelineRefineEvent{
					Type:           "codex",
					Category:       "delta",
					Message:        "Codex streamed assistant text.",
					ContentPreview: params.Delta,
				})
			}
		}
	case "item/completed":
		var params struct {
			ThreadID string `json:"threadId"`
			TurnID   string `json:"turnId"`
			Item     struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"item"`
		}
		if err := json.Unmarshal(message.Params, &params); err != nil {
			return false, err
		}
		if params.ThreadID == c.threadID && params.TurnID == c.turnID && params.Item.Type == "agentMessage" {
			c.completedText = params.Item.Text
		}
	case "turn/completed":
		var params struct {
			ThreadID string `json:"threadId"`
			Turn     struct {
				ID string `json:"id"`
			} `json:"turn"`
		}
		if err := json.Unmarshal(message.Params, &params); err != nil {
			return false, err
		}
		return params.ThreadID == c.threadID && params.Turn.ID == c.turnID, nil
	case "error":
		var params struct {
			ThreadID string `json:"threadId"`
			TurnID   string `json:"turnId"`
			Error    struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(message.Params, &params); err != nil {
			return false, err
		}
		if params.ThreadID == c.threadID && (params.TurnID == "" || params.TurnID == c.turnID) {
			return false, errors.New(params.Error.Message)
		}
	}
	return false, nil
}

func (c *codexAppTurnTextCollector) text() (string, error) {
	text := strings.TrimSpace(c.completedText)
	if text == "" {
		text = strings.TrimSpace(c.delta.String())
	}
	if text == "" {
		return "", errors.New("codex app-server turn completed without text")
	}
	return text, nil
}

type codexAppSafeBuffer struct {
	mu sync.Mutex
	b  strings.Builder
}

func (b *codexAppSafeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.b.Len() < 64*1024 {
		_, _ = b.b.Write(p)
	}
	return len(p), nil
}

func (b *codexAppSafeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.String()
}
