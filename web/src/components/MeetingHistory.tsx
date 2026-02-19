'use client';

import { useCallback, useEffect, useState } from 'react';
import { generateMeetingId } from '@/lib/id';

type MeetingRecord = {
  id: string;
  created_at: string;
  status: string;
  storage_path?: string | null;
};

type Meeting = {
  id: string;
  title: string;
  created_at: string;
  status: string;
  recordings?: MeetingRecord[];
};

type Props = {
  selectedMeetingId: string;
  selectedRecordingId?: string | null;
  onSelect: (meetingId: string, recordingId?: string) => void;
  refreshToken: number;
};

export function MeetingHistory({ selectedMeetingId, selectedRecordingId, onSelect, refreshToken }: Props) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/meetings');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '회의 목록 불러오기 실패');
      }
      const data = (await response.json()) as { meetings: Meeting[] };
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회의 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings, refreshToken]);

  const handleNewMeeting = () => {
    const newId = generateMeetingId();
    onSelect(newId);
  };

  const renderMeetingTitle = (meeting: Meeting) => {
    if (meeting.title && meeting.title !== meeting.id) return meeting.title;
    return `회의 ${meeting.id.slice(0, 8)}...`;
  };

  const getRecordingName = (recording: MeetingRecord, index: number) => {
    if (recording.storage_path) {
      const segments = recording.storage_path.split('/');
      const fileName = segments[segments.length - 1];
      if (fileName) {
        return fileName;
      }
    }
    return `녹음 ${index + 1}`;
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">최근 회의</h2>
          <p className="text-sm text-slate-500">업로드한 회의/전사 내역을 선택하면 이어서 작업할 수 있습니다.</p>
        </div>
        <button
          type="button"
          onClick={handleNewMeeting}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          새 회의 ID
        </button>
      </header>
      {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!loading && meetings.length === 0 && (
        <p className="text-sm text-slate-500">아직 저장된 회의가 없습니다. 녹음/업로드를 진행해 주세요.</p>
      )}
      <ul className="space-y-2">
        {meetings.map((meeting) => {
          const latestRecording = meeting.recordings?.[0];
          const isSelectedMeeting = selectedMeetingId === meeting.id;
          return (
            <li key={meeting.id}>
              <button
                type="button"
                onClick={() => onSelect(meeting.id, latestRecording?.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  isSelectedMeeting
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                }`}
              >
                <p className="font-semibold">{renderMeetingTitle(meeting)}</p>
                <p className={`text-xs ${isSelectedMeeting ? 'text-slate-200' : 'text-slate-500'}`}>
                  {new Date(meeting.created_at).toLocaleString()} · 상태: {meeting.status}
                </p>
              </button>
              {meeting.recordings && meeting.recordings.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                  {meeting.recordings.map((record, idx) => {
                    const isSelectedRecording = isSelectedMeeting && selectedRecordingId === record.id;
                    return (
                      <li key={record.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(meeting.id, record.id)}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition ${
                            isSelectedRecording
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate text-xs font-medium">{getRecordingName(record, idx)}</span>
                          <span className="text-[10px] opacity-80">
                            {new Date(record.created_at).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={fetchMeetings}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
      >
        새로고침
      </button>
    </section>
  );
}
