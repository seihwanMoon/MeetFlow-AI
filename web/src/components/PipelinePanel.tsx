'use client';

import { useCallback, useEffect, useState } from 'react';
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
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as SummaryPoint[];
      }
      return [parsed as SummaryPoint];
    } catch (error) {
      console.error('[summary] JSON parse failed', error);
    }
  }
  return trimmed
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
};

export function PipelinePanel({
  meetingId,
  recordingId: propRecordingId,
  onRecordingIdChange,
  onSummaryReady,
}: PipelinePanelProps) {
  const [recordingId, setRecordingId] = useState(propRecordingId ?? '');
  const [language, setLanguage] = useState<string>('ko');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState<'transcribe' | 'summary' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastStatusFetch, setLastStatusFetch] = useState<string | null>(null);
  const [diagramSource, setDiagramSource] = useState<string>('');
  const [diagramStatus, setDiagramStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');

  useEffect(() => {
    if (propRecordingId && propRecordingId !== recordingId) {
      setRecordingId(propRecordingId);
    }
  }, [propRecordingId, recordingId]);

  const syncRecordingId = useCallback(
    (value: string) => {
      setRecordingId(value);
      onRecordingIdChange?.(value);
    },
    [onRecordingIdChange],
  );

  useEffect(() => {
    setTranscript('');
    setSummary(null);
    setDiagramSource('');
    setDiagramStatus('idle');
  }, [meetingId]);

  const fetchStatus = useCallback(async () => {
    if (!meetingId) return;
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
      setStatusInfo(data);
      setLastStatusFetch(new Date().toISOString());

      const firstWithTranscript = data.recordings.find((record) => record.transcript_text);
      if (firstWithTranscript?.transcript_text) {
        setTranscript(firstWithTranscript.transcript_text);
        syncRecordingId(firstWithTranscript.id);
      }

      if (data.summary && (data.summary.overview || data.summary.decisions || data.summary.discussions)) {
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
      } else {
        setSummary(null);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : '상태 조회 중 오류 발생');
    }
  }, [meetingId, recordingId, syncRecordingId]);

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
      syncRecordingId(data.recordingId);
      setTranscript(data.transcriptText);
      setSuccessMessage('전사 완료');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전사 중 오류 발생');
    } finally {
      setLoading(null);
    }
  }, [fetchStatus, language, meetingId, recordingId, syncRecordingId]);

  const handleSummary = useCallback(async () => {
    if (!meetingId) {
      setError('회의 ID가 필요합니다.');
      return;
    }
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
      setSummary(data);
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
      setDiagramSource(data.mermaid);
      setDiagramStatus('done');
      setSuccessMessage('Mermaid 다이어그램이 생성되었습니다.');
    } catch (err) {
      setDiagramStatus('error');
      setError(err instanceof Error ? err.message : '다이어그램 생성 중 오류 발생');
    }
  }, [meetingId]);

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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">전사 결과</p>
          {transcript && <span className="text-xs text-slate-500">{transcript.length} chars</span>}
        </div>
        <textarea
          className="h-32 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 focus:outline-none"
          value={transcript}
          readOnly
          placeholder="전사 결과가 여기에 표시됩니다."
        />
      </div>
      {summary && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">개요</p>
            <p className="text-sm text-slate-600 whitespace-pre-line">{summary.overview}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">결정 사항</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {summary.decisions.map((item, idx) => (
                  <li key={`decision-${idx}`}>{formatPoint(item)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">논의 포인트</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {summary.discussions.map((item, idx) => (
                  <li key={`discussion-${idx}`}>{formatPoint(item)}</li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Action Items</p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2">설명</th>
                    <th className="py-2">담당자</th>
                    <th className="py-2">기한</th>
                    <th className="py-2">신뢰도</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.action_items.map((item, idx) => (
                    <tr key={`action-${idx}`}>
                      <td className="py-2 pr-2 text-slate-700">{item.description}</td>
                      <td className="py-2 pr-2 text-slate-600">{item.assignee || '-'}</td>
                      <td className="py-2 pr-2 text-slate-600">{item.due_date ?? '-'}</td>
                      <td className="py-2 text-slate-600">{Math.round(item.confidence * 100)}%</td>
                    </tr>
                  ))}
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
      )}
    </section>
  );
}
