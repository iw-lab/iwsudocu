# 칸채움 v2 — 작업 계획

## 구조 (로직·렌더 분리)
- `src/lib/mini/engine.ts` — 순수 로직(DOM 0): 크기 N·상자·대각선 규칙, 해 생성(시드), 해 개수 세기(최대 2), 퍼즐 깎기, 칸 판정.
- `src/lib/mini/run.ts` — 런 모드 상태기계(순수): time/survival/rule 판 순서·점수·시계·하트·라운드. 시간은 주입(now 인자) → headless 시험.
- `src/components/run/RunGame.tsx` — 렌더/입력(판·숫자 패드·띠·결과 시트). 상태는 run.ts 만 호출.
- `src/lib/hub/gb.ts` — 키트 연결(configure·이용권 영수증 보관·정산) — 클라이언트 전용 동적 import.
- `src/gb/*` — 키트 원본(고치지 않음) · `functions/api/hub/[[path]].js` 중계 · `hub/` 워커.
- 홈 `src/app/page.tsx` 기본틀 셸 · `/time` `/survival` `/rule` 페이지.
- 제거: `functions/api/leaderboard.ts`(자유 닉네임 랭킹) · GameCompleteModal 닉네임 입력 · requestSession fetch.

## 단계
1. 엔진+시험(`tests/mini-engine.test.mjs`): 유일해·규칙·시간 — 종료 = D3 PASS·주입 빨강.
2. 런 상태기계+시험(`tests/run.test.mjs`): D4·D5·D6·D12 headless.
3. 화면: RunGame + 페이지 3 + 홈 셸 + 키트 설치/연결 + 클래식·오늘 관문 — 종료 = gate-baseline 로컬 PASS.
4. 정리: 닉네임 랭킹 제거·rAF 의존 제거·SFX 파일·SW 버전/`/api` 비켜감.
5. 검증: 실제 클릭 e2e(전 화면 촬영·콘솔 0) → 배포(daum Pages `kanchaeum`) → gate-baseline --url --expect-hub.
