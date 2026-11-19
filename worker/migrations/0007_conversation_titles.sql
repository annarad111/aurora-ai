-- A title the user wrote is kept: later answers no longer replace it with
-- the first question about the data.
ALTER TABLE conversations ADD COLUMN title_is_custom INTEGER NOT NULL DEFAULT 0;
