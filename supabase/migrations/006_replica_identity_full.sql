-- Supabase Realtime requires REPLICA IDENTITY FULL on tables that use RLS,
-- so that row-level security can be applied correctly to change events.
-- Without this, subscribers receive no events (silent failure).
ALTER TABLE games  REPLICA IDENTITY FULL;
ALTER TABLE cards  REPLICA IDENTITY FULL;
ALTER TABLE clues  REPLICA IDENTITY FULL;
