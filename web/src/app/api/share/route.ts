import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateShareToken } from '@/lib/share';
import { isValidUUID } from '@/lib/validation';

const DEFAULT_EXPIRY_HOURS = 24 * 7;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    if (!meetingId || !isValidUUID(meetingId)) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('share_links')
      .select('id, meeting_id, token, expires_at, created_at, last_accessed_at, disabled')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[share:get] fetch error', error);
      return NextResponse.json({ error: '공유 링크 목록을 불러오지 못했습니다.' }, { status: 500 });
    }

    const links = (data ?? []).map((link) => ({
      ...link,
      sharePath: `/share/${link.token}`,
      isExpired: link.expires_at ? new Date(link.expires_at) < new Date() : false,
    }));

    return NextResponse.json({ links });
  } catch (error) {
    console.error('[share:get] unexpected error', error);
    return NextResponse.json({ error: '공유 링크 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, expiresInHours }: { meetingId?: string; expiresInHours?: number } = body ?? {};

    if (!meetingId || !isValidUUID(meetingId)) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .select('id')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: '회의를 찾을 수 없습니다.' }, { status: 404 });
    }

    const token = generateShareToken();
    const expireHours = typeof expiresInHours === 'number' && expiresInHours > 0 ? expiresInHours : DEFAULT_EXPIRY_HOURS;
    const expiresAt = new Date(Date.now() + expireHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('share_links')
      .insert({ meeting_id: meetingId, token, expires_at: expiresAt })
      .select('id, meeting_id, token, expires_at, created_at, last_accessed_at, disabled')
      .single();

    if (error || !data) {
      console.error('[share:post] insert error', error);
      return NextResponse.json({ error: '공유 링크를 생성하지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      link: {
        ...data,
        sharePath: `/share/${data.token}`,
        isExpired: false,
      },
    });
  } catch (error) {
    console.error('[share:post] unexpected error', error);
    return NextResponse.json({ error: '공유 링크 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body ?? {};
    if (typeof token !== 'string' || token.length === 0) {
      return NextResponse.json({ error: 'token이 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('share_links')
      .update({ disabled: true })
      .eq('token', token)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[share:delete] update error', error);
      return NextResponse.json({ error: '공유 링크를 비활성화하지 못했습니다.' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[share:delete] unexpected error', error);
    return NextResponse.json({ error: '공유 링크 비활성화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
