#!/usr/bin/env bash
# Puts BDMF live on Vercel. Run once; afterwards `git push` deploys on its own.
#
#   ./scripts/deploy.sh "postgresql://…pooled connection string…"
#
# Before running: `npx vercel login` (opens a browser; sign in with GitHub).
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-}"
[ -n "$DB" ] || { echo "Usage: ./scripts/deploy.sh \"<pooled DATABASE_URL>\""; exit 1; }
case "$DB" in postgres*) ;; *) echo "That does not look like a Postgres URL."; exit 1;; esac

npx vercel whoami >/dev/null 2>&1 || { echo "Not signed in. Run: npx vercel login"; exit 1; }

echo "▸ Creating the schema"
DATABASE_URL="$DB" npx tsx scripts/migrate.ts

echo "▸ Linking the project"
npx vercel link --yes >/dev/null

echo "▸ Setting environment variables"
for env in production preview; do
  printf '%s' "$DB" | npx vercel env add DATABASE_URL "$env" --force >/dev/null 2>&1 || true
done

echo "▸ Deploying"
URL=$(npx vercel deploy --prod --yes 2>&1 | tail -1)
echo "▸ Live at $URL"

# APP_URL builds every invitation link, so it has to match the real domain.
printf '%s' "$URL" | npx vercel env add APP_URL production --force >/dev/null 2>&1 || true
npx vercel deploy --prod --yes >/dev/null 2>&1

cat <<EOF

Done. $URL

Next:
  1. Register an admin account on the site.
  2. Grant yourself the OZ back office:
       DATABASE_URL="$DB" npm run oz:grant -- you@ozglobalb2b.com
  3. Optional: add RESEND_API_KEY so invitations actually send, and
     ANTHROPIC_API_KEY for the AI summaries. Both work without keys —
     mail logs to the console, summaries use the built-in summariser.
EOF
