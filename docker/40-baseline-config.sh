#!/bin/sh
#
# Writes the runtime configuration the browser reads before the bundle runs.
#
# This is the whole reason no URL appears in any bundle: the same three images
# run in any environment, and where the remotes live is decided here, at
# container start, from environment variables.
#
# The nginx image runs everything in /docker-entrypoint.d before starting the
# server, so this needs no ENTRYPOINT of its own.

set -eu

: "${PEOPLE_URL:?PEOPLE_URL is required, e.g. http://localhost:8081}"
: "${DELIVERY_URL:?DELIVERY_URL is required, e.g. http://localhost:8082}"

TARGET=/usr/share/nginx/html/config.js

# Overwrites the development defaults that were copied in with the bundle. The
# file is generated rather than mounted so that a container is self-contained
# and `docker compose up` needs nothing on the host.
cat > "$TARGET" <<CONFIG
// Generated at container start from environment variables. Do not edit.
window.__BASELINE_CONFIG__ = {
  peopleUrl: '${PEOPLE_URL}',
  deliveryUrl: '${DELIVERY_URL}',
};
CONFIG

echo "baseline: wrote $TARGET (people=${PEOPLE_URL} delivery=${DELIVERY_URL})"
