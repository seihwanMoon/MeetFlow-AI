# MeetFlow AI

회의 녹음/업로드 → STT 전사 → 요약/Action Item 추출 → Mermaid 다이어그램/공유 링크까지 자동화한 Next.js + Supabase 기반 MVP입니다.

## 주요 구성
- **Next.js(App Router)**: `web` 디렉터리, App Router + Server Actions 사용.
- **Supabase**: 인증, Postgres 스키마(`meetings`, `recordings`, `summaries`, `action_items`, `diagrams`, `share_links`), Storage.
- **OpenAI**: Whisper(전사), GPT-4o-mini(요약/Action Item).
- **공유/유지보수**: `/api/share`, `/share/[token]` 읽기 전용 페이지, `/api/admin/cleanup` 크론 엔드포인트.

## 개발 환경 세팅
```bash
cd web
npm install
cp .env.local.example .env.local   # 예시가 있다면
npm run dev
```

## 필수 환경 변수
| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 사용 |
| `SUPABASE_STORAGE_BUCKET` | 녹음 저장 버킷 (예: `recordings`) |
| `OPENAI_API_KEY` | Whisper / GPT 호출 |
| `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_SUMMARY_MODEL` | 모델명 지정(선택) |
| `NEXT_PUBLIC_APP_URL` | 공유 URL 생성 시 기준 도메인 |
| `CRON_SECRET` | `/api/admin/cleanup` 보호용 토큰 |
| `FILE_RETENTION_DAYS` | 정리 주기(기본 30) |

Supabase에는 `supabase/schema.sql`의 테이블을 적용해야 합니다. 특히 공유 기능의 `share_links` 테이블을 잊지 마세요.

## 공유 링크 가이드
- UI에서 링크 생성 시 `/share/<token>`이 발급됩니다.
- `.env`의 `NEXT_PUBLIC_APP_URL`을 설정하면 절대 경로로 복사됩니다.
- `/share/[token]`은 토큰만으로 읽기 전용 요약/Action Item/다이어그램을 보여줍니다.

## 파일 정리(Cleanup) Cron
1. `.env`에 `CRON_SECRET=<랜덤>`과 `FILE_RETENTION_DAYS`(선택)를 설정합니다.
2. Vercel Cron 또는 Supabase Schedule에서 `POST https://<도메인>/api/admin/cleanup` 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 포함합니다.
3. 기본으로 30일 지난 recordings/diagrams + Storage 객체를 삭제합니다.

## 배포 체크리스트
1. `npm run lint` → `npm run build`(네트워크 허용 환경) 검사.
2. Vercel Project Root 를 `web`으로 지정하고, 위의 env 변수를 Production/Preview/Development에 등록합니다.
3. Supabase `share_links` 테이블과 Storage 버킷 권한을 확인합니다.
4. 배포 후 `/api/share`로 링크 생성 → `/share/<token>` 확인 → `/api/admin/cleanup` 수동 요청 테스트.
