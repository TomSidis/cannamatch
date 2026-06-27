-- C4: Community feed — helped-me interactions + threaded comments.
--
-- review_interactions: one row per (user, review) pair.
--   UNIQUE enforces one "helped me" per user per report.
--   ON DELETE CASCADE: removing a user or review cleans up interactions.
--
-- review_comments: single-level threading.
--   parent_id NULL  → root comment.
--   parent_id UUID  → reply to a root comment (enforced at app layer:
--                      parent's own parent_id must be NULL).
--   user_id stored for ownership guard + future analytics.
--   body stored as sanitized text (XSS-cleaned at write time in app layer).
--   ON DELETE CASCADE: removing review removes all its comments.

CREATE TABLE IF NOT EXISTS review_interactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  review_id  UUID        NOT NULL REFERENCES user_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, review_id)
);

CREATE INDEX IF NOT EXISTS idx_interactions_review
  ON review_interactions (review_id);

CREATE TABLE IF NOT EXISTS review_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  UUID        NOT NULL REFERENCES user_reviews(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  parent_id  UUID        NULL     REFERENCES review_comments(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_review
  ON review_comments (review_id, created_at);
