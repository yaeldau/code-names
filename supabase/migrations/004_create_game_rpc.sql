-- Single-call game creation: generates unique code, inserts game + 25 cards atomically.
-- Replaces the 3-7 sequential round trips in the server action with one RPC call.
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
  -- Spin until we land on a code not already in use (astronomically rare to loop).
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

  RETURN json_build_object('code', v_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text[], text[]) TO anon, authenticated;
