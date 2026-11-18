-- Step 12: data the UI and the narrative used to have hard-coded.

-- Named group blocks (congresses, tour groups). The narrative can now say
-- "the cancelled EU Health Congress" instead of guessing from cancellations.
CREATE TABLE group_blocks (
  id               TEXT PRIMARY KEY,
  hotel_id         TEXT NOT NULL REFERENCES hotels (id),
  name             TEXT NOT NULL,
  segment          TEXT NOT NULL CHECK (segment IN ('corporate', 'leisure', 'group', 'mice')),
  first_night      TEXT NOT NULL,
  last_night       TEXT NOT NULL,
  rooms_per_night  INTEGER NOT NULL CHECK (rooms_per_night > 0),
  status           TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  cancelled_on     TEXT,
  CHECK (first_night <= last_night),
  CHECK ((status = 'cancelled') = (cancelled_on IS NOT NULL))
);

-- The starter questions on the idle screen, per hotel.
CREATE TABLE suggested_questions (
  hotel_id  TEXT NOT NULL REFERENCES hotels (id),
  position  INTEGER NOT NULL,
  topic     TEXT NOT NULL,
  question  TEXT NOT NULL,
  PRIMARY KEY (hotel_id, position)
);

-- Every question asked in the chat, for the "Recent" list in the sidebar.
CREATE TABLE asked_questions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id  TEXT NOT NULL REFERENCES hotels (id),
  question  TEXT NOT NULL,
  asked_at  TEXT NOT NULL
);

CREATE INDEX asked_questions_by_hotel_and_time ON asked_questions (hotel_id, asked_at);
