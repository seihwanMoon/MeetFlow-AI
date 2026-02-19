import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { summarizeTranscript } from '@/lib/summarizer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, recordingId, transcript, language } = body ?? {};

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    let transcriptText: string | null = transcript ?? null;
    let targetRecordingId: string | undefined = recordingId;

    if (!transcriptText) {
      const query = supabaseAdmin
        .from('recordings')
        .select('id, transcript_text')
        .eq('meeting_id', meetingId)
        .filter('transcript_text', 'not.is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data, error } = targetRecordingId
        ? await query.eq('id', targetRecordingId).maybeSingle()
        : await query.maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: '전사된 텍스트를 찾을 수 없습니다.' }, { status: 400 });
      }

      targetRecordingId = data.id;
      transcriptText = data.transcript_text;
    }

    if (!transcriptText) {
      return NextResponse.json({ error: '전사 텍스트가 비어있습니다.' }, { status: 400 });
    }

    const summary = await summarizeTranscript(transcriptText, { meetingId, language });

    await supabaseAdmin
      .from('summaries')
      .upsert({
        meeting_id: meetingId,
        overview: summary.overview,
        decisions: summary.decisions.join('\n'),
        discussions: summary.discussions.join('\n'),
      }, { onConflict: 'meeting_id' });

    await supabaseAdmin.from('action_items').delete().eq('meeting_id', meetingId);

    if (summary.action_items?.length) {
      const rows = summary.action_items.map((item) => ({
        meeting_id: meetingId,
        assignee: item.assignee,
        due_date: item.due_date ?? null,
        description: item.description,
        confidence: item.confidence,
        status: 'pending',
      }));
      await supabaseAdmin.from('action_items').insert(rows);
    }

    if (targetRecordingId) {
      await supabaseAdmin
        .from('recordings')
        .update({ status: 'summarized' })
        .eq('id', targetRecordingId);
    }

    await supabaseAdmin.from('meetings').update({ status: 'summarized' }).eq('id', meetingId);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[summary] unexpected error', error);
    return NextResponse.json({ error: '요약 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
