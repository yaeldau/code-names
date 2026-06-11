-- Enum types
CREATE TYPE card_type AS ENUM ('red', 'blue', 'neutral', 'assassin');
CREATE TYPE team AS ENUM ('red', 'blue');
CREATE TYPE game_status AS ENUM ('waiting', 'active', 'finished');

-- Games
CREATE TABLE games (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 varchar(6)   NOT NULL UNIQUE,
  status               game_status  NOT NULL DEFAULT 'waiting',
  current_team         team         NOT NULL DEFAULT 'red',
  red_remaining        int          NOT NULL DEFAULT 9,
  blue_remaining       int          NOT NULL DEFAULT 8,
  winner               team,
  spymaster_token      uuid         NOT NULL DEFAULT gen_random_uuid(),
  created_at           timestamptz  NOT NULL DEFAULT now()
);

-- Cards (25 per game, positions 0–24)
CREATE TABLE cards (
  id       uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id  uuid      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  word     varchar(50) NOT NULL,
  type     card_type NOT NULL,
  position int       NOT NULL CHECK (position >= 0 AND position < 25),
  revealed boolean   NOT NULL DEFAULT false,
  UNIQUE (game_id, position)
);

-- Clues submitted by spymasters
CREATE TABLE clues (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team       team        NOT NULL,
  word       varchar(100) NOT NULL,
  count      int         NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_games_code    ON games(code);
CREATE INDEX idx_cards_game_id ON cards(game_id);
CREATE INDEX idx_clues_game_id ON clues(game_id);

-- Row Level Security (all tables are public — no auth in this app)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE clues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read games"  ON games FOR SELECT USING (true);
CREATE POLICY "public insert games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "public update games" ON games FOR UPDATE USING (true);

CREATE POLICY "public read cards"  ON cards FOR SELECT USING (true);
CREATE POLICY "public insert cards" ON cards FOR INSERT WITH CHECK (true);
CREATE POLICY "public update cards" ON cards FOR UPDATE USING (true);

CREATE POLICY "public read clues"  ON clues FOR SELECT USING (true);
CREATE POLICY "public insert clues" ON clues FOR INSERT WITH CHECK (true);

-- Enable Realtime for live card reveals and game state changes
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
