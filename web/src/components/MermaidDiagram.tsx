'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

type MermaidDiagramProps = {
  source: string;
};

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    const renderDiagram = async () => {
      if (!containerRef.current) return;
      try {
        const { svg } = await mermaid.render(`diagram-${Date.now()}`, source);
        if (!cancelled) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        console.error('[mermaid] render error', err);
        if (!cancelled) {
          setError('다이어그램을 렌더링할 수 없습니다.');
        }
      }
    };
    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div ref={containerRef} className="overflow-x-auto" />
    </div>
  );
}
