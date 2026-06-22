create table if not exists course_image_assets (
  user_id uuid not null references users(id) on delete cascade,
  course_id text not null,
  source_hash text not null,
  content_type text not null,
  data bytea not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists course_image_assets_updated_at_idx on course_image_assets (updated_at);
