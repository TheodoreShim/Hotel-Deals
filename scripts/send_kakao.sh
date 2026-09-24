#!/usr/bin/env bash
# 카카오톡 "나에게 보내기"로 브리핑 요약을 전송한다.
# 사용법: send_kakao.sh "보낼 메시지 텍스트" "웹 링크(선택)"
set -euo pipefail

CRED_FILE="$(dirname "$0")/../.kakao_credentials.json"
MESSAGE="${1:?메시지 텍스트가 필요합니다}"
LINK_URL="${2:-https://developers.kakao.com}"

CLIENT_ID=$(jq -r '.client_id' "$CRED_FILE")
CLIENT_SECRET=$(jq -r '.client_secret' "$CRED_FILE")
REDIRECT_URI=$(jq -r '.redirect_uri' "$CRED_FILE")
REFRESH_TOKEN=$(jq -r '.refresh_token' "$CRED_FILE")

TOKEN_RESPONSE=$(curl -s -X POST "https://kauth.kakao.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "refresh_token=${REFRESH_TOKEN}")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')
if [ -z "$ACCESS_TOKEN" ]; then
  echo "토큰 갱신 실패: $TOKEN_RESPONSE" >&2
  exit 1
fi

NEW_REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.refresh_token // empty')
if [ -n "$NEW_REFRESH_TOKEN" ]; then
  TMP=$(mktemp)
  jq --arg rt "$NEW_REFRESH_TOKEN" '.refresh_token = $rt' "$CRED_FILE" > "$TMP" && mv "$TMP" "$CRED_FILE"
fi

TEMPLATE=$(jq -n --arg text "$MESSAGE" --arg url "$LINK_URL" \
  '{object_type:"text", text:$text, link:{web_url:$url, mobile_web_url:$url}}')

SEND_RESPONSE=$(curl -s -X POST "https://kapi.kakao.com/v2/api/talk/memo/default/send" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  --data-urlencode "template_object=${TEMPLATE}")

echo "$SEND_RESPONSE"
