'use client';

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { generateMeetingId } from '@/lib/id';

export type UploadResponse = {
  meetingId: string;
  recordingId: string;
  path: string;
  publicUrl?: string;
};

type RecorderProps = {
  meetingId: string;
  onMeetingIdChange: (meetingId: string) => void;
  onUploadComplete?: (payload: UploadResponse) => void;
};

export function Recorder({ meetingId, onMeetingIdChange, onUploadComplete }: RecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState<string>('녹음을 시작하세요.');
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const meetingIdHint = useMemo(() => meetingId.slice(0, 8), [meetingId]);

  const resetRecorder = useCallback(() => {
    chunksRef.current = [];
    setAudioUrl(null);
    setUploadResult(null);
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, filename: string) => {
      setStatus('업로드 중...');
      setError(null);
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('meetingId', meetingId);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '업로드 실패');
      }

      const data = (await response.json()) as UploadResponse;
      setUploadResult(data);
      onUploadComplete?.(data);
      setStatus('업로드 완료. 전사를 요청하세요.');
    },
    [meetingId, onUploadComplete],
  );

  const startRecording = useCallback(async () => {
    if (!meetingId) {
      setError('회의 ID가 없습니다. ID를 생성하거나 입력하세요.');
      return;
    }
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        try {
          await uploadBlob(blob, `recording-${Date.now()}.webm`);
        } catch (err) {
          setError(err instanceof Error ? err.message : '업로드 중 오류 발생');
          setStatus('업로드 실패');
        }
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setStatus('녹음 중...');
      resetRecorder();
    } catch (err) {
      setError(err instanceof Error ? err.message : '마이크 접근 실패');
    }
  }, [meetingId, resetRecorder, uploadBlob]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setStatus('녹음 종료. 처리 중...');
  }, []);

  const pauseRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      setStatus('일시 정지됨.');
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      setStatus('녹음 재개.');
    }
  }, []);

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      resetRecorder();
      setAudioUrl(URL.createObjectURL(file));
      try {
        await uploadBlob(file, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : '업로드 중 오류 발생');
        setStatus('업로드 실패');
      }
    },
    [resetRecorder, uploadBlob],
  );

  const handleGenerateMeetingId = useCallback(() => {
    const newId = generateMeetingId();
    onMeetingIdChange(newId);
    setStatus('새로운 회의 ID가 생성되었습니다.');
  }, [onMeetingIdChange]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">회의 녹음/업로드</h2>
        <p className="text-sm text-slate-500">브라우저에서 직접 녹음하거나 완료된 파일을 업로드하세요.</p>
      </header>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="meetingId">
          회의 ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="meetingId"
            type="text"
            value={meetingId}
            onChange={(event) => onMeetingIdChange(event.target.value)}
            placeholder="UUID 형식"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleGenerateMeetingId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            ID 생성
          </button>
        </div>
        <p className="text-xs text-slate-500">예: {meetingIdHint}-xxxx-xxxx</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startRecording}
          disabled={isRecording}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          녹음 시작
        </button>
        <button
          type="button"
          onClick={pauseRecording}
          disabled={!isRecording}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          {isPaused ? '재개' : '일시정지'}
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={!isRecording}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          녹음 종료
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          파일 업로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
      <p className="text-sm text-slate-600">{status}</p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {audioUrl && (
        <audio controls src={audioUrl} className="w-full" />
      )}
      {uploadResult && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold">업로드 완료</p>
          <p>Recording ID: {uploadResult.recordingId}</p>
          <p>경로: {uploadResult.path}</p>
          {uploadResult.publicUrl && (
            <a href={uploadResult.publicUrl} className="text-slate-900 underline" target="_blank" rel="noreferrer">
              공유 링크 열기
            </a>
          )}
        </div>
      )}
    </section>
  );
}
