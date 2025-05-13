import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature, slackClient } from '@/libs/slack';
import { storage, pubsub } from '@/libs/gcp';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Slack payload を JSON で受信
  const body = await req.json();
  const rawBody = JSON.stringify(body); // 署名検証用

  // URL verification challenge
  if (body?.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // 署名検証
  if (!verifySlackSignature(req, rawBody)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const payload = body;

  // ここからイベント処理
  if (payload?.event?.type === 'file_shared') {
    try {
      await handleFileShared(payload.event);
    } catch (e) {
      console.error('file_shared handling error', e);
      return new NextResponse('Internal Error', { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

type FileSharedEvent = {
  file_id?: string;
  file?: { id: string };
  channel_id?: string;
  message_ts?: string;
};

async function handleFileShared(event: FileSharedEvent) {
  const fileId = event.file_id || event.file?.id;
  const channelId = event.channel_id;
  if (!fileId) {
    throw new Error('file_id not found');
  }

  // ファイル情報取得
  const fileInfo = await slackClient.files.info({ file: fileId });
  // slack SDK 型定義が限定的なため any キャスト
  const file = (fileInfo as unknown as { file: { url_private_download: string; name?: string } }).file;
  if (!file || !file.url_private_download) {
    throw new Error('invalid file info');
  }
  const downloadUrl: string = file.url_private_download;

  // GCS パス決定
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15); // YYYYMMDDTHHmm
  const prefix = `meetings/${timeStr}_${fileId}`;
  const bucketName = process.env.GCS_BUCKET as string;
  if (!bucketName) throw new Error('GCS_BUCKET not set');

  const bucket = storage.bucket(bucketName);
  const destFile = bucket.file(`${prefix}/video.mp4`);

  // Slack からストリームダウンロード → GCS へストリームアップロード
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  if (!res.ok || !res.body) throw new Error('Download failed');

  await pipeline(res.body as unknown as NodeJS.ReadableStream, destFile.createWriteStream());

  // Slack へ Upload OK (スレッド返信)
  if (channelId && event.message_ts) {
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: event.message_ts,
      text: ':white_check_mark: Upload OK',
    });
  }

  // Pub/Sub Publish
  const topicName = process.env.PUBSUB_TOPIC || 'meeting-jobs';
  const jobId = randomUUID();
  const message = {
    jobId,
    videoGcsUri: `gs://${bucketName}/${prefix}/video.mp4`,
    fileId,
    threadTs: event.message_ts || '',
    uploadedAt: now.toISOString(),
  };
  await pubsub.topic(topicName).publishMessage({ json: message });
} 