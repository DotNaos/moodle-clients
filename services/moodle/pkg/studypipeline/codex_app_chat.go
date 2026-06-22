package studypipeline

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

type codexAppRPCClient struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	messages chan codexAppRPCMessage
	readErr  chan error
	nextID   atomic.Int64
	close    sync.Once
	stderr   codexAppSafeBuffer
	backlog  codexAppMessageBacklog
}

type codexAppRPCMessage struct {
	ID     int64             `json:"id,omitempty"`
	Method string            `json:"method,omitempty"`
	Params json.RawMessage   `json:"params,omitempty"`
	Result json.RawMessage   `json:"result,omitempty"`
	Error  *codexAppRPCError `json:"error,omitempty"`
}

type codexAppRPCError struct {
	Message string `json:"message"`
}

func runCodexChatAppServer(
	ctx context.Context,
	input CodexChatInput,
	model string,
	reasoningEffort string,
	image string,
) (contract.CodexRunResponse, error) {
	// This path intentionally mirrors the Codex desktop/app transport instead
	// of `codex exec`. The local POC showed WebSocket app-server streaming real
	// assistant text through item/agentMessage/delta events; the same prompt
	// through `codex exec --json` only produced the final agent_message after the
	// turn was complete. For the web chat, `exec` can still be useful for
	// structured one-shot runs, but it cannot be the transport for live text.
	stateRoot, err := prepareCodexStateRoot(firstNonEmpty(input.ArtifactRoot, ArtifactRootFromEnv()), input.UserID)
	if err != nil {
		return contract.CodexRunResponse{}, err
	}
	client, err := newDockerCodexAppRPCClient(ctx, dockerCodexOptions{
		Image:           image,
		Model:           model,
		ReasoningEffort: reasoningEffort,
		ArtifactRoot:    input.ArtifactRoot,
		UserID:          input.UserID,
	}, stateRoot)
	if err != nil {
		return contract.CodexRunResponse{}, err
	}
	defer client.Close()

	if input.Emit != nil {
		input.Emit(contract.StudyPipelineRefineEvent{
			Type:            "runner",
			Category:        "status",
			Message:         "Starting Codex chat in the app-server runner.",
			Model:           model,
			ReasoningEffort: reasoningEffort,
		})
	}
	if err := client.initialize(ctx); err != nil {
		return contract.CodexRunResponse{}, fmt.Errorf("codex app-server initialize failed: %w", err)
	}
	threadID, err := client.startChatThread(ctx, model)
	if err != nil {
		return contract.CodexRunResponse{}, fmt.Errorf("codex app-server thread failed: %w", err)
	}
	text, err := client.runChatTurn(ctx, threadID, buildCodexChatPrompt(input.Prompt, input.Images), input.AttachmentImages, model, reasoningEffort, input.Emit)
	if err != nil {
		return contract.CodexRunResponse{}, fmt.Errorf("codex app-server chat failed: %w", err)
	}
	return parseCodexChatOutput(text)
}

func newDockerCodexAppRPCClient(ctx context.Context, options dockerCodexOptions, stateRoot string) (*codexAppRPCClient, error) {
	args := []string{
		"run", "--rm", "-i",
		// The configured runner image has its own application entrypoint. Start
		// a shell explicitly so this code can launch Codex's app-server process
		// instead of invoking the Moodle service binary.
		"--entrypoint", "sh",
		"--user", "0:0",
		"--security-opt", "seccomp=unconfined",
		"-e", "CODEX_MODEL=" + options.Model,
		"-e", "CODEX_REASONING_EFFORT=" + sanitizeCodexOption(options.ReasoningEffort),
		"-e", "HOME=/home/codex",
		"-e", "CODEX_HOME=/home/codex/.codex",
		"-v", dockerHostMountPath(stateRoot) + ":/home/codex/.codex",
	}
	artifactRoot := firstNonEmpty(options.ArtifactRoot, ArtifactRootFromEnv())
	if strings.TrimSpace(artifactRoot) != "" {
		args = append(args, "-v", dockerHostMountPath(artifactRoot)+":"+artifactRoot+":ro")
	}
	args = appendCodexResourceCacheMount(args)
	args = append(args, options.Image, "-lc", "codex app-server --listen stdio://")
	cmd := exec.CommandContext(ctx, "docker", args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	client := &codexAppRPCClient{
		cmd:      cmd,
		stdin:    stdin,
		messages: make(chan codexAppRPCMessage, 128),
		readErr:  make(chan error, 1),
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go client.readStdout(stdout)
	go func() {
		_, _ = io.Copy(&client.stderr, stderr)
	}()
	return client, nil
}

func (c *codexAppRPCClient) initialize(ctx context.Context) error {
	_, err := c.call(ctx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "moodle-services",
			"title":   "Moodle Services",
			"version": "0.1.0",
		},
		"capabilities": map[string]any{
			"experimentalApi":    false,
			"requestAttestation": false,
			"optOutNotificationMethods": []string{
				"mcpServer/startupStatus/updated",
			},
		},
	})
	if err != nil {
		return err
	}
	return c.notify("initialized", nil)
}

func (c *codexAppRPCClient) startChatThread(ctx context.Context, model string) (string, error) {
	result, err := c.call(ctx, "thread/start", map[string]any{
		"model":            model,
		"cwd":              "/home/codex/.codex",
		"approvalPolicy":   "never",
		"sandbox":          "read-only",
		"ephemeral":        true,
		"baseInstructions": "Answer the Moodle dashboard user in plain Markdown. Do not use tools unless the user explicitly asks for local file inspection.",
	})
	if err != nil {
		return "", err
	}
	var parsed struct {
		Thread struct {
			ID string `json:"id"`
		} `json:"thread"`
	}
	if err := json.Unmarshal(result, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.Thread.ID) == "" {
		return "", errors.New("codex app-server thread/start response did not include a thread id")
	}
	return parsed.Thread.ID, nil
}

func (c *codexAppRPCClient) runChatTurn(
	ctx context.Context,
	threadID string,
	prompt string,
	attachmentImages []string,
	model string,
	reasoningEffort string,
	emit func(contract.StudyPipelineRefineEvent),
) (string, error) {
	params := buildCodexAppTurnStartParams(threadID, prompt, attachmentImages, model, reasoningEffort)
	result, err := c.call(ctx, "turn/start", params)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Turn struct {
			ID string `json:"id"`
		} `json:"turn"`
	}
	if err := json.Unmarshal(result, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.Turn.ID) == "" {
		return "", errors.New("codex app-server turn/start response did not include a turn id")
	}

	collector := codexAppTurnTextCollector{threadID: threadID, turnID: parsed.Turn.ID, emit: emit}
	for {
		message, err := c.nextMessage(ctx)
		if err != nil {
			return "", err
		}
		done, err := collector.handle(message)
		if err != nil {
			return "", err
		}
		if done {
			return collector.text()
		}
	}
}

func buildCodexAppTurnStartParams(
	threadID string,
	prompt string,
	attachmentImages []string,
	model string,
	reasoningEffort string,
) map[string]any {
	input := []map[string]any{{
		"type":          "text",
		"text":          prompt,
		"text_elements": []any{},
	}}
	for _, name := range attachmentImages {
		safe := safeUploadFileName(name)
		if safe == "" {
			continue
		}
		input = append(input, map[string]any{
			"type":   "localImage",
			"path":   filepath.ToSlash(filepath.Join("/home/codex/.codex/uploads", safe)),
			"detail": "high",
		})
	}

	params := map[string]any{
		"threadId": threadID,
		"input":    input,
	}
	if strings.TrimSpace(model) != "" {
		params["model"] = model
	}
	if effort := sanitizeCodexOption(reasoningEffort); effort != "" {
		params["effort"] = effort
	}
	// Do not set serviceTier here. The app-server protocol supports it, but the
	// default chat path must stay on the account default so normal messages do
	// not burn through higher-speed quota. A faster tier should only be passed
	// when the frontend exposes an explicit user choice for it.
	return params
}

func (c *codexAppRPCClient) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	id := c.nextID.Add(1)
	if err := c.write(codexAppRPCMessage{ID: id, Method: method, Params: mustMarshalCodexAppRaw(params)}); err != nil {
		return nil, err
	}
	deferred := []codexAppRPCMessage{}
	defer func() {
		c.backlog.Prepend(deferred)
	}()
	for {
		message, err := c.nextMessage(ctx)
		if err != nil {
			return nil, err
		}
		if message.ID != id {
			deferred = append(deferred, message)
			continue
		}
		if message.Error != nil {
			return nil, errors.New(message.Error.Message)
		}
		return message.Result, nil
	}
}

func (c *codexAppRPCClient) notify(method string, params any) error {
	return c.write(codexAppRPCMessage{Method: method, Params: mustMarshalCodexAppRaw(params)})
}

func (c *codexAppRPCClient) write(message codexAppRPCMessage) error {
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}
	body = append(body, '\n')
	_, err = c.stdin.Write(body)
	return err
}

func (c *codexAppRPCClient) nextMessage(ctx context.Context) (codexAppRPCMessage, error) {
	if message, ok := c.backlog.Pop(); ok {
		return message, nil
	}
	select {
	case <-ctx.Done():
		return codexAppRPCMessage{}, ctx.Err()
	case err := <-c.readErr:
		if stderr := strings.TrimSpace(c.stderr.String()); stderr != "" {
			return codexAppRPCMessage{}, fmt.Errorf("%w: %s", err, stderr)
		}
		return codexAppRPCMessage{}, err
	case message := <-c.messages:
		return message, nil
	}
}

func (c *codexAppRPCClient) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var message codexAppRPCMessage
		if err := json.Unmarshal(line, &message); err != nil {
			continue
		}
		c.messages <- message
	}
	if err := scanner.Err(); err != nil {
		c.readErr <- err
		return
	}
	c.readErr <- io.EOF
}

func (c *codexAppRPCClient) Close() error {
	var err error
	c.close.Do(func() {
		if c.stdin != nil {
			err = c.stdin.Close()
		}
		if c.cmd != nil && c.cmd.Process != nil {
			_ = c.cmd.Process.Kill()
			_ = c.cmd.Wait()
		}
	})
	return err
}

func mustMarshalCodexAppRaw(value any) json.RawMessage {
	if value == nil {
		return nil
	}
	body, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return body
}
