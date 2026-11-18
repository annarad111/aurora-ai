-- Aurora schema. Five tables, daily granularity per segment and channel.
-- Individual reservations are not stored: they add volume and SQL complexity
-- without helping to answer "why is revenue below target?".

CREATE TABLE hotels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  room_count  INTEGER NOT NULL CHECK (room_count > 0),
  currency    TEXT NOT NULL CHECK (currency = 'EUR'),
  timezone    TEXT NOT NULL
);

-- Commission each distribution channel charges, as a fraction of room revenue.
CREATE TABLE channels (
  code             TEXT PRIMARY KEY CHECK (code IN ('direct', 'ota', 'gds', 'wholesale')),
  name             TEXT NOT NULL,
  commission_rate  REAL NOT NULL CHECK (commission_rate BETWEEN 0 AND 1)
);

-- Actuals: one row per hotel, night, segment and channel. Source of every KPI.
CREATE TABLE daily_stats (
  hotel_id       TEXT NOT NULL REFERENCES hotels (id),
  date           TEXT NOT NULL,
  segment        TEXT NOT NULL CHECK (segment IN ('corporate', 'leisure', 'group', 'mice')),
  channel        TEXT NOT NULL REFERENCES channels (code),
  rooms_sold     INTEGER NOT NULL CHECK (rooms_sold >= 0),
  room_revenue   REAL NOT NULL CHECK (room_revenue >= 0),
  cancellations  INTEGER NOT NULL CHECK (cancellations >= 0),
  PRIMARY KEY (hotel_id, date, segment, channel)
);

-- Budget: one row per hotel, night and segment. The basis of "below target".
CREATE TABLE targets (
  hotel_id             TEXT NOT NULL REFERENCES hotels (id),
  date                 TEXT NOT NULL,
  segment              TEXT NOT NULL CHECK (segment IN ('corporate', 'leisure', 'group', 'mice')),
  rooms_target         INTEGER NOT NULL CHECK (rooms_target >= 0),
  room_revenue_target  REAL NOT NULL CHECK (room_revenue_target >= 0),
  PRIMARY KEY (hotel_id, date, segment)
);

-- Rooms already booked for a future night, as seen on a snapshot date. Used for pace and pickup.
CREATE TABLE on_the_books (
  hotel_id       TEXT NOT NULL REFERENCES hotels (id),
  snapshot_date  TEXT NOT NULL,
  stay_date      TEXT NOT NULL,
  rooms_otb      INTEGER NOT NULL CHECK (rooms_otb >= 0),
  revenue_otb    REAL NOT NULL CHECK (revenue_otb >= 0),
  PRIMARY KEY (hotel_id, snapshot_date, stay_date)
);
