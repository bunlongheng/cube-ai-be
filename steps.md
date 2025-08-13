# Cube Cloud Chat API - cURL Flow

## 1. Generate Session

```bash
curl -s -X POST "https://thryv.cubecloud.dev/api/v1/embed/generate-session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Api-Key $CUBE_API_KEY" \
  -d '{"externalId":"user@example.com","userAttributes":[]}'
```

## 2. Exchange Session for Token

```bash
  curl -s -X POST "https://thryv.cubecloud.dev/api/v1/embed/session/token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Api-Key $CUBE_API_KEY" \
  -d '{"sessionId":"<sessionId-from-step1>"}'
```

## 3. Send Chat Request

```bash
  curl -s -X POST "$CUBE_API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token-from-step2>" \
  -d '{
    "chatId": "'"$(uuidgen)"'",
    "input": "Show me appointments by status for next 4 weeks"
  }'
```
