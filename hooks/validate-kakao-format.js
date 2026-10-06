#!/usr/bin/env node
/**
 * PreToolUse 훅 — 카카오톡 나와의 채팅(KakaotalkChat-MemoChat)으로 나가는 메시지를 검사한다.
 *
 * 메시지는 scripts/fetch-congestion.mjs 가 만든 것 그대로여야 한다:
 *
 *   [인천공항 출국장 혼잡 예상]
 *   10/08(목) · 예상치
 *
 *   ■ 15~16시                  ← --hour 로 물었을 때만
 *   T1 2,666명 · T2 1,470명
 *
 *   ■ T1 혼잡
 *   08~09시 4,240명 (3줄)
 *
 *   ■ T2 혼잡
 *   07~08시 4,700명 (3줄)
 *
 *   ■ 하루 합계
 *   T1 55,509명 · T2 46,271명
 *
 * 프롬프트로만 「형식을 지켜라」라고 하면 Claude 가 숫자를 고치거나 꾸밈을 붙일 수 있다.
 * 그래서 보내기 직전에 이 훅이 막는다. 막으면 이유를 돌려주고, Claude 는 다시 만든다.
 * 길이 상한 200자는 MemoChat 도구 설명(「최대 200자」)을 따른다. AIRPORT_MSG_LIMIT_CHARS 로 바꿀 수 있다.
 */

const SLOT = '\\d{2}~\\d{2}시 [\\d,]+명'
const FORMAT = new RegExp(
  '^\\[인천공항 출국장 혼잡 예상\\]\\n\\d{2}/\\d{2}\\(.\\) · 예상치' +
  `(\\n\\n■ \\d{2}~\\d{2}시\\nT1 [\\d,]+명 · T2 [\\d,]+명)?` +
  `\\n\\n■ T1 혼잡(\\n${SLOT}){1,3}` +
  `\\n\\n■ T2 혼잡(\\n${SLOT}){1,3}` +
  '\\n\\n■ 하루 합계\\nT1 [\\d,]+명 · T2 [\\d,]+명$',
)
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
  // 이 훅은 나챗방으로 가는 모든 전송에 걸린다 — 다른 플러그인(예: welfare-plugin)의 메시지까지.
  // 그래서 이 플러그인 메시지(「[인천공항」으로 시작)일 때만 검사한다
  if (!message.startsWith('[인천공항')) return
  if (!FORMAT.test(message)) deny('메시지가 정해진 양식(제목 · 날짜 · [물어본 시간] · T1 혼잡 · T2 혼잡 · 하루 합계)과 다릅니다.')
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
