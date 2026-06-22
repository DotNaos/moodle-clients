package courseimages

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/DotNaos/moodle-services/internal/moodle"
	"github.com/DotNaos/moodle-services/internal/store"
)

const MaxBytes = 8 * 1024 * 1024

type Downloader interface {
	DownloadFileToBuffer(string) (moodle.DownloadResult, error)
}

func LocalizePaths(courses []moodle.Course) []moodle.Course {
	imported := make([]moodle.Course, len(courses))
	copy(imported, courses)
	for index := range imported {
		source := strings.TrimSpace(imported[index].HeroImage)
		if source == "" {
			continue
		}
		if strings.HasPrefix(source, "/api/course-images/") {
			continue
		}
		courseID := strconv.Itoa(imported[index].ID)
		imported[index].HeroImage = APIPath(courseID, SourceHash(source))
	}
	return imported
}

func SourceForCourse(courses []moodle.Course, courseID string) (string, string, error) {
	for _, course := range courses {
		if strconv.Itoa(course.ID) != courseID {
			continue
		}
		source := strings.TrimSpace(course.HeroImage)
		if source == "" {
			return "", "", store.ErrNotFound
		}
		return source, SourceHash(source), nil
	}
	return "", "", store.ErrNotFound
}

func Read(ctx context.Context, downloader Downloader, source string) ([]byte, string, error) {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(source)), "data:") {
		return DecodeDataURL(source)
	}
	if downloader == nil {
		return nil, "", fmt.Errorf("moodle client does not support course image downloads")
	}
	download, err := downloader.DownloadFileToBuffer(source)
	if err != nil {
		return nil, "", err
	}
	select {
	case <-ctx.Done():
		return nil, "", ctx.Err()
	default:
	}
	contentType := NormalizeContentType(download.ContentType, download.Data)
	if contentType == "" {
		return nil, "", fmt.Errorf("course image did not download as an image")
	}
	return download.Data, contentType, nil
}

func DecodeDataURL(source string) ([]byte, string, error) {
	trimmed := strings.TrimSpace(source)
	if !strings.HasPrefix(strings.ToLower(trimmed), "data:") {
		return nil, "", fmt.Errorf("invalid data URL")
	}
	payload := trimmed[len("data:"):]
	comma := strings.Index(payload, ",")
	if comma < 0 {
		return nil, "", fmt.Errorf("invalid data URL")
	}
	metadata := payload[:comma]
	rawData := payload[comma+1:]
	parts := strings.Split(metadata, ";")
	contentType := "text/plain"
	if parts[0] != "" {
		contentType = strings.ToLower(strings.TrimSpace(parts[0]))
	}
	isBase64 := false
	for _, part := range parts[1:] {
		if strings.EqualFold(strings.TrimSpace(part), "base64") {
			isBase64 = true
			break
		}
	}
	var data []byte
	var err error
	if isBase64 {
		data, err = base64.StdEncoding.DecodeString(rawData)
	} else {
		rawData, err = url.PathUnescape(rawData)
		data = []byte(rawData)
	}
	if err != nil {
		return nil, "", err
	}
	contentType = NormalizeContentType(contentType, data)
	if contentType == "" {
		return nil, "", fmt.Errorf("data URL is not an image")
	}
	return data, contentType, nil
}

func NormalizeContentType(contentType string, data []byte) string {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(contentType))
	if err == nil && strings.HasPrefix(strings.ToLower(mediaType), "image/") {
		return strings.ToLower(mediaType)
	}
	detected := http.DetectContentType(data)
	mediaType, _, err = mime.ParseMediaType(detected)
	if err == nil && strings.HasPrefix(strings.ToLower(mediaType), "image/") {
		return strings.ToLower(mediaType)
	}
	return ""
}

func SourceHash(source string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(source)))
	return hex.EncodeToString(sum[:])
}

func APIPath(courseID string, sourceHash string) string {
	version := sourceHash
	if len(version) > 16 {
		version = version[:16]
	}
	return "/api/course-images/" + url.PathEscape(courseID) + "?v=" + url.QueryEscape(version)
}
