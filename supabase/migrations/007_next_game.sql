-- Allow any game to point at its sequel so all connected clients can follow.
ALTER TABLE games
  ADD COLUMN next_game_code             varchar(6),
  ADD COLUMN next_game_spymaster_token  uuid;

-- Extend create_game RPC to also return the spymaster_token so the caller
-- can write it into next_game_spymaster_token without a second round trip.
CREATE OR REPLACE FUNCTION public.create_game(p_words text[], p_types text[])
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

  INSERT INTO games (id, code, status, spymaster_token)
  VALUES (v_id, v_code, 'active', v_token);

  FOR i IN 1..25 LOOP
    INSERT INTO cards (game_id, word, type, position)
    VALUES (v_id, p_words[i], p_types[i]::card_type, i - 1);
  END LOOP;

  RETURN json_build_object('code', v_code, 'spymaster_token', v_token);
END;
$$;
