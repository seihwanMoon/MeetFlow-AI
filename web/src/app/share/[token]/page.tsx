import { notFound } from 'next/navigation';
import { getSharePayload } from '@/lib/share';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { env } from '@/lib/env';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

export default async function SharePage({ params }: { params: { token: string } }) {
  const payload = await getSharePayload(params.token);
  if (!payload) {
    notFound();
  }

  const { meeting, summary, actionItems, diagram, share } = payload;
  const shareUrl = env.APP_BASE_URL
    ? `${env.APP_BASE_URL.replace(/\/$/, '')}/share/${share.token}`
    : `/share/${share.token}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2 rounded-3xl bg-slate-900/60 p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">MeetFlow 공유 링크</p>
          <h1 className="text-2xl font-semibold">
            {meeting?.title && meeting?.title !== meeting?.id ? meeting.title : `회의 ${meeting?.id.slice(0, 8)}...`}
          </h1>
          <p className="text-sm text-slate-400">
            공유 ID: {share.token.slice(0, 8)}... · 만료: {share.expires_at ? formatDate(share.expires_at) : '설정 없음'}
          </p>
          <div className="text-xs text-slate-500">
            <p>회의 생성: {meeting?.created_at ? formatDate(meeting.created_at) : '-'}</p>
            <p>상태: {meeting?.status ?? 'unknown'}</p>
            <p>
              공유 URL:{' '}
              <span className="text-slate-300">{shareUrl || `/share/${share.token}`}</span>
            </p>
          </div>
        </header>

        <section className="space-y-4 rounded-2xl bg-white/5 p-6">
          <h2 className="text-lg font-semibold">개요</h2>
          {summary ? (
            <p className="whitespace-pre-line text-sm text-slate-200">{summary.overview || '개요가 없습니다.'}</p>
          ) : (
            <p className="text-sm text-slate-400">저장된 요약을 찾을 수 없습니다.</p>
          )}
        </section>

        {summary && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-2xl bg-white/5 p-6">
              <h3 className="text-base font-semibold">결정 사항</h3>
              {summary.decisions.length === 0 ? (
                <p className="text-sm text-slate-400">결정 사항이 없습니다.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                  {summary.decisions.map((item, idx) => (
                    <li key={`decision-${idx}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2 rounded-2xl bg-white/5 p-6">
              <h3 className="text-base font-semibold">논의 포인트</h3>
              {summary.discussions.length === 0 ? (
                <p className="text-sm text-slate-400">논의 포인트가 없습니다.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                  {summary.discussions.map((item, idx) => (
                    <li key={`discussion-${idx}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-2xl bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Action Items</h3>
            <span className="text-xs text-slate-400">총 {actionItems?.length ?? 0}건</span>
          </div>
          {actionItems && actionItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-2">설명</th>
                    <th className="py-2">담당자</th>
                    <th className="py-2">기한</th>
                    <th className="py-2">신뢰도</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {actionItems.map((item, idx) => (
                    <tr key={`action-${idx}`}>
                      <td className="py-2 pr-4 text-slate-200">{item.description || '-'}</td>
                      <td className="py-2 pr-4 text-slate-300">{item.assignee || '-'}</td>
                      <td className="py-2 pr-4 text-slate-300">{formatDate(item.due_date)}</td>
                      <td className="py-2 pr-4 text-slate-300">{item.confidence !== null ? `${Math.round((item.confidence ?? 0) * 100)}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Action Item이 없습니다.</p>
          )}
        </section>

        {diagram?.mermaid_source && (
          <section className="space-y-3 rounded-2xl bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Mermaid 다이어그램</h3>
              <span className="text-xs text-slate-400">업데이트: {formatDate(diagram.updated_at)}</span>
            </div>
            <div className="rounded-xl bg-white p-4 text-slate-900">
              <MermaidDiagram source={diagram.mermaid_source} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
