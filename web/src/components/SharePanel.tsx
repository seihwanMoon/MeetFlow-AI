'use client';

import { useCallback, useEffect, useState } from 'react';

export type ShareLink = {
  id: string;
  token: string;
  sharePath: string;
  created_at: string;
  expires_at: string | null;
  last_accessed_at: string | null;
  disabled: boolean;
  isExpired: boolean;
};

type SharePanelProps = {
  meetingId: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

export function SharePanel({ meetingId }: SharePanelProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/share?meetingId=${meetingId}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '공유 링크를 불러오지 못했습니다.');
      }
      const data = (await response.json()) as { links: ShareLink[] };
      setLinks(data.links || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 링크를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    setLinks([]);
    setCopyMessage(null);
    fetchLinks();
  }, [fetchLinks]);

  const handleCreate = async () => {
    if (!meetingId) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '공유 링크 생성 실패');
      }
      await fetchLinks();
      setCopyMessage('새 공유 링크가 생성되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 링크 생성 중 오류 발생');
    } finally {
      setCreating(false);
      setTimeout(() => setCopyMessage(null), 3000);
    }
  };

  const buildUrl = (sharePath: string) => {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL}${sharePath}`;
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${sharePath}`;
    }
    return sharePath;
  };

  const fallbackCopy = (text: string) => {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  };

  const handleCopy = async (sharePath: string) => {
    try {
      const url = buildUrl(sharePath);
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        fallbackCopy(url);
      }
      setCopyMessage('링크가 복사되었습니다.');
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error('[share] clipboard API failed, fallback copy', err);
      const url = buildUrl(sharePath);
      if (fallbackCopy(url)) {
        setCopyMessage('링크가 복사되었습니다.');
      } else {
        setCopyMessage('복사에 실패했습니다.');
      }
      setTimeout(() => setCopyMessage(null), 2000);
    }
  };

  const handleDisable = async (token: string) => {
    if (!window.confirm('이 공유 링크를 비활성화할까요?')) return;
    try {
      const response = await fetch('/api/share', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? '비활성화 실패');
      }
      fetchLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 링크 비활성화 중 오류');
    }
  };

  if (!meetingId) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        회의를 선택하면 공유 링크를 관리할 수 있습니다.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">공유 링크</h2>
          <p className="text-xs text-slate-500">토큰 기반 읽기 전용 링크를 생성해 회의를 공유하세요.</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {creating ? '생성 중...' : '새 링크 생성'}
        </button>
      </header>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {copyMessage && <p className="text-sm text-emerald-600">{copyMessage}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-slate-500">아직 생성된 공유 링크가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{buildUrl(link.sharePath)}</p>
                  <p className="text-xs text-slate-500">
                    생성: {formatDate(link.created_at)} · 만료: {link.expires_at ? formatDate(link.expires_at) : '설정 없음'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(link.sharePath)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisable(link.token)}
                    disabled={link.disabled || link.isExpired}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-50"
                  >
                    비활성화
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                상태:{' '}
                {link.disabled
                  ? '비활성화'
                  : link.isExpired
                    ? '만료됨'
                    : link.last_accessed_at
                      ? `최근 조회 ${formatDate(link.last_accessed_at)}`
                      : '조회 이력 없음'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
