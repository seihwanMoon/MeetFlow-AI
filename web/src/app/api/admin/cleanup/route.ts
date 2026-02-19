import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { env } from '@/lib/env';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;
const RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS ?? 30);
const MAX_BATCH = 200;

const authorizeRequest = (request: NextRequest) => {
  if (!env.CRON_SECRET) return true;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${env.CRON_SECRET}`;
};

export async function POST(request: NextRequest) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('id, storage_path')
      .lt('created_at', cutoffDate.toISOString())
      .limit(MAX_BATCH);

    if (recordingsError) {
      console.error('[cleanup] recording fetch error', recordingsError);
      return NextResponse.json({ error: 'recordings 조회 실패' }, { status: 500 });
    }

    let storageDeleted = 0;
    if (recordings && recordings.length > 0) {
      const paths = recordings
        .map((record) => record.storage_path)
        .filter((path): path is string => Boolean(path));
      if (paths.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
        if (storageError) {
          console.error('[cleanup] storage remove error', storageError);
        } else {
          storageDeleted = paths.length;
        }
      }

      const { error: deleteRecordingsError } = await supabaseAdmin
        .from('recordings')
        .delete()
        .in(
          'id',
          recordings.map((record) => record.id),
        );

      if (deleteRecordingsError) {
        console.error('[cleanup] recordings delete error', deleteRecordingsError);
        return NextResponse.json({ error: 'recordings 삭제 실패' }, { status: 500 });
      }
    }

    const { data: diagrams, error: diagramsError } = await supabaseAdmin
      .from('diagrams')
      .select('id')
      .lt('updated_at', cutoffDate.toISOString())
      .limit(MAX_BATCH);

    if (diagramsError) {
      console.error('[cleanup] diagrams fetch error', diagramsError);
      return NextResponse.json({ error: 'diagrams 조회 실패' }, { status: 500 });
    }

    if (diagrams && diagrams.length > 0) {
      const { error: deleteDiagramsError } = await supabaseAdmin
        .from('diagrams')
        .delete()
        .in(
          'id',
          diagrams.map((diagram) => diagram.id),
        );

      if (deleteDiagramsError) {
        console.error('[cleanup] diagrams delete error', deleteDiagramsError);
        return NextResponse.json({ error: 'diagrams 삭제 실패' }, { status: 500 });
      }
    }

    return NextResponse.json({
      removedRecordings: recordings?.length ?? 0,
      removedStorageObjects: storageDeleted,
      removedDiagrams: diagrams?.length ?? 0,
      cutoff: cutoffDate.toISOString(),
    });
  } catch (error) {
    console.error('[cleanup] unexpected error', error);
    return NextResponse.json({ error: '정리 작업 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
