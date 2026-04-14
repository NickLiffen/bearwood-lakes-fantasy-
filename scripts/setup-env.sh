#!/usr/bin/env bash
# Setup local .env by linking to Netlify and pulling environment variables.
# Usage: ./scripts/setup-env.sh

set -euo pipefail

SITE_ID="bearwood-lakes-fantasy"

echo "🔗 Linking to Netlify site: $SITE_ID ..."
npx netlify link --name "$SITE_ID"

echo ""
echo "📥 Pulling environment variables ..."
npx netlify env:pull --force

echo ""
echo "✅ .env created — ready to use with 'netlify dev'"
