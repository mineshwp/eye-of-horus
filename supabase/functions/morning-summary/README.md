# Morning Summary Edge Function

Server-side aggregator that builds one clean JSON payload of the last 24h of
monitoring data. Read by the Claude 7am scheduled task — Claude never touches
the database directly.

## Architecture

```
Supabase tables  →  morning-summary Edge Function  →  7am Scheduled Task  →  digest to you
 (raw data)         (clean JSON, secret-gated)        (fetches one URL)
```

## What it returns

`totals`, `open_issues`, `wp_updates`, `form_failures`, `watchtower_failures`,
and a per-site `sites` array with `uptime_24h`, `performance` (desktop +
mobile), `security`, `open_issues`, `wp_updates_pending`.

## Deploy

```bash
# 1. Set the shared secret (use a long random string)
supabase secrets set SUMMARY_SECRET="$(openssl rand -hex 24)"

# 2. Deploy. --no-verify-jwt because auth is via the x-eoh-secret header.
supabase functions deploy morning-summary --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by
the Supabase runtime — no need to set them.

## Test

```bash
curl -s -H "x-eoh-secret: <YOUR_SECRET>" \
  "https://<PROJECT_REF>.supabase.co/functions/v1/morning-summary" | jq
```

A missing/wrong secret returns `401`.

## Wire it into the scheduled task

The 7am task lives at:
`~/Documents/Claude/Scheduled/eoh-morning-summary/SKILL.md`

Open it and replace the two placeholders with real values:

- `<PROJECT_REF>` → your Supabase project ref
- `<SECRET>` → the `SUMMARY_SECRET` you set above

Then click **Run now** once in the Scheduled sidebar to pre-approve the fetch
tool so future 7am runs don't pause on a permission prompt.

## Notes

- Uses the service-role key, which bypasses RLS — intended, since this is a
  trusted server-to-server endpoint protected by the secret header.
- `open_issues` filters on statuses: open, in_progress, investigating, new.
  Adjust `OPEN_ISSUE_STATUSES` in `index.ts` if your status vocabulary differs.
- The function reads `wp_updates`, `wordpress_snapshots`, `uptime_checks`,
  `performance_metrics`, `form_checks`, `checks`, `issues`, `sites`.
