-- reveal_card: atomically reveal a card and update all game state in one transaction.
-- Called directly from the browser (no Vercel hop), matching the TypeScript logic exactly.
CREATE OR REPLACE FUNCTION public.reveal_card(p_card_id uuid, p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_card           cards%ROWTYPE;
  v_game           games%ROWTYPE;
  v_opponent       team;
  v_red_remaining  int;
  v_blue_remaining int;
BEGIN
  SELECT * INTO v_card FROM cards WHERE id = p_card_id FOR UPDATE;
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;

  IF v_card.revealed OR v_game.status <> 'active' THEN RETURN; END IF;

  UPDATE cards SET revealed = true WHERE id = p_card_id;

  v_opponent       := CASE WHEN v_game.current_team = 'red' THEN 'blue'::team ELSE 'red'::team END;
  v_red_remaining  := v_game.red_remaining;
  v_blue_remaining := v_game.blue_remaining;

  IF v_card.type = 'assassin' THEN
    UPDATE games SET status = 'finished', winner = v_opponent WHERE id = p_game_id;
    RETURN;
  END IF;

  IF v_card.type = 'red'  THEN v_red_remaining  := v_red_remaining  - 1; END IF;
  IF v_card.type = 'blue' THEN v_blue_remaining := v_blue_remaining - 1; END IF;

  IF v_red_remaining = 0 THEN
    UPDATE games SET red_remaining = v_red_remaining, status = 'finished', winner = 'red'  WHERE id = p_game_id;
  ELSIF v_blue_remaining = 0 THEN
    UPDATE games SET blue_remaining = v_blue_remaining, status = 'finished', winner = 'blue' WHERE id = p_game_id;
  ELSIF v_card.type::text <> v_game.current_team::text THEN
    -- Neutral or opponent card: decrement and switch turn
    UPDATE games SET red_remaining = v_red_remaining, blue_remaining = v_blue_remaining, current_team = v_opponent WHERE id = p_game_id;
  ELSE
    -- Own card: decrement, keep turn
    UPDATE games SET red_remaining = v_red_remaining, blue_remaining = v_blue_remaining WHERE id = p_game_id;
  END IF;
END;
$$;

-- end_turn: flip current team in one statement
CREATE OR REPLACE FUNCTION public.end_turn(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE games
  SET current_team = CASE WHEN current_team = 'red' THEN 'blue'::team ELSE 'red'::team END
  WHERE id = p_game_id AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_card(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_turn(uuid)          TO anon, authenticated;
