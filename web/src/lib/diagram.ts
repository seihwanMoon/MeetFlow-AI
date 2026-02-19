import type { SummaryPoint, SummaryResult } from './summarizer';

const MAX_LABEL_LENGTH = 120;

const truncate = (value: string, maxLength = MAX_LABEL_LENGTH) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
};

const sanitize = (value: string) =>
  truncate(value.trim().replace(/"/g, "'").replace(/\r?\n/g, '\\n')) || '-';

const formatPoint = (entry: SummaryPoint) => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (entry?.topic || entry?.details) {
    return [entry.topic, entry.details].filter(Boolean).join(' - ');
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return String(entry);
  }
};

const addListSection = (
  lines: string[],
  options: { id: string; title: string; items: SummaryPoint[] | undefined },
) => {
  const { id, title, items } = options;
  const hubId = `${id}Hub`;
  lines.push(`  ${hubId}["${sanitize(title)}"]`);
  lines.push(`  root --> ${hubId}`);

  if (!items || items.length === 0) {
    lines.push(`  ${hubId} --> ${id}Empty["항목 없음"]`);
    return;
  }

  items.forEach((item, index) => {
    const nodeId = `${id}${index}`;
    lines.push(`  ${nodeId}("${sanitize(formatPoint(item))}")`);
    lines.push(`  ${hubId} --> ${nodeId}`);
  });
};

const addActionSection = (
  lines: string[],
  options: { id: string; title: string; items: SummaryResult['action_items'] | undefined },
) => {
  const { id, title, items } = options;
  const hubId = `${id}Hub`;
  lines.push(`  ${hubId}["${sanitize(title)}"]`);
  lines.push(`  root --> ${hubId}`);

  if (!items || items.length === 0) {
    lines.push(`  ${hubId} --> ${id}Empty["Action Item 없음"]`);
    return;
  }

  items.forEach((item, index) => {
    const desc = sanitize(item.description || '설명 없음');
    const assignee = sanitize(item.assignee || '미정');
    const dueDate = sanitize(item.due_date || '미정');
    const confidence = Math.round((item.confidence ?? 0) * 100);
    const nodeId = `${id}${index}`;
    const label = `${desc}\\n담당: ${assignee}\\n기한: ${dueDate}\\n신뢰도: ${confidence}%`;
    lines.push(`  ${nodeId}("${label}")`);
    lines.push(`  ${hubId} --> ${nodeId}`);
  });
};

export const buildMermaidDiagram = (summary: SummaryResult) => {
  const lines = ['graph TD', '  root(("회의 요약"))'];

  const overview = summary.overview?.trim();
  if (overview) {
    lines.push(`  overview["개요\\n${sanitize(overview)}"]`);
    lines.push('  root --> overview');
  }

  addListSection(lines, { id: 'decision', title: '결정 사항', items: summary.decisions });
  addListSection(lines, { id: 'discussion', title: '논의 포인트', items: summary.discussions });
  addActionSection(lines, { id: 'action', title: 'Action Items', items: summary.action_items });

  if (summary.diagram_summary) {
    lines.push(`  diagramNote["요약 메모\\n${sanitize(summary.diagram_summary)}"]`);
    lines.push('  root --> diagramNote');
  }

  return lines.join('\n');
};
