---
name: airport
description: 인천공항 T1·T2 출국장의 오늘(또는 내일) 예상 승객 수를 공공데이터포털에서 받아, 가장 붐비는 시간대 3개를 카카오톡 나와의 채팅으로 보냅니다. "인천공항 혼잡도", "공항 붐비는 시간", "출국장 혼잡", "/airport" 요청 시 사용합니다.
argument-hint: "[오늘 | 내일]"
---

# 인천공항 출국장 혼잡 예상 → 카카오톡

## 1. 숫자를 받는다

인자에 「내일」이 있으면 `--tomorrow` 를 붙인다. 그 밖에는 오늘이다.
특정 시각을 물었으면 `--hour HH`(24시간제)를 붙인다 — 「오후 3시」→ `--hour 15`, 「밤 10시」→ `--hour 22`.
오전·오후가 애매하면(「10시」) 사용자에게 묻지 말고 둘 다 터미널에 보여 주되, 카톡에는 더 가까운 미래 시각 하나만 넣는다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch-congestion.mjs"            # 오늘
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch-congestion.mjs" --tomorrow # 내일
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch-congestion.mjs" --tomorrow --hour 15 # 내일 15~16시 포함
```

출력은 JSON 한 줄이다.

- `ok: false` 면 `error` 를 사용자에게 그대로 보여 주고 **멈춘다.** 숫자를 짐작해 채우지 않는다.
  키가 없다는 오류면 README 「서비스 키 넣기」를 안내한다.
- `ok: true` 면 다음 단계로 간다.

API 를 직접 부르거나 키 값을 출력하지 않는다. 키는 스크립트만 읽는다.

## 2. 터미널에 보여 준다

`t1` · `t2` 의 상위 3개 시간대를 짧은 표로 보여 준다. **실측이 아니라 예상치**라는 것을 함께 적는다.

사용자가 특정 시각이나 하루 합계를 물으면 같은 출력에서 답한다. 다시 부르지 않는다.

- 특정 시각: `hours` 에서 그 시각이 든 시간대(예: 밤 10시 → `22~23시`)
- 하루 합계: `total` (T1 · T2 출국장 예상 인원 합)

이 데이터는 **출국장**의 **예상** 인원이다. 「몇 명이 왔나」(실제 · 입국 · 공항 전체)를 물으면 그 차이를 먼저 말하고 출국장 예상치로 답한다.

## 3. 카카오톡으로 보낸다

도구 이름은 연결 방식에 따라 앞부분이 다르다. 세션에 있는 이름 중 `KakaotalkChat-MemoChat` 로 끝나는 것을 쓴다.

| 연결 | 도구 이름 |
|---|---|
| 이 플러그인의 `.mcp.json` | `mcp__playmcp__KakaotalkChat-MemoChat` |
| claude.ai 커스텀 커넥터 | `mcp__claude_ai_PlayMCP__KakaotalkChat-MemoChat` |

`message` 에는 스크립트가 준 `message` 를 **한 글자도 바꾸지 않고** 넣는다.
훅(`hooks/validate-kakao-format.js`)이 형식을 검사해서, 다르면 전송을 막는다.

도구가 없거나 실패하면: 터미널 결과는 이미 보여 줬으니 멈추지 않는다.
「PlayMCP 도구함에 카카오톡 나챗방을 담고 `/mcp` 에서 인증하세요」라고 안내한다.

## 되풀이 실행

수업 시연은 `/loop 1h /airport-plugin:airport` 로 1시간마다 보낸다.
호출 한도(1,000회)를 넘지 않게 간격을 짧게 잡지 않는다.
