# 상세 개발 계획서 - MeetFlow AI MVP

## 1. 목표 및 범위
- MVP 범위: 브라우저 녹음/파일 업로드 → 외부 STT API → 요약/Action Item 추출 → Supabase 저장 → 다이어그램 자동 생성 및 공유 링크 제공.
- 제외 범위: 이메일/Slack 자동 발송, 고급 권한 관리, 고급 모니터링. (Beta 이후)
- 핵심 지표: 업로드~결과 확인까지 5분 이내, 액션 아이템 편집 가능, 다이어그램 자동 생성.

## 2. 시스템 아키텍처
1. **클라이언트(Next.js on Vercel)**
   - 브라우저 MediaRecorder로 음성 캡처.
   - 업로드/편집/대시보드 UI.
2. **Vercel Serverless Functions**
   - `/api/upload`: 클라이언트 업로드를 Supabase Storage로 프록시.
   - `/api/transcribe`: STT API 호출, 상태 저장.
   - `/api/summary`: 전사 텍스트를 GPT 모델로 요약/Action 추출.
   - `/api/diagram`: 요약 결과 → Mermaid/Chart.js JSON 생성.
3. **Supabase**
   - Auth: 이메일 매직링크로 사용자 식별.
   - Postgres: 회의, 전사, 액션 아이템, 다이어그램 메타 저장.
   - Storage: 원본 음성, 다이어그램 이미지/파일 저장.
   - Edge Functions/Scheduled Jobs: 파일 만료, 장기 작업 폴링 Webhook.
4. **외부 STT/LLM API**
   - Whisper API(or AssemblyAI) for STT.
   - OpenAI GPT-4o mini for 요약/액션.

### 2.1 데이터 흐름
1. 사용자 로그인 → 회의 생성.
2. 음성 녹음 or 파일 업로드 → `/api/upload` → Supabase Storage URL.
3. 업로드 결과 ID로 `/api/transcribe` 호출 → STT API → 전사 결과 Supabase DB 저장.
4. 전사 완료 Webhook or 폴링 → `/api/summary` → 요약/Action 생성.
5. `/api/diagram` 함수에서 Mermaid/Chart.js 데이터 생성 → 이미지/JSON 저장.
6. 클라이언트는 Supabase Realtime/폴링으로 상태를 조회, 공유 링크 생성.

## 3. 데이터 모델 초안
- `users`: id, email, role, created_at.
- `meetings`: id, owner_id, title, scheduled_at, status(queued/processing/done), created_at.
- `recordings`: id, meeting_id, storage_path, duration, language, status, transcript_text.
- `summaries`: id, meeting_id, overview, decisions, discussions, created_by, updated_at.
- `action_items`: id, meeting_id, assignee, due_date, description, confidence, status.
- `diagrams`: id, meeting_id, type(timeline/mindmap), mermaid_source, asset_path, updated_at.
- RLS: 각 테이블은 owner/team 기반 정책 적용.

## 4. UI/UX 계획
1. **대시보드**: 최근 회의 카드 리스트(상태, 생성일, 요약 미리보기), "새 회의" CTA.
2. **녹음/업로드 화면**:
   - 녹음 컨트롤(녹음/일시정지/종료), 타이머.
   - 파일 업로드 드롭존, 지원 확장자 안내.
   - 업로드 후 STT 진행률 표시(폴링/실시간).
3. **결과 검토 화면**:
   - 전사 텍스트 뷰 + 키워드 검색.
   - 요약 섹션(개요/결정/논의) 편집 가능한 카드.
   - Action Item 테이블(책임자/마감일/상태), 인라인 편집.
   - 다이어그램 프리뷰(이미지 or 인터랙티브 뷰), 다운로드/링크 복사 버튼.
4. **공유 링크 뷰**:
   - 읽기 전용 요약/Action/다이어그램, 만료일 표기.
   - 비로그인 사용자도 접근 가능하도록 토큰화된 URL.

## 5. 프로세스 & 일정(예상 4주)
- Week 1: Vercel/Supabase 설정, Auth/DB 스키마, 업로드 API 도입.
- Week 2: STT 연동, 전사 상태관리, 요약/Action LLM 파이프라인.
- Week 3: 결과 편집 UI, 다이어그램 생성/렌더링, 공유 링크.
- Week 4: QA 및 성능 튜닝, 파일 만료 배치, 모니터링(로그/Sentry) 추가.

## 6. 기술 구현 세부 항목
- **녹음/업로드**: MediaRecorder → WAV Blob → chunk upload, Supabase Storage pre-signed URL 사용.
- **전사 파이프라인**: 업로드 후 즉시 `/api/transcribe` 트리거, STT 응답 대기시간이 길 경우 Supabase status=processing으로 두고 Edge Function에서 Webhook 처리.
- **요약/액션 프롬프트**: 회의 목적/언어 감지 후 템플릿 적용, 액션은 JSON Schema로 파싱해 DB 저장.
- **다이어그램 생성**: LLM 결과 → Mermaid DSL 제작, 서버에서 `@mermaid-js/mermaid-cli` 또는 cloud 렌더 API 호출, PNG 저장. 초기에는 클라이언트 사이드 렌더링으로 단순화 가능.
- **보안**: 모든 API는 Supabase 세션 토큰 검증, 업로드/다이어그램 링크는 만료시간/권한 체크. 환경변수는 Vercel env/Supabase secrets에 저장.

## 7. 테스트 전략
- 단위: LLM 프롬프트 파서, Action Item 유효성 검사, Supabase RLS 정책 테스트.
- 통합: 업로드→전사→요약 e2e 흐름을 stubs로 검증.
- UI: 주요 플로우에 Playwright 스모크 테스트.
- 모니터링: Supabase Edge Logs, Vercel Observability, Sentry.

## 8. 향후 확장 고려
- 이메일/Slack 알림을 위한 Notification Service 추상화.
- 다국어 지원을 위한 언어별 템플릿/모델 선택 로직.
- 팀 공유/권한 강화를 위해 Supabase Group/Role 모델 확장.
