#!/usr/bin/env node
/**
 * 인천공항 출국장 혼잡 예상 → 카카오톡에 보낼 메시지 한 덩어리를 만든다.
 *
 * 데이터: 공공데이터포털 「인천국제공항공사_승객예고-출·입국장별」(15095066)
 *   GET https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt
 *   serviceKey · numOfRows · pageNo(필수) · selectdate(0=오늘, 1=내일) · type=json
 *   item: adate(YYYYMMDD) · atime(HH_HH, 1시간 간격) · t1dgsum1(T1 출국장 합계) · t2dgsum2(T2 출국장 합계)
 *   필드 이름은 포털 Swagger 원문 그대로다. t2 쪽만 sum2 인 것도 원문이 그렇다.
 *
 * 사용:
 *   node fetch-congestion.mjs            # 오늘
 *   node fetch-congestion.mjs --tomorrow # 내일
 *   node fetch-congestion.mjs --file 응답.json   # 키 없이 저장된 응답으로 계산만
 *
 * 출력(stdout): JSON 한 줄 — { ok, date, t1:[…], t2:[…], message, hours:[{time,t1,t2}…], total:{t1,t2} } 또는 { ok:false, error }
 * 키는 환경변수 DATA_GO_KR_KEY 에서만 읽고, 어디에도 찍지 않는다.
 *
 * 활용가이드 V5.0(2025-10-30) 기준: 갱신 5분 · 응답 25행(24개 시간대 + 「합계」) ·
 * T1 6번 출국장(t1dg6)은 교통약자 우대 출구라 예상혼잡도 대상이 아니다 — 2026-10-07 실측에서도 늘 0 이었다.
 */
import { readFileSync } from 'node:fs'

const URL_BASE = 'https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt'
const TOP = 3

// 공공데이터포털 오류 메시지 → 할 일. 출처: 인천국제공항공사 OpenAPI 활용가이드 V5.0 「3-1」
const PORTAL_ERRORS = {
  Unauthorized: '키가 없거나 틀렸습니다. 포털 마이페이지의 일반 인증키를 다시 복사해 넣으세요.',
  Forbidden: '이 API 활용신청이 안 됐거나 승인 전입니다. 신청 직후라면 잠시 뒤 다시 하세요.',
  'API token quota exceeded': '오늘 호출 한도를 넘었습니다. 한도가 초기화된 뒤 다시 하세요.',
  'API rate limit exceeded': '지금 요청이 몰렸습니다. 잠시 뒤 다시 하세요.',
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
  process.exit(0)
}

const args = process.argv.slice(2)
const tomorrow = args.includes('--tomorrow')
const fileIdx = args.indexOf('--file')

async function load() {
  if (fileIdx !== -1) return JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'))

  // 포털의 Encoding 키(%2F 등)를 넣어도 되게 한 번 풀어 둔다 — 아래 URLSearchParams 가 다시 인코딩한다
  const rawKey = process.env.DATA_GO_KR_KEY
  const key = rawKey && rawKey.includes('%') ? decodeURIComponent(rawKey) : rawKey
  if (!key) {
    out({ ok: false, error: '환경변수 DATA_GO_KR_KEY 가 없습니다. README 의 「서비스 키 넣기」를 따라 설정하세요.' })
  }
  const q = new URLSearchParams({
    serviceKey: key,
    numOfRows: '100',
    pageNo: '1',
    selectdate: tomorrow ? '1' : '0',
    type: 'json',
  })
  const res = await fetch(`${URL_BASE}?${q}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // 활용가이드 3-1 은 포털 오류가 XML 로만 온다고 적었다. 아는 것은 할 일로 바꿔 알려 준다
    const hint = Object.entries(PORTAL_ERRORS).find(([k]) => text.includes(k))
    out({ ok: false, error: hint ? `${hint[0]} — ${hint[1]}` : `JSON 이 아닌 응답(HTTP ${res.status}): ${text.slice(0, 200)}` })
  }
}

const data = await load()

// 실측(2026-10-07): 등록 안 된 키는 XML 이 아니라 이 JSON 으로 왔다(HTTP 403)
const portal = data?.OpenAPI_ServiceResponse?.cmmMsgHeader
if (portal) {
  const msg = portal.errMsg === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' ? PORTAL_ERRORS.Unauthorized : ''
  out({ ok: false, error: `${portal.returnAuthMsg ?? portal.errMsg} — ${msg || '포털 오류 코드 ' + portal.returnReasonCode}` })
}
const header = data?.response?.header
if (header && header.resultCode !== '00') {
  out({ ok: false, error: `API 오류 ${header.resultCode}: ${header.resultMsg}` })
}

// 실제 JSON 응답은 body.items 가 바로 배열이다(2026-10-07 실측). Swagger 는 items.item 으로 적혀 있어 둘 다 받는다
const itemsNode = data?.response?.body?.items
const raw = Array.isArray(itemsNode) ? itemsNode : (itemsNode?.item ?? [])
const items = (Array.isArray(raw) ? raw : [raw])
  // 시간대 행만 쓴다. 합계 같은 다른 행이 섞여 있어도 atime 모양으로 걸러진다
  .filter((it) => /^\d{2}_\d{2}$/.test(it.atime ?? ''))

if (items.length === 0) out({ ok: false, error: '시간대 데이터가 비어 있습니다.' })

const num = (v) => Math.round(Number(v) || 0)
const top = (field) =>
  items
    .map((it) => ({ time: it.atime.replace('_', '~') + '시', count: num(it[field]) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP)

const t1 = top('t1dgsum1')
const t2 = top('t2dgsum2')
const adate = items[0].adate ?? ''
const date = adate.length === 8 ? `${adate.slice(4, 6)}/${adate.slice(6, 8)}` : adate

const line = (rows) => rows.map((r) => `${r.time} ${r.count.toLocaleString('ko-KR')}명`).join(', ')
const message = [
  `[인천공항 출국장 혼잡 예상] ${date}`,
  `T1: ${line(t1)}`,
  `T2: ${line(t2)}`,
  '※ 실측이 아닌 예상치 (인천국제공항공사)',
].join('\n')

// 「밤 10시는?」「하루 몇 명?」 같은 질문에 답하려고 시간대 전체와 하루 합계도 같이 낸다(카톡 message 는 그대로)
const hours = items.map((it) => ({ time: it.atime.replace('_', '~') + '시', t1: num(it.t1dgsum1), t2: num(it.t2dgsum2) }))
const total = { t1: hours.reduce((a, h) => a + h.t1, 0), t2: hours.reduce((a, h) => a + h.t2, 0) }

out({ ok: true, date, t1, t2, message, hours, total })
