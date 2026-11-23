-- 012: Anonymous live presence + aggregate daily statistics (D1 + E1).
--
-- Numbering: 010 is the pictures-mode migration (applied in production, not on
-- main) and 011 is the paused A3 migration. This migration is independent of
-- both: it creates new objects only and touches no existing table, column,
-- grant, policy or function.
--
-- Privacy design — no persistent identifier, nothing stored on the device:
--   * A tab is identified only by a random id held in the page's JS memory. It
--     is never written to a cookie or any browser storage, so it disappears
--     with the page load (a reload is a new tab). There is NO visitor id, no
--     session id, and nothing that links two page loads, two days or two
--     devices — so unique people are not and cannot be counted.
--   * History is kept only as per-day aggregate counters (analytics_daily):
--     numbers, no identifiers.
--   * Abuse bounding uses a keyed, daily-rotating hash of the IP (computed in
--     the app with a server secret) as a rate-limit bucket in the existing
--     feedback_rate_limits table; those buckets are deleted after 1 hour.
--     Raw IPs are never stored.
--
-- Retention:
--   * analytics_presence (one row per open tab): deleted 1 hour after its last
--     heartbeat (the dashboard only ever looks at the last 2 minutes);
--   * presence rate-limit buckets: 1 hour;
--   * analytics_daily: aggregate counts only, kept (they hold no personal data).
-- Cleanup runs when a new tab appears (index range delete), so stale rows are
-- removed even at low traffic; concurrent new tabs skip it rather than wait.
--
-- Cost guard (soft): every heartbeat is counted in today's row; once the
-- configured daily budget (analytics_settings.daily_beat_cap) is reached — or
-- while the kill switch analytics_settings.paused is on — the heartbeat
-- answers 'paused', the route returns 429 and the browser stops sending for the
-- rest of that page load. This bounds well-behaved clients only: every request
-- that reaches the app is still a serverless invocation, whatever it returns.
-- The budget is checked with a plain read, and each heartbeat writes one of 8
-- per-day counter slots once, as its last statement, so heartbeats don't
-- serialize on a single row.
--
-- Trust model: browsers never talk to these tables. /api/presence validates the
-- request and calls analytics_heartbeat() with the service role; /admin reads
-- analytics_dashboard() with the service role. anon/authenticated get NO
-- privileges on the tables or functions, RLS is enabled with no policies, and a
-- self-check below aborts the migration if any access survives. All timestamps
-- are the database's now().

BEGIN;

-- One row per open browser tab (ephemeral).
CREATE TABLE IF NOT EXISTS public.analytics_presence (
  tab_id     uuid        PRIMARY KEY,
  page       text        NOT NULL CHECK (page IN ('home', 'game', 'how_to_play', 'other')),
  game_id    uuid        REFERENCES public.games(id) ON DELETE SET NULL,
  visible    boolean     NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  -- Set by a "leave" (tab closing). A leave is a tombstone, not a delete, so a
  -- regular beat that was already in flight can't resurrect the tab.
  left_at    timestamptz,
  CHECK (page = 'game' OR game_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_analytics_presence_last_seen ON public.analytics_presence (last_seen);
CREATE INDEX IF NOT EXISTS idx_analytics_presence_game ON public.analytics_presence (game_id, last_seen) WHERE game_id IS NOT NULL;

-- Aggregate counters per Israel calendar day. No identifiers. Each day is
-- split over 8 slots (a heartbeat adds to a random one; readers sum them), so
-- concurrent heartbeats don't queue on a single hot row — measured: with one
-- row, 100 simultaneous heartbeats serialized on its row lock.
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day          date     NOT NULL,
  slot         smallint NOT NULL DEFAULT 0 CHECK (slot BETWEEN 0 AND 7),
  visits       integer  NOT NULL DEFAULT 0,  -- tab sessions started (page loads that reported)
  room_entries integer  NOT NULL DEFAULT 0,  -- a tab entering a game room
  beats        integer  NOT NULL DEFAULT 0,  -- heartbeat requests (cost tracking)
  PRIMARY KEY (day, slot)
);

-- Single-row settings: daily budget and an emergency off switch, adjustable
-- with one UPDATE (no deploy, no migration).
CREATE TABLE IF NOT EXISTS public.analytics_settings (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- 8,000/day ≈ 240k/month at most — under a quarter of Vercel Hobby's 1M
  -- monthly invocations, so gameplay keeps the rest. Expected use is far lower.
  daily_beat_cap integer NOT NULL DEFAULT 8000 CHECK (daily_beat_cap >= 0),
  paused         boolean NOT NULL DEFAULT false
);
INSERT INTO public.analytics_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.analytics_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies.

-- Supabase projects may auto-grant new public tables to the API roles: undo it.
REVOKE ALL ON public.analytics_presence, public.analytics_daily, public.analytics_settings
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_presence, public.analytics_daily, public.analytics_settings
  TO service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_cleanup() RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.analytics_presence WHERE last_seen < now() - interval '1 hour';
  DELETE FROM public.feedback_rate_limits
    WHERE ip_hash LIKE 'presence-tab:%' AND window_start < now() - interval '1 hour';
$$;

-- ── Heartbeat ───────────────────────────────────────────────────────────────
-- Records that tab p_tab is on p_page (and game p_game_code).
-- p_ip_bucket: keyed hash of the client IP, used only for the new-tab rate limit.
-- p_leave = true tombstones the tab (best-effort "tab closed").
-- Returns 'ok' | 'throttled' | 'left' | 'rate_limited' | 'paused'.
CREATE OR REPLACE FUNCTION public.analytics_heartbeat(
  p_tab       uuid,
  p_page      text,
  p_game_code text,
  p_visible   boolean,
  p_ip_bucket text,
  p_leave     boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today    date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_beats    integer;
  v_cap      integer;
  v_paused   boolean;
  v_game     uuid;
  v_page     text := p_page;
  v_inserted boolean;
  v_found    boolean;
  v_row      public.analytics_presence%ROWTYPE;
  v_result   text;
  v_visit    integer := 0;
  v_entry    integer := 0;
BEGIN
  IF p_tab IS NULL THEN RAISE EXCEPTION 'analytics: missing id' USING ERRCODE = '22023'; END IF;
  IF p_page NOT IN ('home', 'game', 'how_to_play', 'other') THEN
    RAISE EXCEPTION 'analytics: bad page' USING ERRCODE = '22023';
  END IF;
  IF p_ip_bucket IS NULL OR p_ip_bucket !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'analytics: bad bucket' USING ERRCODE = '22023';
  END IF;
  IF p_page = 'game' AND NOT p_leave AND (p_game_code IS NULL OR p_game_code !~ '^[A-Z0-9]{4,8}$') THEN
    RAISE EXCEPTION 'analytics: bad game code' USING ERRCODE = '22023';
  END IF;

  -- Kill switch: answer without writing anything.
  SELECT daily_beat_cap, paused INTO v_cap, v_paused FROM public.analytics_settings WHERE id;
  IF v_paused IS DISTINCT FROM false THEN RETURN 'paused'; END IF;

  <<work>>
  BEGIN
    -- Budget check is a plain read (no row lock). Concurrent requests may
    -- overshoot the cap by a handful — acceptable for a soft budget, and it
    -- keeps the shared per-day row from serializing every heartbeat.
    SELECT sum(beats) INTO v_beats FROM public.analytics_daily WHERE day = v_today;
    IF COALESCE(v_beats, 0) >= v_cap THEN v_result := 'paused'; EXIT work; END IF;

    IF p_leave THEN
      -- Tombstone the tab — also when its first beat hasn't landed yet (closed
      -- within a second of opening), so that late beat is ignored too.
      INSERT INTO public.analytics_presence AS p (tab_id, page, game_id, visible, left_at)
      VALUES (p_tab, 'other', NULL, false, now())
      ON CONFLICT (tab_id) DO UPDATE SET left_at = now();
      v_result := 'left'; EXIT work;
    END IF;

    IF p_page = 'game' THEN
      SELECT id INTO v_game FROM public.games WHERE code = p_game_code;
      -- A game page for a code that doesn't exist is just "other".
      IF v_game IS NULL THEN v_page := 'other'; END IF;
    END IF;

    SELECT * INTO v_row FROM public.analytics_presence WHERE tab_id = p_tab;
    v_found := FOUND;
    IF v_found AND v_row.left_at IS NOT NULL AND v_row.left_at > now() - interval '5 seconds' THEN
      -- A beat that was already in flight when the tab closed: ignore it.
      v_result := 'left'; EXIT work;
    END IF;
    IF NOT v_found THEN
      -- Abuse bound for new tab ids, per (keyed, daily-rotating) IP bucket.
      IF NOT public.check_feedback_rate_limit('presence-tab:' || p_ip_bucket, 120, 600) THEN
        v_result := 'rate_limited'; EXIT work;
      END IF;
      -- Opportunistic retention, never waited on: if another heartbeat is
      -- already cleaning up, skip (non-blocking transaction-level try-lock).
      IF pg_try_advisory_xact_lock(hashtext('public.analytics_cleanup')) THEN
        PERFORM public.analytics_cleanup();
      END IF;
    ELSIF v_row.left_at IS NULL AND v_row.last_seen > now() - interval '5 seconds'
      AND v_row.page = v_page AND v_row.game_id IS NOT DISTINCT FROM v_game AND v_row.visible = p_visible THEN
      -- Nothing changed and it was just written: don't write again.
      v_result := 'throttled'; EXIT work;
    END IF;

    INSERT INTO public.analytics_presence AS p (tab_id, page, game_id, visible)
    VALUES (p_tab, v_page, v_game, p_visible)
    ON CONFLICT (tab_id) DO UPDATE SET
      page      = EXCLUDED.page,
      game_id   = EXCLUDED.game_id,
      visible   = EXCLUDED.visible,
      left_at   = NULL,           -- a later beat (e.g. page restored from bfcache) revives the tab
      last_seen = now()
    -- Evaluated on the locked, latest row version: a leave committed by a
    -- concurrent request always wins over a regular beat racing it.
    WHERE p.left_at IS NULL OR p.left_at < now() - interval '5 seconds'
    -- xmax = 0 only for a freshly inserted row: exactly one of several racing
    -- first beats of the same tab sees true, so a visit is counted once.
    RETURNING (xmax = 0) INTO v_inserted;

    IF v_inserted IS NULL THEN v_result := 'left'; EXIT work; END IF;  -- blocked by a fresh tombstone

    IF v_inserted THEN v_visit := 1; END IF;
    IF v_game IS NOT NULL AND (v_inserted OR (v_found AND v_row.game_id IS DISTINCT FROM v_game)) THEN
      v_entry := 1;
    END IF;
    v_result := 'ok';
  END;

  -- One write to a random per-day slot, as the LAST statement (its row lock is
  -- held only until commit): concurrent heartbeats rarely touch the same row.
  INSERT INTO public.analytics_daily AS d (day, slot, beats, visits, room_entries)
  VALUES (v_today, floor(random() * 8)::smallint, 1, v_visit, v_entry)
  ON CONFLICT (day, slot) DO UPDATE SET
    beats        = d.beats + 1,
    visits       = d.visits + EXCLUDED.visits,
    room_entries = d.room_entries + EXCLUDED.room_entries;

  RETURN v_result;
END;
$$;

-- ── Admin dashboard ─────────────────────────────────────────────────────────
-- Everything the live dashboard needs, in one round trip: counts only.
CREATE OR REPLACE FUNCTION public.analytics_dashboard(p_online_seconds integer DEFAULT 120)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH live AS (
    SELECT * FROM public.analytics_presence
    WHERE last_seen > now() - make_interval(secs => p_online_seconds)
      AND left_at IS NULL
  ),
  today AS (SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS d),
  rooms AS (
    SELECT g.code, g.status, g.current_team,
           count(*)                       AS tabs,
           count(*) FILTER (WHERE l.visible) AS visible_tabs,
           max(l.last_seen)               AS last_activity
    FROM live l JOIN public.games g ON g.id = l.game_id
    GROUP BY g.code, g.status, g.current_team
  ),
  created AS (
    SELECT (g.created_at AT TIME ZONE 'Asia/Jerusalem')::date AS d FROM public.games g
    WHERE g.created_at > now() - interval '31 days'
  ),
  s AS (SELECT * FROM public.analytics_settings WHERE id)
  SELECT json_build_object(
    'generated_at',         now(),
    'online_seconds',       p_online_seconds,
    'tabs_online',          (SELECT count(*) FROM live),
    'visible_tabs_online',  (SELECT count(*) FROM live WHERE visible),
    'tabs_in_games',        (SELECT count(*) FROM live WHERE page = 'game'),
    'occupied_rooms',       (SELECT count(*) FROM rooms),
    'occupied_rooms_in_progress', (SELECT count(*) FROM rooms WHERE status <> 'finished'),
    'visits_today',         (SELECT COALESCE(sum(visits), 0) FROM public.analytics_daily, today WHERE day = today.d),
    'visits_7d',            (SELECT COALESCE(sum(visits), 0) FROM public.analytics_daily, today WHERE day > today.d - 7),
    'visits_30d',           (SELECT COALESCE(sum(visits), 0) FROM public.analytics_daily, today WHERE day > today.d - 30),
    'visits_total',         (SELECT COALESCE(sum(visits), 0) FROM public.analytics_daily),
    'room_entries_today',   (SELECT COALESCE(sum(room_entries), 0) FROM public.analytics_daily, today WHERE day = today.d),
    'room_entries_7d',      (SELECT COALESCE(sum(room_entries), 0) FROM public.analytics_daily, today WHERE day > today.d - 7),
    'room_entries_30d',     (SELECT COALESCE(sum(room_entries), 0) FROM public.analytics_daily, today WHERE day > today.d - 30),
    'games_created_today',  (SELECT count(*) FROM created, today WHERE created.d = today.d),
    'games_created_7d',     (SELECT count(*) FROM created, today WHERE created.d > today.d - 7),
    'games_created_30d',    (SELECT count(*) FROM created, today WHERE created.d > today.d - 30),
    'tracking_since',       (SELECT min(day) FROM public.analytics_daily),
    'beats_today',          (SELECT COALESCE(sum(beats), 0) FROM public.analytics_daily, today WHERE day = today.d),
    'daily_beat_cap',       (SELECT daily_beat_cap FROM s),
    'paused',               (SELECT paused FROM s),
    'rooms', COALESCE((
      SELECT json_agg(json_build_object(
        'code', code, 'status', status, 'current_team', current_team,
        'tabs', tabs, 'visible_tabs', visible_tabs, 'last_activity', last_activity
      ) ORDER BY tabs DESC, last_activity DESC)
      FROM rooms), '[]'::json)
  );
$$;

REVOKE ALL ON FUNCTION public.analytics_heartbeat(uuid, text, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_dashboard(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_heartbeat(uuid, text, text, boolean, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_dashboard(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_cleanup() TO service_role;

-- Self-check of EFFECTIVE privileges (incl. PUBLIC and role membership): any
-- surviving access for the API roles aborts and rolls back the whole migration.
DO $$
DECLARE r text; t text; p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['public.analytics_presence', 'public.analytics_daily', 'public.analytics_settings'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(r, t, p) THEN RAISE EXCEPTION '012: % has % on %', r, p, t; END IF;
      END LOOP;
    END LOOP;
    IF has_function_privilege(r, 'public.analytics_heartbeat(uuid, text, text, boolean, text, boolean)', 'EXECUTE')
      OR has_function_privilege(r, 'public.analytics_dashboard(integer)', 'EXECUTE')
      OR has_function_privilege(r, 'public.analytics_cleanup()', 'EXECUTE') THEN
      RAISE EXCEPTION '012: % can execute an analytics function', r;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
