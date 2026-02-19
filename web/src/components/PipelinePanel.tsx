'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SummaryPoint, SummaryResult } from '@/lib/summarizer';
import { MermaidDiagram } from '@/components/MermaidDiagram';

type PipelinePanelProps = {
  meetingId: string;
  recordingId?: string | null;
  onRecordingIdChange?: (recordingId: string) => void;
  onSummaryReady?: (summary: SummaryResult) => void;
};

type TranscribeResponse = {
  meetingId: string;
  recordingId: string;
  transcriptText: string;
};

type StatusResponse = {
  meeting: { id: string; status: string; created_at: string; scheduled_at?: string | null } | null;
  recordings: Array<{ id: string; status: string; created_at: string; storage_path?: string; transcript_text?: string | null }>;
  summary: { meeting_id: string; overview?: string | null; decisions?: string | null; discussions?: string | null; updated_at?: string | null } | null;
  actionItems: Array<{ id: string; assignee: string | null; due_date: string | null; description: string | null; confidence: number | null; status: string | null }>;
};

type EditableActionItem = {
  description: string;
  assignee: string;
  due_date: string;
  confidence: number;
};

type EditableSummary = {
  overview: string;
  decisions: string[];
  discussions: string[];
  action_items: EditableActionItem[];
};

type TranscriptMatch = {
  index: number;
  excerpt: string;
};

const formatPoint = (entry: SummaryPoint) => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (entry && (entry.topic || entry.details)) {
    return [entry.topic, entry.details].filter(Boolean).join(': ');
  }
  return JSON.stringify(entry);
};

const parsePoints = (value: string | null | undefined): SummaryPoint[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[object')) {
    return [trimmed];
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as SummaryPoint[];
      }
      return [parsed as SummaryPoint];
    } catch (error) {
      console.error('[summary] JSON parse failed', error);
      return [trimmed];
    }
  }
  return trimmed
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
};

const escapeRegExp = (value: string) => value.replace(/[-\/\^$*+?.()|[\]{}]/g, '\$&');

const highlightWithTerm = (text: string, term: string) => {
  if (!term) return text;
  const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
  return text.split(regex).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={`${part}-${index}`} className="bg-amber-200 text-slate-900">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
};

const computeTranscriptMatches = (text: string, term: string): TranscriptMatch[] => {
  const keyword = term.trim();
  if (!keyword) return [];
  const lowerText = text.toLowerCase();
  const lowerTerm = keyword.toLowerCase();
  const matches: TranscriptMatch[] = [];
  let index = 0;
  while (index < lowerText.length) {
    const foundIndex = lowerText.indexOf(lowerTerm, index);
    if (foundIndex === -1) break;
    const start = Math.max(0, foundIndex - 40);
    const end = Math.min(text.length, foundIndex + keyword.length + 40);
    matches.push({ index: foundIndex, excerpt: text.slice(start, end) });
    index = foundIndex + lowerTerm.length;
  }
  return matches;
};

const toEditableSummary = (value: SummaryResult): EditableSummary => ({
  overview: value.overview ?? '',
  decisions: value.decisions.map((item) => formatPoint(item)),
  discussions: value.discussions.map((item) => formatPoint(item)),
  action_items:
    value.action_items?.map((item) => ({
      description: item.description ?? '',
      assignee: item.assignee ?? '',
      due_date: item.due_date ?? '',
      confidence: Math.round((item.confidence ?? 0) * 100),
    })) ?? [],
});

const fromEditableSummary = (value: EditableSummary): SummaryResult => ({
  overview: value.overview ?? '',
  decisions: value.decisions.filter((entry) => entry.trim().length > 0),
  discussions: value.discussions.filter((entry) => entry.trim().length > 0),
  action_items:
    value.action_items
      .map((item) => ({
        description: item.description.trim(),
        assignee: item.assignee.trim(),
        due_date: item.due_date ? item.due_date : null,
        confidence: Math.min(1, Math.max(0, (item.confidence ?? 0) / 100)),
      }))
      .filter((item) => item.description.length > 0),
});

export function PipelinePanel({
  meetingId,
  recordingId: propRecordingId,
  onRecordingIdChange,
  onSummaryReady,
}: PipelinePanelProps) {
  const [recordingId, setRecordingId] = useState(propRecordingId ?? '');
  const lastPropRecordingId = useRef<string | null>(propRecordingId ?? '');
  const activeMeetingRef = useRef<string>(meetingId);
  const [language, setLanguage] = useState<string>('ko');
  const [transcript, setTranscript] = useState('');
  const [transcriptMeetingId, setTranscriptMeetingId] = useState<string | null>(null);
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [transcriptDirty, setTranscriptDirty] = useState(false);
  const [transcriptDirtyMeetingId, setTranscriptDirtyMeetingId] = useState<string | null>(null);
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [transcriptSearchTerm, setTranscriptSearchTerm] = useState('');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryMeetingId, setSummaryMeetingId] = useState<string | null>(null);
  const [editableSummary, setEditableSummary] = useState<EditableSummary | null>(null);
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [summaryDirtyMeetingId, setSummaryDirtyMeetingId] = useState<string | null>(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [loading, setLoading] = useState<'transcribe' | 'summary' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastStatusFetch, setLastStatusFetch] = useState<string | null>(null);
  const [diagramSource, setDiagramSource] = useState<string>('');
  const [diagramStatus, setDiagramStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const transcriptMatches = useMemo(
    () => computeTranscriptMatches(transcript, transcriptSearchTerm),
    [transcript, transcriptSearchTerm],
  );
  const transcriptBelongsToCurrentMeeting = !transcriptMeetingId || transcriptMeetingId === meetingId;
  const transcriptValue = transcriptBelongsToCurrentMeeting ? transcript : '';
  const editableSummaryForMeeting = summaryMeetingId === meetingId ? editableSummary : null;

  const applyTranscriptFromServer = useCallback((value: string, sourceMeetingId?: string | null) => {
    setTranscript(value);
    const targetMeetingId =
      sourceMeetingId === null ? null : sourceMeetingId ?? activeMeetingRef.current ?? null;
    setTranscriptMeetingId(targetMeetingId);
    setOriginalTranscript(value);
    setTranscriptDirty(false);
    setTranscriptDirtyMeetingId(null);
  }, []);

  const updateEditableSummary = useCallback(
    (updater: (current: EditableSummary) => EditableSummary) => {
      setEditableSummary((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next !== prev) {
          setSummaryDirty(true);
          setSummaryDirtyMeetingId(meetingId);
        }
        return next;
      });
    },
    [meetingId],
  );

  useEffect(() => {
    if (propRecordingId !== lastPropRecordingId.current) {
      setRecordingId(propRecordingId ?? '');
      lastPropRecordingId.current = propRecordingId ?? '';
    }
  }, [propRecordingId]);

  useEffect(() => {
    activeMeetingRef.current = meetingId;
  }, [meetingId]);

  const syncRecordingId = useCallback(
    (value: string) => {
      setRecordingId(value);
      onRecordingIdChange?.(value);
    },
    [onRecordingIdChange],
  );

  useEffect(() => {
    applyTranscriptFromServer('', null);
    setSummary(null);
    setEditableSummary(null);
    setSummaryDirty(false);
    setSummaryDirtyMeetingId(null);
    setSummaryMeetingId(meetingId);
    setDiagramSource('');
    setDiagramStatus('idle');
    setTranscriptDirty(false);
    setTranscriptDirtyMeetingId(null);
  }, [applyTranscriptFromServer, meetingId]);

  const fetchStatus = useCallback(async () => {
    if (!meetingId) return;
    const requestedMeetingId = meetingId;
    try {
      setStatusError(null);
      const params = new URLSearchParams({ meetingId });
      if (recordingId) {
        params.set('recordingId', recordingId);
      }
      const response = await fetch(`/api/status?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '상태 조회 실패');
      }
      const data = (await response.json()) as StatusResponse;

      if (activeMeetingRef.current !== requestedMeetingId) {
        return;
      }

      setStatusInfo(data);
      setLastStatusFetch(new Date().toISOString());

      const firstWithTranscript = data.recordings.find((record) => record.transcript_text);
      const editingCurrentTranscript =
        transcriptDirty && transcriptDirtyMeetingId === requestedMeetingId;
      if (firstWithTranscript?.transcript_text && !editingCurrentTranscript) {
        applyTranscriptFromServer(firstWithTranscript.transcript_text, requestedMeetingId);
        syncRecordingId(firstWithTranscript.id);
      }

      const editingCurrentSummary = summaryDirty && summaryDirtyMeetingId === requestedMeetingId;
      if (data.summary && (data.summary.overview || data.summary.decisions || data.summary.discussions)) {
        if (!editingCurrentSummary) {
          const parsedSummary: SummaryResult = {
            overview: data.summary.overview ?? '',
            decisions: parsePoints(data.summary.decisions),
            discussions: parsePoints(data.summary.discussions),
            action_items: data.actionItems?.map((item) => ({
              description: item.description ?? '',
              assignee: item.assignee ?? '',
              due_date: item.due_date,
              confidence: item.confidence ?? 0,
            })) ?? [],
          };
          setSummary(parsedSummary);
          setEditableSummary(toEditableSummary(parsedSummary));
          setSummaryDirty(false);
          setSummaryMeetingId(requestedMeetingId);
        }
      } else if (!editingCurrentSummary) {
        setSummary(null);
        setEditableSummary(null);
        setSummaryDirty(false);
        setSummaryMeetingId(null);
        setSummaryDirtyMeetingId(null);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : '상태 조회 중 오류 발생');
    }
  }, [
    applyTranscriptFromServer,
    meetingId,
    recordingId,
    summaryDirty,
    summaryDirtyMeetingId,
    syncRecordingId,
    transcriptDirty,
    transcriptDirtyMeetingId,
  ]);

  useEffect(() => {
    if (!meetingId) return;
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus, meetingId]);

  const handleTranscribe = useCallback(async () => {
    if (!meetingId) {
      setError('회의 ID가 필요합니다.');
      return;
    }
    const requestedMeetingId = meetingId;
    setLoading('transcribe');
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          recordingId: recordingId || undefined,
          language,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '전사 요청 실패');
      }
      const data = (await response.json()) as TranscribeResponse;
      if (activeMeetingRef.current !== requestedMeetingId) {
        return;
      }
      syncRecordingId(data.recordingId);
      applyTranscriptFromServer(data.transcriptText, requestedMeetingId);
      setSuccessMessage('전사 완료');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전사 중 오류 발생');
    } finally {
      setLoading(null);
    }
  }, [applyTranscriptFromServer, fetchStatus, language, meetingId, recordingId, syncRecordingId]);

  const handleSummary = useCallback(async () => {
    if (!meetingId) {
      setError('회의 ID가 필요합니다.');
      return;
    }
    const requestedMeetingId = meetingId;
    setLoading('summary');
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          recordingId: recordingId || undefined,
          transcript: transcript || undefined,
          language,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '요약 생성 실패');
      }
      const data = (await response.json()) as SummaryResult;
      if (activeMeetingRef.current !== requestedMeetingId) {
        return;
      }
      setSummary(data);
      setEditableSummary(toEditableSummary(data));
      setSummaryDirty(false);
      setSummaryMeetingId(requestedMeetingId);
      setSummaryDirtyMeetingId(null);
      onSummaryReady?.(data);
      setSuccessMessage('요약/Action Item 생성 완료');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요약 중 오류 발생');
    } finally {
      setLoading(null);
    }
  }, [fetchStatus, language, meetingId, onSummaryReady, recordingId, transcript]);

  const handleDiagramGenerate = useCallback(async () => {
    if (!meetingId) {
      setDiagramStatus('error');
      setSuccessMessage('회의 ID가 필요합니다.');
      return;
    }
    const requestedMeetingId = meetingId;
    setDiagramStatus('loading');
    try {
      const response = await fetch('/api/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '다이어그램 생성 실패');
      }
      const data = (await response.json()) as { mermaid: string };
      if (activeMeetingRef.current !== requestedMeetingId) {
        return;
      }
      setDiagramSource(data.mermaid);
      setDiagramStatus('done');
      setSuccessMessage('Mermaid 다이어그램이 생성되었습니다.');
    } catch (err) {
      setDiagramStatus('error');
      setError(err instanceof Error ? err.message : '다이어그램 생성 중 오류 발생');
    }
  }, [meetingId]);

  const handleTranscriptSave = useCallback(async () => {
    if (!meetingId || !recordingId || !transcriptDirty) {
      return;
    }
    setTranscriptSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/transcript', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, recordingId, transcript }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '전사 저장 실패');
      }
      setOriginalTranscript(transcript);
      setTranscriptDirty(false);
      setTranscriptDirtyMeetingId(null);
      setTranscriptMeetingId(meetingId);
      setSuccessMessage('전사 내용이 저장되었습니다.');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전사 저장 중 오류 발생');
    } finally {
      setTranscriptSaving(false);
    }
  }, [fetchStatus, meetingId, recordingId, transcript, transcriptDirty]);

  const handleTranscriptReset = useCallback(() => {
    setTranscript(originalTranscript);
    setTranscriptDirty(false);
    setTranscriptDirtyMeetingId(null);
    setTranscriptMeetingId(meetingId);
  }, [meetingId, originalTranscript]);

  const handleSummarySave = useCallback(async () => {
    if (!meetingId || !editableSummaryForMeeting || !summaryDirty) {
      return;
    }
    const requestedMeetingId = meetingId;
    setSummarySaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = fromEditableSummary(editableSummaryForMeeting);
      const response = await fetch('/api/summary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, summary: payload }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '요약 저장 실패');
      }
      const data = (await response.json()) as SummaryResult;
      if (activeMeetingRef.current !== requestedMeetingId) {
        return;
      }
      setSummary(data);
      setEditableSummary(toEditableSummary(data));
      setSummaryDirty(false);
      setSummaryMeetingId(requestedMeetingId);
      setSummaryDirtyMeetingId(null);
      onSummaryReady?.(data);
      setSuccessMessage('요약이 저장되었습니다.');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요약 저장 중 오류 발생');
    } finally {
      setSummarySaving(false);
    }
  }, [editableSummaryForMeeting, fetchStatus, meetingId, onSummaryReady, summaryDirty]);

  const handleSummaryReset = useCallback(() => {
    if (!summary || summaryMeetingId !== meetingId) return;
    setEditableSummary(toEditableSummary(summary));
    setSummaryDirty(false);
    setSummaryDirtyMeetingId(null);
    setSummaryMeetingId(meetingId);
  }, [meetingId, summary, summaryMeetingId]);

  const handleDecisionChange = useCallback(
    (index: number, value: string) => {
      updateEditableSummary((current) => {
        const next = [...current.decisions];
        next[index] = value;
        return { ...current, decisions: next };
      });
    },
    [updateEditableSummary],
  );

  const handleDecisionRemove = useCallback(
    (index: number) => {
      updateEditableSummary((current) => ({
        ...current,
        decisions: current.decisions.filter((_, idx) => idx !== index),
      }));
    },
    [updateEditableSummary],
  );

  const handleDecisionAdd = useCallback(() => {
    updateEditableSummary((current) => ({
      ...current,
      decisions: [...current.decisions, ''],
    }));
  }, [updateEditableSummary]);

  const handleDiscussionChange = useCallback(
    (index: number, value: string) => {
      updateEditableSummary((current) => {
        const next = [...current.discussions];
        next[index] = value;
        return { ...current, discussions: next };
      });
    },
    [updateEditableSummary],
  );

  const handleDiscussionRemove = useCallback(
    (index: number) => {
      updateEditableSummary((current) => ({
        ...current,
        discussions: current.discussions.filter((_, idx) => idx !== index),
      }));
    },
    [updateEditableSummary],
  );

  const handleDiscussionAdd = useCallback(() => {
    updateEditableSummary((current) => ({
      ...current,
      discussions: [...current.discussions, ''],
    }));
  }, [updateEditableSummary]);

  const handleActionItemChange = useCallback(
    (index: number, field: keyof EditableActionItem, value: string) => {
      updateEditableSummary((current) => {
        const list = [...current.action_items];
        if (!list[index]) {
          return current;
        }
        const updated = { ...list[index] };
        if (field === 'confidence') {
          const numericValue = Number(value);
          updated.confidence = Number.isNaN(numericValue)
            ? 0
            : Math.max(0, Math.min(100, numericValue));
        } else if (field === 'due_date') {
          updated.due_date = value;
        } else if (field === 'assignee') {
          updated.assignee = value;
        } else if (field === 'description') {
          updated.description = value;
        }
        list[index] = updated;
        return { ...current, action_items: list };
      });
    },
    [updateEditableSummary],
  );

  const handleActionItemRemove = useCallback(
    (index: number) => {
      updateEditableSummary((current) => ({
        ...current,
        action_items: current.action_items.filter((_, idx) => idx !== index),
      }));
    },
    [updateEditableSummary],
  );

  const handleActionItemAdd = useCallback(() => {
    updateEditableSummary((current) => ({
      ...current,
      action_items: [
        ...current.action_items,
        { description: '', assignee: '', due_date: '', confidence: 50 },
      ],
    }));
  }, [updateEditableSummary]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">전사 · 요약 파이프라인</h2>
        <p className="text-sm text-slate-500">전사/요약을 순서대로 실행하고 결과를 확인하세요.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="recordingId">Recording ID</label>
          <input
            id="recordingId"
            type="text"
            value={recordingId}
            onChange={(event) => syncRecordingId(event.target.value)}
            placeholder="업로드 후 자동 세팅되며 직접 입력도 가능"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="language">언어</label>
          <input
            id="language"
            type="text"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="ko, en 등"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleTranscribe}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading === 'transcribe'}
        >
          {loading === 'transcribe' ? '전사 중...' : '전사 요청'}
        </button>
        <button
          type="button"
          onClick={handleSummary}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          disabled={loading === 'summary'}
        >
          {loading === 'summary' ? '요약 중...' : '요약/Action 생성'}
        </button>
        <button
          type="button"
          onClick={handleDiagramGenerate}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          disabled={diagramStatus === 'loading' || !meetingId}
        >
          {diagramStatus === 'loading' ? '다이어그램 생성 중...' : 'Mermaid 다이어그램 생성'}
        </button>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">상태 모니터링</p>
            <p className="text-xs text-slate-500">meetingId: {meetingId || '-'}</p>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
          >
            새로고침
          </button>
        </div>
        {statusError && <p className="mt-2 text-xs text-rose-600">{statusError}</p>}
        {statusInfo && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              회의 상태: <span className="font-semibold text-slate-800">{statusInfo.meeting?.status ?? 'unknown'}</span>
              {lastStatusFetch && ` · ${new Date(lastStatusFetch).toLocaleTimeString()}`}
            </p>
            <div className="space-y-1">
              {statusInfo.recordings.map((record) => (
                <div key={record.id} className="rounded-md bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                  <p className="font-semibold text-slate-800">Recording {record.id.slice(0, 8)}...</p>
                  <p>상태: {record.status}</p>
                  <p>업로드: {new Date(record.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            {statusInfo.summary && (
              <p className="text-xs text-slate-500">
                요약 업데이트: {statusInfo.summary.updated_at ? new Date(statusInfo.summary.updated_at).toLocaleString() : 'N/A'}
              </p>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-700">전사 결과</p>
            {transcriptValue && <span className="text-xs text-slate-500">{transcriptValue.length} chars</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTranscriptSave}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              disabled={!transcriptDirty || transcriptSaving || !recordingId}
            >
              {transcriptSaving ? '전사 저장 중...' : '전사 내용 저장'}
            </button>
            <button
              type="button"
              onClick={handleTranscriptReset}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
              disabled={!transcriptDirty}
            >
              변경 취소
            </button>
          </div>
        </div>
        <textarea
          className="h-40 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-slate-900 focus:outline-none"
          value={transcriptValue}
          onChange={(event) => {
            setTranscript(event.target.value);
            setTranscriptDirty(true);
            setTranscriptDirtyMeetingId(meetingId);
          }}
          placeholder="전사 결과가 여기에 표시됩니다."
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={transcriptSearchTerm}
            onChange={(event) => setTranscriptSearchTerm(event.target.value)}
            placeholder="키워드를 입력해 전사 텍스트에서 검색"
            className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>검색 결과: {transcriptMatches.length}건</span>
            {transcriptSearchTerm && (
              <button
                type="button"
                onClick={() => setTranscriptSearchTerm('')}
                className="text-slate-700 underline"
              >
                초기화
              </button>
            )}
          </div>
        </div>
        {transcriptSearchTerm && (
          <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {transcriptMatches.length === 0 ? (
              <p className="text-xs text-slate-500">일치하는 구문이 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {transcriptMatches.slice(0, 5).map((match, idx) => (
                  <li key={`match-${match.index}-${idx}`} className="rounded-md bg-white/80 p-2 shadow-sm">
                    <p className="text-[11px] text-slate-500">#{idx + 1} · 위치 {match.index}</p>
                    <p className="text-sm text-slate-700">{highlightWithTerm(match.excerpt, transcriptSearchTerm)}</p>
                  </li>
                ))}
              </ul>
            )}
            {transcriptMatches.length > 5 && (
              <p className="text-[11px] text-slate-500">+ {transcriptMatches.length - 5}건 더 있습니다.</p>
            )}
          </div>
        )}
      </div>
      {editableSummaryForMeeting ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">요약 · Action Item 편집</p>
              <p className="text-xs text-slate-500">LLM 결과를 직접 수정하고 저장할 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSummarySave}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!summaryDirty || summarySaving}
              >
                {summarySaving ? '요약 저장 중...' : '요약 저장'}
              </button>
              <button
                type="button"
                onClick={handleSummaryReset}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={!summaryDirty}
              >
                변경 취소
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="summary-overview">
              개요
            </label>
            <textarea
              id="summary-overview"
              className="min-h-[96px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-slate-900 focus:outline-none"
              value={editableSummaryForMeeting.overview}
              onChange={(event) =>
                updateEditableSummary((current) => ({
                  ...current,
                  overview: event.target.value,
                }))
              }
              placeholder="회의 개요를 입력하세요."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">결정 사항</p>
                <button
                  type="button"
                  onClick={handleDecisionAdd}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  항목 추가
                </button>
              </div>
              <div className="space-y-2">
                {editableSummaryForMeeting.decisions.length === 0 && (
                  <p className="text-xs text-slate-500">결정 사항이 없습니다.</p>
                )}
                {editableSummaryForMeeting.decisions.map((value, idx) => (
                  <div key={`decision-input-${idx}`} className="flex gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(event) => handleDecisionChange(idx, event.target.value)}
                      className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-sky-700 focus:border-slate-900 focus:outline-none"
                      placeholder={`결정 ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleDecisionRemove(idx)}
                      className="rounded-md border border-slate-200 px-2 text-xs text-slate-500"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">논의 포인트</p>
                <button
                  type="button"
                  onClick={handleDiscussionAdd}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  항목 추가
                </button>
              </div>
              <div className="space-y-2">
                {editableSummaryForMeeting.discussions.length === 0 && (
                  <p className="text-xs text-slate-500">논의 포인트가 없습니다.</p>
                )}
                {editableSummaryForMeeting.discussions.map((value, idx) => (
                  <div key={`discussion-input-${idx}`} className="flex gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(event) => handleDiscussionChange(idx, event.target.value)}
                      className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                      placeholder={`논의 ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleDiscussionRemove(idx)}
                      className="rounded-md border border-slate-200 px-2 text-xs text-slate-500"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Action Items</p>
              <button
                type="button"
                onClick={handleActionItemAdd}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                Action Item 추가
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2">설명</th>
                    <th className="py-2">담당자</th>
                    <th className="py-2">기한</th>
                    <th className="py-2">신뢰도(%)</th>
                    <th className="py-2" aria-label="행 제거" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editableSummaryForMeeting.action_items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-slate-500">
                        Action Item이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    editableSummaryForMeeting.action_items.map((item, idx) => (
                      <tr key={`action-edit-${idx}`}>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(event) => handleActionItemChange(idx, 'description', event.target.value)}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                            placeholder="설명"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={item.assignee}
                            onChange={(event) => handleActionItemChange(idx, 'assignee', event.target.value)}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                            placeholder="담당자"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={item.due_date}
                            onChange={(event) => handleActionItemChange(idx, 'due_date', event.target.value)}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.confidence}
                            onChange={(event) => handleActionItemChange(idx, 'confidence', event.target.value)}
                            className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleActionItemRemove(idx)}
                            className="rounded-md border border-slate-200 px-2 text-xs text-slate-500"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {diagramSource && (
            <div>
              <p className="text-sm font-semibold text-slate-800">Mermaid 다이어그램</p>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <MermaidDiagram source={diagramSource} />
                <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
                  {diagramSource}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          아직 저장된 요약 데이터가 없습니다. 전사를 완료하고 요약을 생성해 주세요.
        </div>
      )}
    </section>
  );
}
