-- Enable Realtime for clues so new clue submissions propagate live to all players.
ALTER PUBLICATION supabase_realtime ADD TABLE clues;
