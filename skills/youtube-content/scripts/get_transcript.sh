#!/bin/bash
# Usage: get_transcript.sh <youtube_url> [lang]
# Returns clean text transcript to stdout via supadata.ai API

URL="$1"
LANG="${2:-ru}"
API_KEY="${SUPADATA_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: SUPADATA_API_KEY not set"
  exit 1
fi

RESULT=$(curl -s \
  "https://api.supadata.ai/v1/youtube/transcript?url=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe='')); " "$URL")&lang=${LANG}&text=true" \
  -H "x-api-key: ${API_KEY}")

# Check for error
ERROR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
if [ -n "$ERROR" ]; then
  # Try without lang (fallback to any available language)
  RESULT=$(curl -s \
    "https://api.supadata.ai/v1/youtube/transcript?url=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe='')); " "$URL")&text=true" \
    -H "x-api-key: ${API_KEY}")
fi

echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'content' in data:
    print(data['content'])
else:
    print('ERROR:', data.get('error', 'Unknown error'))
    sys.exit(1)
"
