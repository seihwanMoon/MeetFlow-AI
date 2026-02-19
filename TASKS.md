# 개발 진행 체크리스트

## 사용 방법
- 각 작업을 완료할 때마다 체크박스를 `[x]`로 수정하며 진행 상황을 공유한다.
- 주차별로 우선순위를 명시했으므로 필수 작업부터 진행하고, 막히는 경우 바로 문서에 메모를 추가한다.

## Week 1: 환경/기초 구축
- [ ] Vercel 프로젝트 생성 및 GitHub 레포 연결, 환경변수 템플릿 정의(Vercel, Supabase API 키 등).
- [x] Supabase 프로젝트 생성: Auth 세팅(이메일 매직 링크) 및 Postgres 스키마(user/meeting/recording 등) 최초 마이그레이션.
- [x] 로컬 개발 환경 구성: `pnpm install`, 환경 변수 `.env.local` 정리, 기본 Next.js 페이지/라우트 생성.
- [x] 업로드 API(`POST /api/upload`) 설계: Supabase Storage 프리사인 URL 발급 로직 포함.
- [x] MediaRecorder 기반 브라우저 녹음 컴포넌트 프로토타입(일시정지, 재개 포함) 구현.

## Week 2: 전사/요약 파이프라인
- [x] `/api/transcribe`: 업로드 후 외부 STT API 호출, 진행 상태 Supabase에 저장.
- [x] 전사 결과 DB 스키마 확정 및 Webhook/폴링 전략 구현(Supabase Edge Function or Vercel Cron).
- [x] `/api/summary`: LLM 프롬프트 설계, 요약·Action Item JSON 파싱 및 저장.
- [x] 클라이언트에서 전사/요약 진행률 표시(상태 폴링) UI 추가.
- [x] 기존 회의 선택 시 전사/요약 결과 자동 로드.

## Week 3: 편집/공유/다이어그램
- [x] 전사 텍스트 뷰어 + 키워드 검색/편집 기능.
- [x] 요약 및 Action Item 편집 UI(인라인 편집/검증) 완성.
- [x] `/api/diagram`: Mermaid 다이어그램 생성 API 및 클라이언트 렌더링/저장.
- [x] 공유 링크 생성/관리: 토큰 기반 읽기 전용 페이지, 만료 기간 설정.
- [x] 기존 회의/녹음 히스토리 조회 및 선택 기능 구현.
- [x] 다이어그램 공유 링크/든든한 읽기 뷰 구현.

## Week 4: 안정화/QA
- [ ] 파일 만료/정리 작업: Supabase Scheduled Function으로 30일 지난 음성/다이어그램 삭제.
- [ ] 기본 모니터링/로깅: Vercel Observability, Supabase Edge Logs, Sentry 연동.
- [ ] Playwright 스모크 테스트: 업로드→전사 완료→결과 확인 플로우 자동화.
- [ ] 성능/비용 검토: STT/LLM API 사용량 추적, Vercel 함수 시간 체크.

## 지속 관리
- [ ] 작업 진행 중 발생한 리스크/결정 사항을 `DEV_PLAN.md`와 본 체크리스트에 기록.
- [ ] Beta 단계(이메일/Slack, 팀 관리 등)를 준비하기 위한 요구 수집 진행.
- [ ] 다이어그램 공유/다운로드, 요약 편집 기능 요구 수집.
