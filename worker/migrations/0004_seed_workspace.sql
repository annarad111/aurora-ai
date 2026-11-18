-- GENERATED FILE, do not edit by hand.
-- Source: packages/demo-data (group blocks and starter questions), via worker/scripts/generate-seed-sql.ts

INSERT INTO group_blocks (id, hotel_id, name, segment, first_night, last_night, rooms_per_night, status, cancelled_on) VALUES
  ('eu-health-congress-2026', 'sablon-bru', 'EU Health Congress', 'mice', '2026-11-10', '2026-11-12', 68, 'cancelled', '2026-10-28'),
  ('eu-health-congress-2025', 'sablon-bru', 'EU Health Congress', 'mice', '2025-11-10', '2025-11-12', 50, 'confirmed', NULL);

INSERT INTO suggested_questions (hotel_id, position, topic, question) VALUES
  ('sablon-bru', 1, 'Revenue', 'Why is my hotel revenue below target this month?'),
  ('sablon-bru', 2, 'Channels', 'What are OTA commissions costing us this month?'),
  ('sablon-bru', 3, 'Pace', 'Are we on pace for the last 10 days of November?'),
  ('sablon-bru', 4, 'Segments', 'Which segment moved most vs last year?');
