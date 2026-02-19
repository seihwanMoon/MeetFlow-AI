import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { env } from '@/lib/env';
import { transcribeAudio } from '@/lib/stt';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, recordingId, storagePath, language } = body ?? {};

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId가 필요합니다.' }, { status: 400 });
    }

    let targetRecordingId = recordingId;
    let targetPath = storagePath as string | undefined;

    if (!targetRecordingId || !targetPath) {
      const query = supabaseAdmin
        .from('recordings')
        .select('id, storage_path')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data, error } = targetRecordingId
        ? await query.eq('id', targetRecordingId).maybeSingle()
        : await query.maybeSingle();

      if (error || !data) {
        console.error('[transcribe] recording fetch error', error);
        return NextResponse.json({ error: 'recording을 찾을 수 없습니다.' }, { status: 404 });
      }

      targetRecordingId = data.id;
      targetPath = data.storage_path;
    }

    if (!targetPath) {
      return NextResponse.json({ error: 'storagePath를 확인할 수 없습니다.' }, { status: 400 });
    }

    const { data: signedUrlData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(targetPath, 60);

    if (signedError || !signedUrlData) {
      console.error('[transcribe] signed url error', signedError);
      return NextResponse.json({ error: '오디오 파일에 접근할 수 없습니다.' }, { status: 500 });
    }

    const audioResponse = await fetch(signedUrlData.signedUrl);
    if (!audioResponse.ok) {
      return NextResponse.json({ error: '오디오 파일 다운로드 실패' }, { status: 500 });
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const filename = targetPath.split('/').pop() ?? 'recording.webm';
    const transcriptText = await transcribeAudio(audioBuffer, filename, { language });

    const { data: updateRow, error: updateError } = await supabaseAdmin
      .from('recordings')
      .update({ transcript_text: transcriptText, status: 'transcribed' })
      .eq('id', targetRecordingId)
      .select('id')
      .single();

    if (updateError || !updateRow) {
      console.error('[transcribe] update error', updateError);
      return NextResponse.json({ error: '전사 결과 저장 실패' }, { status: 500 });
    }

    await supabaseAdmin.from('meetings').update({ status: 'transcribed' }).eq('id', meetingId);

    return NextResponse.json({
      meetingId,
      recordingId: updateRow.id,
      transcriptText,
    });
  } catch (error) {
    console.error('[transcribe] unexpected error', error);
    return NextResponse.json({ error: '전사 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
