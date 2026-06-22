package handler

import (
	"strings"
	"testing"

	"github.com/DotNaos/moodle-services/internal/courseimages"
	"github.com/DotNaos/moodle-services/internal/moodle"
)

func TestLocalizeCourseImagePathsUsesServiceAssetURL(t *testing.T) {
	courses := courseimages.LocalizePaths([]moodle.Course{
		{
			ID:        22577,
			Fullname:  "Data Science und Informatik bei Banken",
			HeroImage: "data:image/svg+xml;base64,PHN2Zy8+",
		},
	})

	if len(courses) != 1 {
		t.Fatalf("expected one course, got %#v", courses)
	}
	if !strings.HasPrefix(courses[0].HeroImage, "/api/course-images/22577?v=") {
		t.Fatalf("expected service course image URL, got %q", courses[0].HeroImage)
	}
}

func TestLocalizeCourseImagePathsKeepsExistingServiceAssetURL(t *testing.T) {
	courses := courseimages.LocalizePaths([]moodle.Course{
		{
			ID:        22577,
			Fullname:  "Data Science und Informatik bei Banken",
			HeroImage: "/api/course-images/22577?v=abc123",
		},
	})

	if courses[0].HeroImage != "/api/course-images/22577?v=abc123" {
		t.Fatalf("expected existing service image URL to stay stable, got %q", courses[0].HeroImage)
	}
}

func TestDecodeCourseImageDataURLKeepsSVG(t *testing.T) {
	data, contentType, err := courseimages.DecodeDataURL("data:image/svg+xml;base64,PHN2Zy8+")
	if err != nil {
		t.Fatalf("decodeCourseImageDataURL: %v", err)
	}
	if contentType != "image/svg+xml" {
		t.Fatalf("expected SVG content type, got %q", contentType)
	}
	if string(data) != "<svg/>" {
		t.Fatalf("expected SVG bytes, got %q", string(data))
	}
}
