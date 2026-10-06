# airport-plugin

인천공항 **T1·T2 출국장**의 오늘 예상 승객 수를 보고, **가장 붐비는 시간대 3개**를 **카카오톡 나와의 채팅**으로 보내는 Claude Code 플러그인.

```
[인천공항 출국장 혼잡 예상] 10/07
T1: 07~08시 6,200명, 08~09시 5,900명, 06~07시 5,400명
T2: 08~09시 3,300명, 09~10시 3,100명, 07~08시 2,800명
※ 실측이 아닌 예상치 (인천국제공항공사)
```
위 숫자는 형식을 보여 주려고 만든 가짜 값이다.

## 설치

```
/plugin marketplace add aijinikim/airport-plugin
/plugin install airport-plugin@airport-plugin
```

설치 후 `/mcp` → `playmcp` 를 골라 카카오 계정으로 인증한다.

## 준비 두 가지

### 1. 서비스 키 넣기 (공공데이터포털)

1. [공공데이터포털](https://www.data.go.kr/data/15095066/openapi.do)에서 「인천국제공항공사_승객예고-출·입국장별」 **활용신청**
2. 마이페이지에서 **일반 인증키(Decoding)** 를 복사
3. 환경변수로 넣는다 — `~/.zshrc` 에 한 줄 넣고 터미널을 새로 연다
   ```bash
   export DATA_GO_KR_KEY='여기에-키'
   ```

키는 **레포·대화·카톡 어디에도 붙이지 않는다.** 스크립트만 환경변수에서 읽는다.

### 2. PlayMCP 도구함에 「카카오톡 나챗방」 담기

PlayMCP 는 도구함에 담긴 도구만 보여 준다. → https://playmcp.kakao.com/toolbox

## 사용

```
/airport-plugin:airport          # 오늘
/airport-plugin:airport 내일      # 내일
/loop 1h /airport-plugin:airport # 1시간마다 (수업 시연)
```

## 구조 — Plugin 은 폴더 하나

| 파일 | 구성요소 | 하는 일 |
|---|---|---|
| `.claude-plugin/plugin.json` | 이름표 | 플러그인 이름 · 버전 · 훅 등록 |
| `.claude-plugin/marketplace.json` | 마켓 | `/plugin marketplace add` 로 설치되게 한다 |
| `skills/airport/SKILL.md` | **Skill** | 절차: 숫자 받기 → 보여 주기 → 카톡 보내기 |
| `scripts/fetch-congestion.mjs` | (스킬이 쓰는 도구) | API 호출 → 시간대별 합계 → 상위 3개 → 메시지 |
| `hooks/validate-kakao-format.js` | **Hook** | 카톡 보내기 직전 형식 · 200자 검사, 다르면 막는다 |
| `.mcp.json` | **MCP** | 카카오 PlayMCP 연결(카카오톡 보내기) |

## 데이터

- 공공데이터포털 15095066 · `GET https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt`
- 쓰는 필드: `adate` · `atime`(HH_HH, 1시간) · `t1dgsum1`(T1 출국장 합계) · `t2dgsum2`(T2 출국장 합계)
- **오늘·내일만** 있다. 과거 기록 없음. 실측이 아니라 **예상치**다.

## 확인한 것 / 못 한 것

- ✅ 키 없이 실행하면 안내 오류로 멈춘다
- ✅ 가짜 응답(`test/sample-response.json`, Swagger 필드 이름 그대로)으로 상위 3개 계산 · 합계 행 걸러내기
- ✅ 훅: 정상 메시지 통과 / 꾸민 메시지 차단
- ❓ **실제 API 응답과 카카오톡 전송은 확인 못 했다** (제작 시점에 키가 없었다). 응답 모양이 다르면 `scripts/fetch-congestion.mjs` 의 필드 이름부터 본다

```bash
node scripts/fetch-congestion.mjs --file test/sample-response.json   # 키 없이 계산만 확인
```

## 라이선스

MIT
