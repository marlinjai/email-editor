#!/bin/sh
# Lumitra Mail service entrypoint: fetch runtime secrets from Infisical, apply
# pending migrations, then start the API.
#
# Required container environment (set on the Coolify application, nothing else):
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_ID
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
#   INFISICAL_PROJECT_ID
# Optional:
#   INFISICAL_ENV   defaults to "prod"
#
# Everything else (DATABASE_URL, DASHBOARD_SERVICE_TOKEN, MAIL_SECRETS_KEY,
# MAIL_UNSUBSCRIBE_KEY) is
# injected by `infisical run` at process start and never written to disk. The
# service itself validates those and refuses to start without them.
set -eu

INFISICAL_DOMAIN="https://infisical.lumitra.co"
INFISICAL_ENV="${INFISICAL_ENV:-prod}"

# Refuse to boot, naming the missing variable, rather than start a container
# that can never reach its secrets.
missing=""
for required in INFISICAL_UNIVERSAL_AUTH_CLIENT_ID INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET INFISICAL_PROJECT_ID; do
  eval "value=\${$required:-}"
  if [ -z "$value" ]; then
    missing="$missing $required"
  fi
done
if [ -n "$missing" ]; then
  echo "FATAL: not set on this container:$missing. See apps/service/README.md." >&2
  exit 1
fi

INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  --client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
  --domain="$INFISICAL_DOMAIN" \
  --plain --silent) || {
  echo "FATAL: Infisical login failed (universal auth). Check the machine identity credentials." >&2
  exit 1
}
export INFISICAL_TOKEN
unset INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET

# Migrate first, and only on success serve. Both run under one `infisical run`
# so the secrets exist only in that process tree. `exec` keeps node as the
# signal recipient, so SIGTERM from a rolling deploy drains cleanly.
exec infisical run \
  --projectId "$INFISICAL_PROJECT_ID" \
  --env "$INFISICAL_ENV" \
  --path / \
  --domain "$INFISICAL_DOMAIN" \
  -- sh -c 'node dist/main.js migrate && exec node dist/main.js serve'
