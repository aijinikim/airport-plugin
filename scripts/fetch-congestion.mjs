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
 * 출력(stdout): JSON 한 줄 — { ok, date, t1:[…], t2:[…], message } 또는 { ok:false, error }
 * 키는 환경변수 DATA_GO_KR_KEY 에서만 읽고, 어디에도 찍지 않는다.
 */
import { readFileSync } from 'node:fs'

const URL_BASE = 'https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt'
const TOP = 3

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
  process.exit(0)
}

const args = process.argv.slice(2)
const tomorrow = args.includes('--tomorrow')
const fileIdx = args.indexOf('--file')

async function load() {
  if (fileIdx !== -1) return JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'))

  const key = process.env.DATA_GO_KR_KEY
  if (!key) {
    out({ ok: false, error: '환경변수 DATA_GO_KR_KEY 가 없습니다. README 의 「서비스 키 넣기」를 따라 설정하세요.' })
  }
  const q = new URLSearchParams({
    serviceKey: key, // 포털이 주는 「일반 인증키(Decoding)」를 넣는다 — URLSearchParams 가 한 번 인코딩한다
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
    // 키 오류 등은 JSON 이 아니라 XML 로 온다 — 앞부분만 보여 준다(키는 응답에 없다)
    out({ ok: false, error: `JSON 이 아닌 응답(HTTP ${res.status}): ${text.slice(0, 200)}` })
  }
}

const data = await load()
const header = data?.response?.header
if (header && header.resultCode !== '00') {
  out({ ok: false, error: `API 오류 ${header.resultCode}: ${header.resultMsg}` })
}

// item 이 한 건이면 배열이 아니라 객체로 오는 공공데이터 API 가 많아 둘 다 받는다
const raw = data?.response?.body?.items?.item ?? []
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

out({ ok: true, date, t1, t2, message })
