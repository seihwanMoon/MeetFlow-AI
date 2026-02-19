# 진행 로그

## 2026-02-19
### 1단계 - Mermaid 다이어그램 생성 로직
- `buildMermaidDiagram`을 새로 구현해 개요/결정/논의/Action Item을 각각 허브 노드로 표현하고, 빈 목록일 때도 placeholder를 보여주도록 구성함.
- 문자열 길이 제한, 개행/따옴표 치환 등 sanitizing을 추가해 Mermaid 파싱 에러와 UI 깨짐을 방지함.
- `diagram_summary` 필드가 존재하면 별도 노드를 만들어 연결하도록 확장함.
- `npm run lint`로 App Router 전체에 대한 정적 검사를 수행해 타입/스타일 오류가 없음을 확인함.

### 회의 선택 시 요약 미갱신 버그 수정
- MeetingHistory에서 회의를 바꾸면 기존 fetch 응답이 늦게 도착해 이전 회의 개요가 다시 덮어씌워지는 문제를 `activeMeetingRef` 가드로 해결함.
- 부모 상태의 recordingId가 변경되거나 초기화될 때 항상 자식 입력이 동기화되도록 ref 기반 비교 로직을 추가해, 오래된 recordingId가 status 조회에 사용되지 않도록 조치함.
- `npm run lint`로 회귀 검사를 수행해 변경이 기존 규칙을 어기지 않는지 확인함.
- 요약/전사/다이어그램 API 응답도 meetingId 변경 여부를 확인한 뒤에만 상태를 갱신하도록 가드를 추가해, 회의 전환 중 늦게 도착한 응답이 이전 회의 개요를 덮어쓰는 문제를 근본적으로 차단함.

### 전사 검색/편집 및 요약 인라인 편집 UI 구현
- `PipelinePanel`에 전사 내용 수정/저장/되돌리기 버튼, 키워드 검색 및 일치 구간 미리보기 기능을 추가해 장문의 회의록도 빠르게 탐색할 수 있게 했음.
- 요약 개요·결정·논의·Action Item을 모두 인라인으로 편집하고 저장할 수 있는 폼을 구성하고, 변경 사항을 Supabase에 반영하는 `PUT /api/summary`를 추가함.
- 전사 텍스트를 DB에 즉시 반영하기 위한 `PUT /api/transcript` API를 신설해 사용자 편집 내용을 recordings 테이블에 기록함.
- fetchStatus 루틴과 요약/전사/다이어그램 핸들러에 meetingId 가드를 유지하면서도 로컬에서 편집 중일 때 자동 새로고침이 값을 덮어쓰지 않도록 dirty state 기반 조건을 적용함.
- 요약이 다른 회의로 전환해도 갱신되지 않던 문제를 해결하기 위해 `fetchStatus`에서 dirty 상태가 현재 회의에만 적용되도록 meetingId 비교 로직을 도입함. 이제 편집 중일 때만 값이 보호되고, 회의를 바꾸면 항상 최신 요약을 로드함.
- dirty 상태가 다른 회의에도 전파되어 요약이 갱신되지 않던 원인을 해결하기 위해 meeting별 dirty 추적(`summaryDirtyMeetingId`, `transcriptDirtyMeetingId`)을 도입하고, 새 회의를 선택했을 때 항상 최신 요약을 로드하도록 `fetchStatus` 조건을 수정함.
- Meeting 선택 시 `PipelinePanel`이 remount되도록 `key`를 부여해 회의별 상태가 완전히 초기화되며 요약/Action Item이 즉시 새 데이터를 반영하도록 함.
- 결정 사항 입력 필드의 폰트 컬러를 `text-sky-700`으로 지정해 기존 흰색 텍스트 가독성 문제를 해소함.
- 회의별 transcript/summary 소유 여부를 추적(`transcriptMeetingId`, `summaryMeetingId`)하고, 현재 선택한 회의와 일치할 때만 데이터를 렌더링하도록 변경해 다른 회의 선택 시 이전 요약이 남아 있는 문제를 제거함.
- `PipelinePanel`을 meetingId 기준으로 초기화하면서 summary edit state가 교차 회의로 전파되지 않도록 dirty ID 추적과 remount 키를 함께 적용함.

### 주요 이슈 정리
- "회의 전환 시 요약이 갱신되지 않는 문제"를 Core Issue로 분류하고, meeting별 상태 추적/컴포넌트 리마운트/dirty ID 가드 등으로 해결함. 향후 회의 전환 로직 변경 시 동일 이슈가 재발하지 않도록 테스트 케이스 및 코드 리뷰 항목에 포함 예정.

### 공유 링크 기능 구현
- Supabase `share_links` 테이블과 토큰 생성 유틸을 추가해 회의별 공유 링크를 저장/만료 관리하도록 설계함.
- `/api/share`(GET/POST/DELETE)와 `/api/share/[token]` 라우트를 구현해 링크 생성·목록 조회·비활성화 및 토큰 기반 데이터 조회를 지원함.
- `SharePanel` 컴포넌트를 통해 UI에서 공유 링크를 생성/복사/비활성화할 수 있게 하고, Home 화면에 통합함.
- 읽기 전용 페이지 `/share/[token]`을 추가해 개요, 결정/논의 포인트, Action Item, Mermaid 다이어그램을 비로그인 사용자도 확인할 수 있게 함.

### Week4 준비 - 파일 정리 & 공유 UX 개선
- `POST /api/admin/cleanup` 엔드포인트를 추가해 30일 이상 지난 녹음/다이어그램을 삭제하고, `CRON_SECRET` 기반으로 보호함. Vercel/Supabase Cron에 바로 붙일 수 있도록 응답에 삭제 수치를 포함함.
- 공유 패널이 절대 URL을 표시/복사하도록 개선하고, 공유 페이지(`/share/[token]`)에 회의 메타데이터와 전체 링크를 노출해 외부 사용자 경험을 보강함.
- `README.md`에 환경 변수 및 배포 체크리스트, Cleanup Cron 설정법을 문서화해 실제 배포 전에 확인해야 할 항목을 정리함.

### 개발 완료 기능 요약 (2026-02-19)
- 브라우저 녹음/파일 업로드 → `/api/upload` → `/api/transcribe` → `/api/summary` → `/api/diagram`까지 STT/요약/다이어그램 파이프라인을 구축하고, `PipelinePanel`에서 상태 조회·편집·다이어그램 미리보기를 제공함.
- 회의 히스토리·녹음 선택·전사 키워드 검색·요약/Action Item 인라인 편집 UI를 완성했고, Supabase `summaries`/`action_items` 테이블에 결과를 저장하도록 연동함.
- 공유 기능: `share_links` 테이블, `/api/share` CRUD, `/share/[token]` 읽기 전용 페이지, `SharePanel` UI를 구현해 토큰 기반으로 회의를 외부에 전달할 수 있도록 함.
- 유지보수: `/api/admin/cleanup` 크론 엔드포인트, `CRON_SECRET` 인증, `README`/DEV_PLAN 배포 가이드 등 운영 문서를 정비함.
- Vercel 배포 완료(Next.js 16, Turbopack) 및 환경 변수/빌드 설정을 맞춰 실제 URL에서 모든 기능이 동작하도록 검증함.
- SharePanel 복사 버튼이 브라우저 권한 정책에 막히는 사례를 위해 Clipboard API 실패 시 `document.execCommand('copy')` 기반 폴백을 추가해 어떤 환경에서도 링크 복사가 가능하도록 함.
- 회의 전환 시 SharePanel과 PipelinePanel이 완전히 초기화되도록 각각 `key`와 상태 리셋을 적용해 요약/공유 링크가 즉시 새 회의 데이터로 갱신되도록 함.
