import OpenAI from 'openai';
import { env } from './env';

let client: OpenAI | null = null;

export function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}
