export const env = {
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? 'recordings',
  STT_PROVIDER: process.env.STT_PROVIDER ?? 'openai',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_TRANSCRIBE_MODEL: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
  OPENAI_SUMMARY_MODEL: process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-4o-mini',
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
};
