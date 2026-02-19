import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, recordingId, transcript } = body ?? {};

    if (!recordingId || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'recordingId와 transcript가 필요합니다.' }, { status: 400 });
    }

    const { data: recordingRow, error: recordingError } = await supabaseAdmin
      .from('recordings')
      .select('id, meeting_id')
      .eq('id', recordingId)
      .maybeSingle();

    if (recordingError || !recordingRow) {
      return NextResponse.json({ error: 'recording을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (meetingId && recordingRow.meeting_id !== meetingId) {
      return NextResponse.json({ error: 'meetingId와 recordingId가 일치하지 않습니다.' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('recordings')
      .update({ transcript_text: transcript, status: 'transcribed' })
      .eq('id', recordingId);

    if (updateError) {
      console.error('[transcript] update error', updateError);
      return NextResponse.json({ error: '전사 내용을 저장하지 못했습니다.' }, { status: 500 });
    }

    if (recordingRow.meeting_id) {
      await supabaseAdmin.from('meetings').update({ status: 'transcribed' }).eq('id', recordingRow.meeting_id);
    }

    return NextResponse.json({ recordingId, meetingId: recordingRow.meeting_id, transcript });
  } catch (error) {
    console.error('[transcript] unexpected error', error);
    return NextResponse.json({ error: '전사 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
