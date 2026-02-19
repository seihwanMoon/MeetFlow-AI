import { NextRequest, NextResponse } from 'next/server';
import { getSharePayload } from '@/lib/share';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: 'token이 필요합니다.' }, { status: 400 });
    }

    const payload = await getSharePayload(token);
    if (!payload) {
      return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[share-token:get] unexpected error', error);
    return NextResponse.json({ error: '공유 링크 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
