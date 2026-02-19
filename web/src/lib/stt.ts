import { File } from 'node:buffer';
import { env } from './env';
import { getOpenAIClient } from './openaiClient';

type TranscribeOptions = {
  language?: string | null;
};

export async function transcribeAudio(buffer: Buffer, filename: string, options?: TranscribeOptions) {
  if (env.STT_PROVIDER === 'assemblyai') {
    throw new Error('AssemblyAI provider는 아직 구현되지 않았습니다.');
  }
  return transcribeWithOpenAI(buffer, filename, options);
}

async function transcribeWithOpenAI(buffer: Buffer, filename: string, options?: TranscribeOptions) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  const client = getOpenAIClient();
  const file = new File([buffer], filename, { type: 'application/octet-stream' });
  const response = await client.audio.transcriptions.create({
    file,
    model: env.OPENAI_TRANSCRIBE_MODEL,
    language: options?.language ?? undefined,
  });
  return response.text;
}
