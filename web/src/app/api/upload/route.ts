import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { env } from '@/lib/env';
import { isValidUUID } from '@/lib/validation';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data 요청이어야 합니다.' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const meetingId = formData.get('meetingId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '파일이 포함되어야 합니다.' }, { status: 400 });
    }

    if (typeof meetingId !== 'string' || !meetingId) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    if (!isValidUUID(meetingId)) {
      return NextResponse.json({ error: 'meetingId는 UUID 형식이어야 합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.name.split('.').pop() || 'webm';
    const objectPath = `${meetingId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (uploadError) {
      console.error('[upload] supabase error', uploadError);
      return NextResponse.json({ error: 'Supabase 업로드 실패' }, { status: 500 });
    }

    await supabaseAdmin.from('meetings').upsert({
      id: meetingId,
      title: meetingId,
      status: 'uploaded',
    });

    const { data: recordingRow, error: recordingError } = await supabaseAdmin
      .from('recordings')
      .insert({
        meeting_id: meetingId,
        storage_path: objectPath,
        status: 'uploaded',
      })
      .select('id')
      .single();

    if (recordingError || !recordingRow) {
      console.error('[upload] recordings insert error', recordingError);
      return NextResponse.json({ error: 'recordings 테이블 저장 실패' }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({
      meetingId,
      recordingId: recordingRow.id,
      path: objectPath,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (error) {
    console.error('[upload] unexpected error', error);
    return NextResponse.json({ error: '업로드 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
