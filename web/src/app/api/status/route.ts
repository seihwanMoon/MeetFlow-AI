import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidUUID } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const recordingId = searchParams.get('recordingId');

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    if (!isValidUUID(meetingId)) {
      return NextResponse.json({ error: 'meetingId는 UUID 형식이어야 합니다.' }, { status: 400 });
    }

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .select('id, status, created_at, scheduled_at')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingError) {
      console.error('[status] meeting fetch error', meetingError);
      return NextResponse.json({ error: '회의 정보를 불러올 수 없습니다.' }, { status: 500 });
    }

    const recordingQuery = supabaseAdmin
      .from('recordings')
      .select('id, status, created_at, storage_path, transcript_text')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    const { data: recordings, error: recordingError } = recordingId
      ? await recordingQuery.eq('id', recordingId)
      : await recordingQuery.limit(5);

    if (recordingError) {
      console.error('[status] recording fetch error', recordingError);
      return NextResponse.json({ error: 'recording 정보를 불러올 수 없습니다.' }, { status: 500 });
    }

    const { data: summary, error: summaryError } = await supabaseAdmin
      .from('summaries')
      .select('meeting_id, overview, decisions, discussions, updated_at')
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (summaryError) {
      console.error('[status] summary fetch error', summaryError);
    }

    const { data: actionItems, error: actionItemsError } = await supabaseAdmin
      .from('action_items')
      .select('id, assignee, due_date, description, confidence, status')
      .eq('meeting_id', meetingId);

    if (actionItemsError) {
      console.error('[status] action items fetch error', actionItemsError);
    }

    return NextResponse.json({
      meeting,
      recordings: recordings ?? [],
      summary,
      actionItems: actionItems ?? [],
    });
  } catch (error) {
    console.error('[status] unexpected error', error);
    return NextResponse.json({ error: '상태 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
