import { getOpenAIClient } from './openaiClient';
import { env } from './env';

export type ActionItem = {
  description: string;
  assignee: string;
  due_date: string | null;
  confidence: number;
};

export type SummaryPoint = string | { topic?: string; details?: string };

export type SummaryResult = {
  overview: string;
  decisions: SummaryPoint[];
  discussions: SummaryPoint[];
  action_items: ActionItem[];
  diagram_summary?: string;
};

export async function summarizeTranscript(
  transcript: string,
  options: { meetingId: string; language?: string },
) {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: env.OPENAI_SUMMARY_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '당신은 회의록을 요약하고 실행 항목을 구조화하는 전문가입니다. 항상 JSON만으로 응답하세요.',
      },
      {
        role: 'user',
        content:
          `회의 ID: ${options.meetingId}\n언어: ${options.language ?? 'unknown'}\n다음 회의록을 요약하고 JSON 필드(overview, decisions[], discussions[], action_items[])로 출력하세요.\nTranscript:\n"""${transcript}"""`,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('요약 생성에 실패했습니다.');
  }
  try {
    const parsed = JSON.parse(content) as SummaryResult;
    return parsed;
  } catch (error) {
    console.error('[summarizer] invalid JSON response', error);
    throw new Error('LLM 응답을 파싱할 수 없습니다.');
  }
}
