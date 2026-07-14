-- Adds support for multiple game content modes (Words, Pictures, and future
-- modes) plus themed decks within a mode. Fully additive and backward
-- compatible: existing rows default to mode='words', theme='classic', and
-- image_key=NULL, so the current Words-mode behavior is unchanged.

CREATE TYPE game_mode AS ENUM ('words', 'pictures');

ALTER TABLE games ADD COLUMN mode  game_mode NOT NULL DEFAULT 'words';
ALTER TABLE games ADD COLUMN theme text      NOT NULL DEFAULT 'classic';

-- Image asset key within the game's theme folder (e.g. 'dog' -> resolved
-- client-side to /decks/pictures/<theme>/dog.svg). NULL for Words-mode cards.
ALTER TABLE cards ADD COLUMN image_key text;

-- Extend create_game to accept mode/theme/image keys, all with defaults so
-- any caller still using the old 2-arg signature keeps working unmodified.
DROP FUNCTION IF EXISTS public.create_game(text[], text[]);

CREATE FUNCTION public.create_game(
  p_words      text[],
  p_types      text[],
  p_image_keys text[] DEFAULT NULL,
  p_mode       text   DEFAULT 'words',
  p_theme      text   DEFAULT 'classic'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_code  varchar(6);
  v_id    uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i       int;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * 32))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM games WHERE code = v_code);
  END LOOP;

  INSERT INTO games (id, code, status, spymaster_token, mode, theme)
  VALUES (v_id, v_code, 'active', v_token, p_mode::game_mode, p_theme);

  FOR i IN 1..25 LOOP
    INSERT INTO cards (game_id, word, type, position, image_key)
    VALUES (
      v_id, p_words[i], p_types[i]::card_type, i - 1,
      CASE WHEN p_image_keys IS NULL THEN NULL ELSE p_image_keys[i] END
    );
  END LOOP;

  RETURN json_build_object('code', v_code, 'spymaster_token', v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text[], text[], text[], text, text) TO anon, authenticated;
