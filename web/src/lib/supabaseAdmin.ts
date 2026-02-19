import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase admin client를 초기화할 수 없습니다.');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
