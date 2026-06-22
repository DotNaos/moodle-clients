package moodleservice

import (
	"testing"

	"github.com/DotNaos/moodle-services/internal/moodle"
)

type cacheTestClient struct {
	resources     []moodle.Resource
	downloadCount int
}

func (c *cacheTestClient) ValidateSession() error { return nil }

func (c *cacheTestClient) FetchCourses() ([]moodle.Course, error) { return nil, nil }

func (c *cacheTestClient) FetchCourseResources(courseID string) ([]moodle.Resource, string, error) {
	return c.resources, "", nil
}

func (c *cacheTestClient) DownloadFileToBuffer(url string) (moodle.DownloadResult, error) {
	c.downloadCount += 1
	return moodle.DownloadResult{Data: []byte("cached lecture text"), ContentType: "text/plain"}, nil
}

func TestMaterialTextUsesServerResourceCache(t *testing.T) {
	client := &cacheTestClient{resources: []moodle.Resource{{
		ID:       "res-1",
		Name:     "Lecture Notes",
		URL:      "https://moodle.example.test/pluginfile.php/1/lecture.txt",
		FileType: "txt",
	}}}
	service := Service{Client: client, ResourceCacheRoot: t.TempDir()}

	first, err := service.MaterialText("course-1", "res-1")
	if err != nil {
		t.Fatalf("first MaterialText: %v", err)
	}
	second, err := service.MaterialText("course-1", "res-1")
	if err != nil {
		t.Fatalf("second MaterialText: %v", err)
	}

	if first.Text != "cached lecture text" || second.Text != "cached lecture text" {
		t.Fatalf("unexpected text: first=%q second=%q", first.Text, second.Text)
	}
	if client.downloadCount != 1 {
		t.Fatalf("downloadCount = %d, want 1", client.downloadCount)
	}
	if first.Metadata["cacheStatus"] != "miss" {
		t.Fatalf("first cacheStatus = %q, want miss", first.Metadata["cacheStatus"])
	}
	if second.Metadata["cacheStatus"] != "hit" {
		t.Fatalf("second cacheStatus = %q, want hit", second.Metadata["cacheStatus"])
	}
	if second.Metadata["textCached"] != "true" {
		t.Fatalf("second textCached = %q, want true", second.Metadata["textCached"])
	}
}

func TestPDFFileUsesServerResourceCache(t *testing.T) {
	client := &cacheTestClient{resources: []moodle.Resource{{
		ID:       "pdf-1",
		Name:     "Slides",
		URL:      "https://moodle.example.test/pluginfile.php/1/slides.pdf",
		FileType: "pdf",
	}}}
	service := Service{Client: client, ResourceCacheRoot: t.TempDir()}

	first, err := service.PDFFile("course-1", "pdf-1")
	if err != nil {
		t.Fatalf("first PDFFile: %v", err)
	}
	second, err := service.PDFFile("course-1", "pdf-1")
	if err != nil {
		t.Fatalf("second PDFFile: %v", err)
	}

	if string(first.Data) != "cached lecture text" || string(second.Data) != "cached lecture text" {
		t.Fatalf("unexpected PDF bytes")
	}
	if client.downloadCount != 1 {
		t.Fatalf("downloadCount = %d, want 1", client.downloadCount)
	}
	if second.ContentType != "text/plain" {
		t.Fatalf("contentType = %q, want cached content type", second.ContentType)
	}
}
