-- Saved conversations replace the "Recent questions" log and the seeded starter
-- questions: Recent now lists real conversations, and the starter questions are
-- written from the data when the workspace opens.

DROP TABLE IF EXISTS suggested_questions;
DROP TABLE IF EXISTS asked_questions;

-- One chat. The browser makes the id when a new chat starts.
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  hotel_id    TEXT NOT NULL REFERENCES hotels (id),
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX conversations_by_hotel_and_update ON conversations (hotel_id, updated_at);

-- Every finished answer, with the exact events that were streamed, so an old
-- conversation opens as it was, without asking the tools or the model again.
CREATE TABLE conversation_turns (
  conversation_id  TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  question         TEXT NOT NULL,
  events_json      TEXT NOT NULL,
  -- 1 when the answer is about the data (not a greeting), so it can give the conversation its title.
  is_analysis      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (conversation_id, position)
);
