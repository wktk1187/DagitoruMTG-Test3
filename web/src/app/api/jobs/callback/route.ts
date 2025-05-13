import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/libs/gcp';
import { summarizeTranscript } from '@/libs/gemini';
import { createMeetingPage } from '@/libs/notion';
import { slackClient } from '@/libs/slack';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization');
  if (process.env.CALLBACK_SECRET && secret !== `Bearer ${process.env.CALLBACK_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { transcriptUri, threadTs, channelId } = body;
  console.log('[Callback]', body);

  try {
    // 1. transcript.json 読み込み
    const { bucketName, objectPath } = parseGsUri(transcriptUri);
    const file = storage.bucket(bucketName).file(objectPath);
    const [contents] = await file.download();
    const transcriptJson = contents.toString();

    // 2. Gemini で要約
    const markdown = await summarizeTranscript(transcriptJson);

    // 3. Notion ページ作成
    const title = extractTitle(markdown) || '会議録';
    const pageUrl = await createMeetingPage({ title, markdown, transcriptUrl: transcriptUri });

    // 4. Slack へ完了通知
    if (threadTs) {
      await slackClient.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `:memo: 議事録が完成しました！\n${pageUrl}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('callback error', e);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

function parseGsUri(uri: string) {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error('invalid gs uri');
  return { bucketName: match[1], objectPath: match[2] };
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s*(.+)$/m);
  return match ? match[1] : null;
} 