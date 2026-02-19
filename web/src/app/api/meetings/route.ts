import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const PAGE_SIZE = 20;

type RecordingRow = {
  id: string;
  meeting_id: string;
  created_at: string;
  status: string;
  storage_path?: string | null;
};

export async function GET() {
  try {
    const { data: meetings, error } = await supabaseAdmin
      .from('meetings')
      .select('id, title, created_at, status')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('[meetings] fetch error', error);
      return NextResponse.json({ error: '회의 목록을 가져오지 못했습니다.' }, { status: 500 });
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({ meetings: [] });
    }

    const meetingIds = meetings.map((meeting) => meeting.id);
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('id, meeting_id, created_at, status, storage_path')
      .in('meeting_id', meetingIds)
      .order('created_at', { ascending: false });

    if (recordingsError) {
      console.error('[meetings] recordings fetch error', recordingsError);
      return NextResponse.json({ error: '녹음 목록을 가져오지 못했습니다.' }, { status: 500 });
    }

    const grouped: Record<string, RecordingRow[]> = {};
    recordings?.forEach((record) => {
      if (!grouped[record.meeting_id]) {
        grouped[record.meeting_id] = [];
      }
      grouped[record.meeting_id]?.push(record);
    });

    const result = meetings.map((meeting) => ({
      ...meeting,
      recordings: grouped[meeting.id] ?? [],
    }));

    return NextResponse.json({ meetings: result });
  } catch (error) {
    console.error('[meetings] unexpected error', error);
    return NextResponse.json({ error: '회의 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
