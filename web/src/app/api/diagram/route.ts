import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildMermaidDiagram } from '@/lib/diagram';
import type { SummaryResult } from '@/lib/summarizer';

const parseField = (value: string | null): SummaryResult['decisions'] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[object')) {
    return [trimmed];
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error('[diagram] parse field error', error);
      return [trimmed];
    }
  }
  return trimmed.split('\n').map((item) => item.trim()).filter(Boolean);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, summary } = body ?? {};
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    let summaryData: SummaryResult | null = summary ?? null;
    if (!summaryData) {
      const { data: summaryRow, error: summaryError } = await supabaseAdmin
        .from('summaries')
        .select('overview, decisions, discussions')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (summaryError || !summaryRow) {
        return NextResponse.json({ error: '저장된 요약을 불러오지 못했습니다.' }, { status: 400 });
      }

      const { data: actionItems, error: aiError } = await supabaseAdmin
        .from('action_items')
        .select('assignee, due_date, description, confidence')
        .eq('meeting_id', meetingId);

      if (aiError) {
        console.error('[diagram] action items fetch error', aiError);
        return NextResponse.json({ error: 'Action Item을 불러오지 못했습니다.' }, { status: 500 });
      }

      summaryData = {
        overview: summaryRow.overview ?? '',
        decisions: parseField(summaryRow.decisions ?? null),
        discussions: parseField(summaryRow.discussions ?? null),
        action_items:
          actionItems?.map((item) => ({
            description: item.description ?? '',
            assignee: item.assignee ?? '',
            due_date: item.due_date,
            confidence: item.confidence ?? 0,
          })) ?? [],
      };
    }

    const mermaidSource = buildMermaidDiagram(summaryData);

    const { data: existingDiagram, error: existingDiagramError } = await supabaseAdmin
      .from('diagrams')
      .select('id')
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (existingDiagramError && existingDiagramError.code !== 'PGRST116') {
      console.error('[diagram] fetch existing error', existingDiagramError);
      return NextResponse.json({ error: '기존 다이어그램 확인 실패' }, { status: 500 });
    }

    if (existingDiagram) {
      await supabaseAdmin
        .from('diagrams')
        .update({ mermaid_source: mermaidSource, updated_at: new Date().toISOString() })
        .eq('id', existingDiagram.id);
    } else {
      await supabaseAdmin
        .from('diagrams')
        .insert({ meeting_id: meetingId, type: 'summary', mermaid_source: mermaidSource });
    }

    return NextResponse.json({ meetingId, mermaid: mermaidSource });
  } catch (error) {
    console.error('[diagram] unexpected error', error);
    return NextResponse.json({ error: '다이어그램 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
