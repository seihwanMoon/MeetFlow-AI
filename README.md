# MeetFlow AI

## 공유 링크 & 유지보수 가이드

### 공유 링크 URL
- `.env`에 `NEXT_PUBLIC_APP_URL`을 설정하면 UI와 공유 페이지에서 항상 절대 경로를 사용합니다.
- 예) `NEXT_PUBLIC_APP_URL=https://app.meetflow.ai` → 복사되는 링크: `https://app.meetflow.ai/share/<token>`

### 파일 정리(Cleanup) Cron
1. `.env`에 `CRON_SECRET=<랜덤 토큰>`을 설정합니다.
2. Supabase에 `share_links` 테이블을 생성합니다. (`supabase/schema.sql` 참고)
3. Vercel Cron 또는 Supabase Scheduled Function에서 `POST /api/admin/cleanup` 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 포함합니다.
4. 기본으로 30일 이상 지난 recording/diagram 레코드를 제거하며, `FILE_RETENTION_DAYS` 환경변수로 기간을 조정할 수 있습니다.

## 배포 체크리스트
1. `npm run lint && npm run build`
2. 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `FILE_RETENTION_DAYS`(선택)
3. Vercel에 배포 후 `/api/share` 및 `/share/<token>` 페이지를 통해 공유 링크 동작 확인
