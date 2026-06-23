package studypipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	contract "github.com/DotNaos/moodle-services/pkg/apicontracts"
)

const EnvCodexSDKCommand = "MOODLE_STUDY_CODEX_SDK_COMMAND"

type SDKCommandCodexCurator struct {
	Command string
}

type SDKCommandCodexRefiner struct {
	Command string
}

type codexSDKCurationRequest struct {
	Prompt           string          `json:"prompt"`
	Model            string          `json:"model"`
	ReasoningEffort  string          `json:"reasoningEffort,omitempty"`
	WorkingDirectory string          `json:"workingDirectory"`
	ImagePaths       []string        `json:"imagePaths,omitempty"`
	OutputSchema     json.RawMessage `json:"outputSchema,omitempty"`
}

type codexSDKCurationResponse struct {
	FinalResponse string `json:"finalResponse"`
	ThreadID      string `json:"threadId"`
	Error         string `json:"error"`
}

func defaultCodexCurator() ContentCurator {
	if command := defaultCodexSDKCommand(); command != "" {
		return SDKCommandCodexCurator{Command: command}
	}
	return DockerCodexCurator{}
}

func defaultCodexRefiner() ContentRefiner {
	if command := defaultCodexSDKCommand(); command != "" {
		return SDKCommandCodexRefiner{Command: command}
	}
	return DockerCodexRefiner{}
}

func defaultCodexSDKCommand() string {
	if command := strings.TrimSpace(os.Getenv(EnvCodexSDKCommand)); command != "" {
		return command
	}
	script := findRepoRelativeFile("scripts/study-pipeline-codex-sdk-runner.ts")
	if script != "" {
		return "bun " + shellQuote(script)
	}
	image := strings.TrimSpace(os.Getenv(EnvCodexDockerImage))
	if image == "" {
		return ""
	}
	return strings.Join([]string{
		"docker run --rm -i",
		"--user 0:0",
		"--security-opt seccomp=unconfined",
		"-e HOME=/home/codex",
		"-e CODEX_HOME=/home/codex/.codex",
		"-v \"$MOODLE_STUDY_CODEX_STATE_ROOT:/home/codex/.codex\"",
		"-v \"$MOODLE_STUDY_ARTIFACT_ROOT:$MOODLE_STUDY_ARTIFACT_ROOT:ro\"",
		shellQuote(image),
		"node /opt/moodle-codex-runner/sdk-runner.mjs",
	}, " ")
}

func findRepoRelativeFile(relativePath string) string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		candidate := filepath.Join(wd, filepath.FromSlash(relativePath))
		if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
			return candidate
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			return ""
		}
		wd = parent
	}
}

func (curator SDKCommandCodexCurator) Curate(ctx context.Context, input CurationInput) (CurationOutput, error) {
	command := strings.TrimSpace(curator.Command)
	if command == "" {
		command = defaultCodexSDKCommand()
	}
	if command == "" {
		return CurationOutput{}, fmt.Errorf("%s is not configured and the SDK runner script was not found", EnvCodexSDKCommand)
	}
	model := sanitizeCodexModel(input.Model)
	if model == "" {
		return CurationOutput{}, fmt.Errorf("codex model is required for SDK curation")
	}
	stateRoot, err := prepareCodexStateRoot(firstNonEmpty(input.ArtifactRoot, ArtifactRootFromEnv()), input.UserID)
	if err != nil {
		return CurationOutput{}, err
	}
	imagePaths, err := resolveCurationImagePaths(input.ArtifactRoot, input.ImagePaths)
	if err != nil {
		return CurationOutput{}, err
	}
	request := codexSDKCurationRequest{
		Prompt:           input.Prompt,
		Model:            model,
		ReasoningEffort:  sanitizeCodexOption(input.ReasoningEffort),
		WorkingDirectory: codexSDKWorkingDirectory(command, stateRoot),
		ImagePaths:       imagePaths,
		OutputSchema:     curationOutputSchema(),
	}
	data, err := json.Marshal(request)
	if err != nil {
		return CurationOutput{}, err
	}
	if input.Emit != nil {
		input.Emit(contract.StudyPipelineRefineEvent{
			Type:            "runner",
			Category:        "status",
			Message:         "Starting Codex curation through the SDK runner.",
			Model:           model,
			ReasoningEffort: request.ReasoningEffort,
		})
	}
	cmd := exec.CommandContext(ctx, "sh", "-lc", command)
	cmd.Stdin = bytes.NewReader(data)
	cmd.Env = append(os.Environ(),
		"MOODLE_STUDY_CODEX_SDK_MODE=curation",
		"MOODLE_STUDY_ARTIFACT_ROOT="+firstNonEmpty(input.ArtifactRoot, ArtifactRootFromEnv()),
		"MOODLE_STUDY_CODEX_STATE_ROOT="+stateRoot,
		"MOODLE_STUDY_CODEX_USER_ID="+input.UserID,
	)
	output, err := runCommandWithOptionalEvents(cmd, input.Emit)
	if err != nil {
		if isCodexAuthError(err.Error(), output) {
			return CurationOutput{}, ErrCodexNotAuthenticated
		}
		return CurationOutput{}, fmt.Errorf("codex SDK curation failed for %s: %w (%s)", input.Title, err, compactProcessOutput(output))
	}
	finalResponse, err := parseCodexSDKRunnerResponse(output)
	if err != nil {
		return CurationOutput{}, fmt.Errorf("codex SDK curation returned invalid runner output for %s: %w", input.Title, err)
	}
	parsed, err := parseCurationOutput(finalResponse)
	if err != nil {
		return CurationOutput{}, fmt.Errorf("codex SDK curation returned invalid output for %s: %w", input.Title, err)
	}
	parsed.Model = model
	return parsed, nil
}

func (refiner SDKCommandCodexRefiner) Refine(ctx context.Context, input RefineInput) (RefineOutput, error) {
	command := strings.TrimSpace(refiner.Command)
	if command == "" {
		command = defaultCodexSDKCommand()
	}
	if command == "" {
		return RefineOutput{}, fmt.Errorf("%s is not configured and the SDK runner script was not found", EnvCodexSDKCommand)
	}
	model := sanitizeCodexModel(input.Model)
	if model == "" {
		return RefineOutput{}, fmt.Errorf("codex model is required; load /api/codex/models and pass one of the returned model ids")
	}
	stateRoot, err := prepareCodexStateRoot(firstNonEmpty(input.ArtifactRoot, ArtifactRootFromEnv()), input.UserID)
	if err != nil {
		return RefineOutput{}, err
	}
	request := codexSDKCurationRequest{
		Prompt:           buildRefinePrompt(input),
		Model:            model,
		ReasoningEffort:  sanitizeCodexOption(input.ReasoningEffort),
		WorkingDirectory: codexSDKWorkingDirectory(command, stateRoot),
	}
	data, err := json.Marshal(request)
	if err != nil {
		return RefineOutput{}, err
	}
	if input.Emit != nil {
		input.Emit(contract.StudyPipelineRefineEvent{
			Type:            "runner",
			Category:        "status",
			Message:         "Starting Codex refinement through the SDK runner.",
			Model:           model,
			ReasoningEffort: request.ReasoningEffort,
		})
	}
	cmd := exec.CommandContext(ctx, "sh", "-lc", command)
	cmd.Stdin = bytes.NewReader(data)
	cmd.Env = append(os.Environ(),
		"MOODLE_STUDY_CODEX_SDK_MODE=refinement",
		"MOODLE_STUDY_ARTIFACT_ROOT="+firstNonEmpty(input.ArtifactRoot, ArtifactRootFromEnv()),
		"MOODLE_STUDY_CODEX_STATE_ROOT="+stateRoot,
		"MOODLE_STUDY_CODEX_USER_ID="+input.UserID,
	)
	output, err := runCommandWithOptionalEvents(cmd, input.Emit)
	if err != nil {
		if isCodexAuthError(err.Error(), output) {
			return RefineOutput{}, ErrCodexNotAuthenticated
		}
		return RefineOutput{}, fmt.Errorf("codex SDK refinement failed for %s: %w (%s)", input.Title, err, compactProcessOutput(output))
	}
	finalResponse, err := parseCodexSDKRunnerResponse(output)
	if err != nil {
		return RefineOutput{}, fmt.Errorf("codex SDK refinement returned invalid runner output for %s: %w", input.Title, err)
	}
	if strings.TrimSpace(finalResponse) == "" {
		return RefineOutput{}, fmt.Errorf("codex SDK refinement returned empty content for %s", input.Title)
	}
	return RefineOutput{Content: strings.TrimSpace(finalResponse), Model: model}, nil
}

func parseCodexSDKRunnerResponse(output string) (string, error) {
	text := strings.TrimSpace(output)
	if text == "" {
		return "", fmt.Errorf("empty SDK runner output")
	}
	var response codexSDKCurationResponse
	if err := json.Unmarshal([]byte(text), &response); err == nil {
		if strings.TrimSpace(response.Error) != "" {
			return "", errors.New(response.Error)
		}
		if strings.TrimSpace(response.FinalResponse) != "" {
			return response.FinalResponse, nil
		}
	}
	return text, nil
}

func resolveCurationImagePaths(artifactRoot string, imagePaths []string) ([]string, error) {
	root := firstNonEmpty(artifactRoot, ArtifactRootFromEnv())
	resolved := []string{}
	for _, raw := range imagePaths {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if !filepath.IsAbs(value) {
			value = filepath.Join(root, filepath.FromSlash(value))
		}
		clean := filepath.Clean(value)
		if _, err := os.Stat(clean); err != nil {
			return nil, fmt.Errorf("curation image %s: %w", raw, err)
		}
		resolved = append(resolved, clean)
	}
	return resolved, nil
}

func codexSDKWorkingDirectory(command string, stateRoot string) string {
	if strings.Contains(command, "docker run") && strings.Contains(command, "sdk-runner") {
		return "/home/codex/.codex"
	}
	return stateRoot
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
