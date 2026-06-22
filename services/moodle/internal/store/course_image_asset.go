package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type CourseImageAsset struct {
	UserID      string
	CourseID    string
	SourceHash  string
	ContentType string
	Data        []byte
	UpdatedAt   time.Time
}

type UpsertCourseImageAssetInput struct {
	UserID      string
	CourseID    string
	SourceHash  string
	ContentType string
	Data        []byte
}

func (s *Store) CourseImageAsset(ctx context.Context, userID string, courseID string) (CourseImageAsset, error) {
	if strings.TrimSpace(userID) == "" {
		return CourseImageAsset{}, fmt.Errorf("user id is required")
	}
	if strings.TrimSpace(courseID) == "" {
		return CourseImageAsset{}, fmt.Errorf("course id is required")
	}
	if err := s.ensureCourseImageAssets(ctx); err != nil {
		return CourseImageAsset{}, err
	}
	var asset CourseImageAsset
	err := s.db.QueryRowContext(ctx, `
		select user_id::text, course_id, source_hash, content_type, data, updated_at
		from course_image_assets
		where user_id = $1 and course_id = $2
	`, userID, courseID).Scan(
		&asset.UserID,
		&asset.CourseID,
		&asset.SourceHash,
		&asset.ContentType,
		&asset.Data,
		&asset.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CourseImageAsset{}, ErrNotFound
	}
	return asset, err
}

func (s *Store) UpsertCourseImageAsset(ctx context.Context, input UpsertCourseImageAssetInput) error {
	if strings.TrimSpace(input.UserID) == "" {
		return fmt.Errorf("user id is required")
	}
	if strings.TrimSpace(input.CourseID) == "" {
		return fmt.Errorf("course id is required")
	}
	if strings.TrimSpace(input.SourceHash) == "" {
		return fmt.Errorf("source hash is required")
	}
	if strings.TrimSpace(input.ContentType) == "" {
		return fmt.Errorf("content type is required")
	}
	if len(input.Data) == 0 {
		return fmt.Errorf("image data is required")
	}
	if err := s.ensureCourseImageAssets(ctx); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		insert into course_image_assets (user_id, course_id, source_hash, content_type, data, updated_at)
		values ($1, $2, $3, $4, $5, now())
		on conflict (user_id, course_id)
		do update set
		  source_hash = excluded.source_hash,
		  content_type = excluded.content_type,
		  data = excluded.data,
		  updated_at = now()
	`, input.UserID, input.CourseID, input.SourceHash, input.ContentType, input.Data)
	return err
}

func (s *Store) ensureCourseImageAssets(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		create table if not exists course_image_assets (
		  user_id uuid not null references users(id) on delete cascade,
		  course_id text not null,
		  source_hash text not null,
		  content_type text not null,
		  data bytea not null,
		  updated_at timestamptz not null default now(),
		  primary key (user_id, course_id)
		)
	`)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		create index if not exists course_image_assets_updated_at_idx
		on course_image_assets (updated_at)
	`)
	return err
}
