package moodleservice

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/DotNaos/moodle-services/internal/moodle"
)

const (
	EnvResourceCacheRoot     = "MOODLE_RESOURCE_CACHE_ROOT"
	envStudyArtifactRoot     = "MOODLE_STUDY_ARTIFACT_ROOT"
	defaultStudyArtifactRoot = "/srv/moodle-study"
)

var unsafeCacheSegmentRe = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

type cachedMaterialDownload struct {
	moodle.DownloadResult
	CachePath string
	TextPath  string
	CacheHit  bool
	CacheUsed bool
}

type materialCacheMetadata struct {
	CourseID    string `json:"courseId"`
	ResourceID  string `json:"resourceId"`
	Name        string `json:"name,omitempty"`
	FileType    string `json:"fileType,omitempty"`
	SectionName string `json:"sectionName,omitempty"`
	SourceURL   string `json:"sourceUrl"`
	SourceHash  string `json:"sourceHash"`
	ContentType string `json:"contentType"`
	CachedAt    string `json:"cachedAt"`
}

func (download cachedMaterialDownload) CacheStatus() string {
	if !download.CacheUsed {
		return "disabled"
	}
	if download.CacheHit {
		return "hit"
	}
	return "miss"
}

func (s Service) downloadMaterialResource(courseID string, resource moodle.Resource) (cachedMaterialDownload, error) {
	root := resourceCacheRoot(s.ResourceCacheRoot)
	if root == "" {
		download, err := s.Client.DownloadFileToBuffer(resource.URL)
		return cachedMaterialDownload{DownloadResult: download}, err
	}

	cacheDir := filepath.Join(root, "courses", safeCacheSegment(courseID), safeCacheSegment(resource.ID))
	dataPath := filepath.Join(cacheDir, "source.bin")
	textPath := filepath.Join(cacheDir, "text.txt")
	metaPath := filepath.Join(cacheDir, "metadata.json")

	if cached, ok := readCachedMaterial(dataPath, textPath, metaPath, resource.URL); ok {
		return cached, nil
	}

	download, err := s.Client.DownloadFileToBuffer(resource.URL)
	if err != nil {
		return cachedMaterialDownload{}, err
	}

	cached := cachedMaterialDownload{
		DownloadResult: download,
		CachePath:      dataPath,
		TextPath:       textPath,
		CacheUsed:      true,
	}
	if err := writeCachedMaterial(cacheDir, dataPath, metaPath, courseID, resource, download); err == nil {
		_ = os.Remove(textPath)
	}
	return cached, nil
}

func (s Service) materialTextFromDownload(resource moodle.Resource, download cachedMaterialDownload) (string, bool, error) {
	if download.CacheHit && download.TextPath != "" {
		if data, err := os.ReadFile(download.TextPath); err == nil {
			return strings.TrimSpace(string(data)), true, nil
		}
	}

	text := string(download.Data)
	if strings.EqualFold(resource.FileType, "pdf") || strings.Contains(strings.ToLower(download.ContentType), "pdf") {
		extracted, err := moodle.ExtractPDFText(download.Data)
		if err != nil {
			return "", false, err
		}
		text = extracted
	}
	text = strings.TrimSpace(text)
	if download.TextPath != "" && text != "" {
		_ = writeFileAtomic(download.TextPath, []byte(text), 0o600)
	}
	return text, false, nil
}

func readCachedMaterial(dataPath string, textPath string, metaPath string, sourceURL string) (cachedMaterialDownload, bool) {
	metaData, err := os.ReadFile(metaPath)
	if err != nil {
		return cachedMaterialDownload{}, false
	}
	var meta materialCacheMetadata
	if err := json.Unmarshal(metaData, &meta); err != nil {
		return cachedMaterialDownload{}, false
	}
	if meta.SourceHash != sourceHash(sourceURL) {
		return cachedMaterialDownload{}, false
	}
	data, err := os.ReadFile(dataPath)
	if err != nil {
		return cachedMaterialDownload{}, false
	}
	contentType := strings.TrimSpace(meta.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return cachedMaterialDownload{
		DownloadResult: moodle.DownloadResult{Data: data, ContentType: contentType},
		CachePath:      dataPath,
		TextPath:       textPath,
		CacheHit:       true,
		CacheUsed:      true,
	}, true
}

func writeCachedMaterial(cacheDir string, dataPath string, metaPath string, courseID string, resource moodle.Resource, download moodle.DownloadResult) error {
	if err := os.MkdirAll(cacheDir, 0o700); err != nil {
		return err
	}
	if err := writeFileAtomic(dataPath, download.Data, 0o600); err != nil {
		return err
	}
	meta := materialCacheMetadata{
		CourseID:    courseID,
		ResourceID:  resource.ID,
		Name:        resource.Name,
		FileType:    resource.FileType,
		SectionName: resource.SectionName,
		SourceURL:   resource.URL,
		SourceHash:  sourceHash(resource.URL),
		ContentType: strings.TrimSpace(download.ContentType),
		CachedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(metaPath, append(data, '\n'), 0o600)
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func resourceCacheRoot(explicit string) string {
	if root := strings.TrimSpace(explicit); root != "" {
		return root
	}
	if root := strings.TrimSpace(os.Getenv(EnvResourceCacheRoot)); root != "" {
		return root
	}
	artifactRoot := strings.TrimSpace(os.Getenv(envStudyArtifactRoot))
	if artifactRoot == "" {
		artifactRoot = defaultStudyArtifactRoot
	}
	return filepath.Join(artifactRoot, "material-cache")
}

func sourceHash(sourceURL string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(sourceURL)))
	return hex.EncodeToString(sum[:])
}

func safeCacheSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "unknown"
	}
	return unsafeCacheSegmentRe.ReplaceAllString(value, "_")
}
