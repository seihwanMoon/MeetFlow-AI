'use client';

import { useState } from 'react';
import { Recorder, type UploadResponse } from '@/components/Recorder';
import { PipelinePanel } from '@/components/PipelinePanel';
import { MeetingHistory } from '@/components/MeetingHistory';
import { SharePanel } from '@/components/SharePanel';

export function HomeClient() {
  const [meetingId, setMeetingId] = useState<string>('');
  const [recordingId, setRecordingId] = useState<string>('');
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const handleMeetingIdChange = (nextId: string) => {
    setMeetingId(nextId);
    setRecordingId('');
  };

  const handleUploadComplete = (payload: UploadResponse) => {
    setRecordingId(payload.recordingId);
    setMeetingId(payload.meetingId);
    setHistoryRefreshToken((token) => token + 1);
  };

  const handleSelectMeeting = (nextMeetingId: string, nextRecordingId?: string) => {
    setMeetingId(nextMeetingId);
    setRecordingId(nextRecordingId ?? '');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
        <section className="rounded-3xl bg-slate-900 px-8 py-12 text-white shadow-xl">
          <p className="text-sm uppercase tracking-widest text-slate-300">MeetFlow AI</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
            회의록을 실행으로 전환하는 AI 파이프라인
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-200">
            브라우저에서 바로 녹음하고, Supabase와 외부 STT/LLM을 통해 요약 · Action Item · 다이어그램을 자동 생성하세요.
          </p>
        </section>
        <div className="grid gap-6 lg:grid-cols-3">
          <MeetingHistory
            selectedMeetingId={meetingId}
            selectedRecordingId={recordingId}
            onSelect={handleSelectMeeting}
            refreshToken={historyRefreshToken}
          />
          <div className="space-y-6 lg:col-span-2">
            {meetingId ? (
              <>
                <Recorder
                  key={`recorder-${meetingId}`}
                  meetingId={meetingId}
                  onMeetingIdChange={handleMeetingIdChange}
                  onUploadComplete={handleUploadComplete}
                />
                <PipelinePanel
                  key={`pipeline-${meetingId}`}
                  meetingId={meetingId}
                  recordingId={recordingId}
                  onRecordingIdChange={setRecordingId}
                />
                <SharePanel key={`share-${meetingId}`} meetingId={meetingId} />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-600">
                회의 ID를 선택하거나 생성하면 녹음/파이프라인 기능을 사용할 수 있습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
