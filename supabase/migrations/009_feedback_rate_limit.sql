-- Rate limiting for the /api/feedback endpoint. Keyed by a hash of the
-- submitter's IP (never the raw IP) so we can throttle abuse without storing
-- anything that identifies a real person. Accessed only via the service-role
-- client from the server — no grants to anon/authenticated.

CREATE TABLE feedback_rate_limits (
  ip_hash      text        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        int         NOT NULL DEFAULT 0
);

ALTER TABLE feedback_rate_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (which bypasses RLS) may
-- touch this table. anon/authenticated have no access at all.

-- Atomically checks and increments the counter for a fixed window, resetting
-- once the window has elapsed. Returns true when the request is allowed.
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(
  p_ip_hash text,
  p_max int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO feedback_rate_limits (ip_hash, window_start, count)
  VALUES (p_ip_hash, now(), 1)
  ON CONFLICT (ip_hash) DO UPDATE
    SET count = CASE
          WHEN feedback_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            THEN 1
          ELSE feedback_rate_limits.count + 1
        END,
        window_start = CASE
          WHEN feedback_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            THEN now()
          ELSE feedback_rate_limits.window_start
        END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default — revoke it. Only the
-- service_role (used exclusively from the server-side API route) may call this.
REVOKE ALL ON FUNCTION public.check_feedback_rate_limit(text, int, int) FROM PUBLIC;
