import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { summarizeTranscript, type SummaryResult } from '@/lib/summarizer';

async function persistSummary(meetingId: string, summary: SummaryResult) {
  const summaryPayload = {
    overview: summary.overview,
    decisions: summary.decisions.join('\n'),
    discussions: summary.discussions.join('\n'),
    updated_at: new Date().toISOString(),
  };

  const { data: existingSummary, error: existingSummaryError } = await supabaseAdmin
    .from('summaries')
    .select('id')
    .eq('meeting_id', meetingId)
    .maybeSingle();

  if (existingSummaryError && existingSummaryError.code !== 'PGRST116') {
    throw existingSummaryError;
  }

  if (existingSummary) {
    await supabaseAdmin.from('summaries').update(summaryPayload).eq('id', existingSummary.id);
  } else {
    await supabaseAdmin.from('summaries').insert({ meeting_id: meetingId, ...summaryPayload });
  }

  await supabaseAdmin.from('action_items').delete().eq('meeting_id', meetingId);

  if (summary.action_items?.length) {
    const rows = summary.action_items.map((item) => ({
      meeting_id: meetingId,
      assignee: item.assignee,
      due_date: item.due_date ?? null,
      description: item.description,
      confidence: item.confidence ?? 0,
      status: 'pending',
    }));
    await supabaseAdmin.from('action_items').insert(rows);
  }

  await supabaseAdmin.from('meetings').update({ status: 'summarized' }).eq('id', meetingId);
}

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

    await persistSummary(meetingId, summary);

    if (targetRecordingId) {
      await supabaseAdmin
        .from('recordings')
        .update({ status: 'summarized' })
        .eq('id', targetRecordingId);
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[summary] unexpected error', error);
    return NextResponse.json({ error: '요약 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, summary: summaryInput } = body ?? {};

    if (!meetingId || !summaryInput) {
      return NextResponse.json({ error: 'meetingId와 summary가 필요합니다.' }, { status: 400 });
    }

    const decisions = Array.isArray(summaryInput.decisions)
      ? summaryInput.decisions
          .map((item: unknown) => (typeof item === 'string' ? item : ''))
          .filter((item: string) => item.trim().length > 0)
      : [];
    const discussions = Array.isArray(summaryInput.discussions)
      ? summaryInput.discussions
          .map((item: unknown) => (typeof item === 'string' ? item : ''))
          .filter((item: string) => item.trim().length > 0)
      : [];
    const actionItems = Array.isArray(summaryInput.action_items)
      ? summaryInput.action_items
          .map((item: Record<string, unknown>) => ({
            description: typeof item?.description === 'string' ? item.description : '',
            assignee: typeof item?.assignee === 'string' ? item.assignee : '',
            due_date:
              typeof item?.due_date === 'string' && item.due_date.length > 0 ? item.due_date : null,
            confidence:
              typeof item?.confidence === 'number'
                ? Math.min(1, Math.max(0, item.confidence))
                : 0,
          }))
          .filter((item) => item.description.trim().length > 0)
      : [];

    const normalizedSummary: SummaryResult = {
      overview: typeof summaryInput.overview === 'string' ? summaryInput.overview : '',
      decisions,
      discussions,
      action_items: actionItems,
    };

    await persistSummary(meetingId, normalizedSummary);

    return NextResponse.json(normalizedSummary);
  } catch (error) {
    console.error('[summary:put] unexpected error', error);
    return NextResponse.json({ error: '요약 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
