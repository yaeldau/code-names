-- Add version column to games for realtime deduplication in GameBoard.
-- The client uses version to drop duplicate/out-of-order Realtime events.
ALTER TABLE games ADD COLUMN version int NOT NULL DEFAULT 0;

-- Auto-increment version on every UPDATE so clients can detect new events.
CREATE OR REPLACE FUNCTION increment_game_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_version_trigger
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION increment_game_version();
