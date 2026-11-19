-- The property behind the numbers: its profile, its rooms, and the nights a
-- room cannot be sold (maintenance). Seeded with fictional demo data in 0009.

CREATE TABLE property_profiles (
  hotel_id         TEXT PRIMARY KEY REFERENCES hotels (id),
  country          TEXT NOT NULL,
  address_line     TEXT NOT NULL,
  property_type    TEXT NOT NULL,
  -- [{ "code", "name", "count" }]: the room types and how many rooms each has.
  room_types_json  TEXT NOT NULL,
  -- 1 when the details are made up for the demo.
  is_demo_data     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE rooms (
  hotel_id        TEXT NOT NULL REFERENCES hotels (id),
  room_number     TEXT NOT NULL,
  floor           INTEGER NOT NULL,
  room_type_code  TEXT NOT NULL,
  PRIMARY KEY (hotel_id, room_number)
);

-- Out of order: broken, out of inventory. Out of service: briefly held back.
-- The room cannot be sold from first_night to last_night, both included.
CREATE TABLE room_status_events (
  id           TEXT PRIMARY KEY,
  hotel_id     TEXT NOT NULL,
  room_number  TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('out_of_order', 'out_of_service')),
  reason       TEXT NOT NULL,
  description  TEXT NOT NULL,
  first_night  TEXT NOT NULL,
  last_night   TEXT NOT NULL,
  FOREIGN KEY (hotel_id, room_number) REFERENCES rooms (hotel_id, room_number)
);

CREATE INDEX room_status_events_by_hotel ON room_status_events (hotel_id, first_night, last_night);
