import { randomBytes } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import type { SummaryPoint, SummaryResult } from './summarizer';

export type ShareLinkRow = {
  id: string;
  meeting_id: string;
  token: string;
  expires_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  disabled: boolean;
};

export type SharePayload = {
  share: ShareLinkRow;
  meeting: { id: string; title: string; created_at: string; status: string } | null;
  summary: SummaryResult | null;
  actionItems:
    | Array<{ description: string; assignee: string | null; due_date: string | null; confidence: number | null }>
    | null;
  diagram:
    | { id: string; type: string | null; mermaid_source: string | null; updated_at: string | null }
    | null;
};

export function generateShareToken() {
  return randomBytes(16).toString('hex');
}

const parsePoints = (value: string | null | undefined): SummaryPoint[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as SummaryPoint[];
      }
      return [parsed as SummaryPoint];
    } catch (error) {
      console.error('[share] JSON parse error', error);
      return trimmed
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return trimmed
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
};

export async function getSharePayload(token: string): Promise<SharePayload | null> {
  const { data: shareRow, error: shareError } = await supabaseAdmin
    .from('share_links')
    .select('*')
    .eq('token', token)
    .eq('disabled', false)
    .maybeSingle();

  if (shareError) {
    console.error('[share] share link fetch error', shareError);
    return null;
  }

  if (!shareRow) {
    return null;
  }

  if (shareRow.expires_at && new Date(shareRow.expires_at) < new Date()) {
    return null;
  }

  const { data: meeting } = await supabaseAdmin
    .from('meetings')
    .select('id, title, created_at, status')
    .eq('id', shareRow.meeting_id)
    .maybeSingle();

  const { data: summaryRow } = await supabaseAdmin
    .from('summaries')
    .select('overview, decisions, discussions')
    .eq('meeting_id', shareRow.meeting_id)
    .maybeSingle();

  const { data: actionItems } = await supabaseAdmin
    .from('action_items')
    .select('description, assignee, due_date, confidence')
    .eq('meeting_id', shareRow.meeting_id);

  const { data: diagram } = await supabaseAdmin
    .from('diagrams')
    .select('id, type, mermaid_source, updated_at')
    .eq('meeting_id', shareRow.meeting_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary: SummaryResult | null = summaryRow
    ? {
        overview: summaryRow.overview ?? '',
        decisions: parsePoints(summaryRow.decisions),
        discussions: parsePoints(summaryRow.discussions),
        action_items:
          actionItems?.map((item) => ({
            description: item.description ?? '',
            assignee: item.assignee ?? '',
            due_date: item.due_date,
            confidence: item.confidence ?? 0,
          })) ?? [],
      }
    : null;

  await supabaseAdmin
    .from('share_links')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', shareRow.id);

  return {
    share: shareRow as ShareLinkRow,
    meeting: meeting ?? null,
    summary,
    actionItems: actionItems ?? null,
    diagram: diagram ?? null,
  };
}
