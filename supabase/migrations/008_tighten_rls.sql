-- Tighten RLS: prevent writes to finished games and cross-game mutations.
-- Without auth we can't tie a session to a specific game, but we can at least
-- block obvious invalid states at the DB level.

-- Games: block any update once a game is finished (status is immutable after 'finished')
DROP POLICY IF EXISTS "public update games" ON games;
CREATE POLICY "public update games" ON games
  FOR UPDATE USING (status != 'finished');

-- Cards: block reveals on finished games
DROP POLICY IF EXISTS "public update cards" ON cards;
CREATE POLICY "public update cards" ON cards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM games g
      WHERE g.id = cards.game_id AND g.status != 'finished'
    )
  );

-- Clues: block inserts into finished games
DROP POLICY IF EXISTS "public insert clues" ON clues;
CREATE POLICY "public insert clues" ON clues
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM games g
      WHERE g.id = clues.game_id AND g.status = 'active'
    )
  );
