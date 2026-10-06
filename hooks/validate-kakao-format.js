#!/usr/bin/env node
/**
 * PreToolUse 훅 — 카카오톡 나와의 채팅(KakaotalkChat-MemoChat)으로 나가는 메시지를 검사한다.
 *
 * 메시지는 scripts/fetch-congestion.mjs 가 만든 4줄 그대로여야 한다:
 *
 *   [인천공항 출국장 혼잡 예상] MM/DD
 *   T1: HH~HH시 N명, …
 *   T2: HH~HH시 N명, …
 *   ※ 실측이 아닌 예상치 (인천국제공항공사)
 *
 * 프롬프트로만 「형식을 지켜라」라고 하면 Claude 가 숫자를 고치거나 꾸밈을 붙일 수 있다.
 * 그래서 보내기 직전에 이 훅이 막는다. 막으면 이유를 돌려주고, Claude 는 다시 만든다.
 * 길이 상한 200자는 MemoChat 도구 설명(「최대 200자」)을 따른다. AIRPORT_MSG_LIMIT_CHARS 로 바꿀 수 있다.
 */

const FORMAT = /^\[인천공항 출국장 혼잡 예상\] .+\nT1: .+\nT2: .+\n※ 실측이 아닌 예상치 \(인천국제공항공사\)$/
const limitChars = Number(process.env.AIRPORT_MSG_LIMIT_CHARS) || 200

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason}\n\nscripts/fetch-congestion.mjs 가 출력한 message 를 한 글자도 바꾸지 말고 그대로 보내세요.`,
    },
  }))
  process.exit(0)
}

function validate(message) {
  if (typeof message !== 'string' || message.length === 0) deny('message 가 비어 있습니다.')
  if (!FORMAT.test(message)) deny('메시지가 정해진 4줄 형식(제목 · T1 · T2 · 예상치 안내)과 다릅니다.')
  if (/\*\*|__|`/.test(message)) deny('마크다운 장식(**, __, `)은 쓸 수 없습니다.')
  if (/\p{Extended_Pictographic}/u.test(message)) deny('이모지는 쓸 수 없습니다.')
  const chars = [...message].length
  if (chars > limitChars) deny(`메시지가 ${chars}자로 상한 ${limitChars}자를 넘었습니다.`)
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0) // 훅 입력이 깨진 건 모델 잘못이 아니다 — 막지 않는다
  }
  validate(payload?.tool_input?.message)
  process.exit(0)
})
