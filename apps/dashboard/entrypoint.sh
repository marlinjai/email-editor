#!/bin/sh
# Lumitra Mail dashboard entrypoint: fetch the dashboard's runtime secrets from
# Infisical, then start the Next.js standalone server.
#
# Required container environment (set on the Coolify application, nothing else):
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_ID
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
#   INFISICAL_PROJECT_ID
# Optional:
#   INFISICAL_ENV   defaults to "prod"
#
# Only the secrets under the /dashboard path are injected (MAIL_SERVICE_URL,
# DASHBOARD_SERVICE_TOKEN, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
# AUTH_SESSION_SECRET, DASHBOARD_PUBLIC_URL), never the service's database or
# encryption keys. They exist only in the server's process tree.
set -eu

INFISICAL_DOMAIN="https://infisical.lumitra.co"
INFISICAL_ENV="${INFISICAL_ENV:-prod}"

missing=""
for required in INFISICAL_UNIVERSAL_AUTH_CLIENT_ID INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET INFISICAL_PROJECT_ID; do
  eval "value=\${$required:-}"
  if [ -z "$value" ]; then
    missing="$missing $required"
  fi
done
if [ -n "$missing" ]; then
  echo "FATAL: not set on this container:$missing. See apps/dashboard/README.md." >&2
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

# `exec` keeps node as the signal recipient, so SIGTERM from a rolling deploy
# stops it cleanly.
exec infisical run \
  --projectId "$INFISICAL_PROJECT_ID" \
  --env "$INFISICAL_ENV" \
  --path /dashboard \
  --domain "$INFISICAL_DOMAIN" \
  -- node apps/dashboard/server.js
