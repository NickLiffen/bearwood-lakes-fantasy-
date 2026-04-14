#!/usr/bin/env bash
# Setup local .env by linking to Netlify and pulling environment variables.
# Usage: ./scripts/setup-env.sh

set -euo pipefail

SITE_ID="bececa35-78e9-4570-a05c-666ee14fad47"

echo "🔗 Linking to Netlify site (bearwoodlakes) ..."
npx netlify link --id "$SITE_ID"

echo ""
echo "📥 Pulling environment variables ..."
npx netlify env:pull --force

echo ""
echo "✅ .env created — ready to use with 'netlify dev'"
