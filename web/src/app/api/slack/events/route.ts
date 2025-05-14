import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature, slackClient } from '@/libs/slack';
import { PubSub } from '@google-cloud/pubsub';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pubsub = new PubSub();

export async function POST(req: NextRequest) {
  // Slack からの生ボディ文字列を取得（署名検証用にそのまま使用）
  const rawBody = await req.text();

  // JSON へパース（urlencoded 対応のため try-catch）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    // urlencoded の場合は payload=xxx 形式
    const params = new URLSearchParams(rawBody);
    if (params.has('payload')) {
      body = JSON.parse(params.get('payload') as string);
    }
  }

  // URL verification challenge は署名検証前に応答
  if (body?.type === 'url_verification') {
    const receivedChallenge = body.challenge;
    const challengeToRespond = (receivedChallenge ?? '').toString().trim();

    // --- ここからログ追加 ---
    console.log('[URL_VERIFICATION] Received rawBody:', rawBody);
    console.log('[URL_VERIFICATION] Parsed body:', JSON.stringify(body));
    console.log('[URL_VERIFICATION] Received challenge:', receivedChallenge);
    console.log('[URL_VERIFICATION] Challenge to respond:', challengeToRespond);
    // --- ここまでログ追加 ---

    const response = new Response(challengeToRespond, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });

    // --- レスポンスヘッダーのログも追加 ---
    const responseHeaders: { [key: string]: string } = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log('[URL_VERIFICATION] Response headers to be sent:', JSON.stringify(responseHeaders));
    // --- ここまでログ追加 ---

    return response;
  }

  // 署名検証
  if (!verifySlackSignature(req.headers, rawBody)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const payload = body;

  // ここからイベント処理
  if (payload?.event?.type === 'file_shared') {
    try {
      await handleFileShared(payload.event, payload.event.text || '');
    } catch (e: any) {
      console.error('file_shared handling error', e);
      return new NextResponse(`Error handling file_shared: ${e.message}`, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

type SlackFileSharedEvent = {
  file_id: string;
  user_id: string; 
  file: {
    id: string;
    name: string;
    filetype: string; 
    url_private_download: string;
    permalink: string; 
  };
  channel_id: string;
  event_ts: string; 
  text?: string; 
};

async function handleFileShared(event: SlackFileSharedEvent, originalMessageText: string) {
  console.log('Handling file_shared event:', JSON.stringify(event, null, 2));
  console.log('Original message text (if any from event.text):', originalMessageText);

  const fileId = event.file?.id || event.file_id;
  const fileInfo = event.file;
  const channelId = event.channel_id;
  const threadTs = event.event_ts; 

  if (!fileId || !channelId || !threadTs || !fileInfo || !fileInfo.url_private_download) {
    console.error('Essential event information or file details missing', { fileId, channelId, threadTs, fileInfo });
    throw new Error('Essential event information or file details missing for file processing.');
  }

  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `:hourglass_flowing_sand: ファイル「${fileInfo.name}」を受け付けました。処理を開始します...`,
    });
  } catch (slackError) {
    console.error('Failed to post initial ack message to Slack:', slackError);
  }

  const topicName = process.env.PUBSUB_TOPIC || 'meeting-jobs';
  if (!topicName) {
    throw new Error("PUBSUB_TOPIC environment variable is not set.");
  }
  const jobId = randomUUID();

  const pubSubMessagePayload = {
    jobId,
    slackFileId: fileId,
    slackFileDownloadUrl: fileInfo.url_private_download,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    originalFileName: fileInfo.name,
    originalFileExtension: fileInfo.filetype,
    slackChannelId: channelId,
    slackThreadTs: threadTs,
    slackFilePermalink: fileInfo.permalink,
    slackUserId: event.user_id,
    originalMessageText: originalMessageText,
    eventTs: event.event_ts,
  };

  console.log('Publishing message to Pub/Sub topic:', topicName, JSON.stringify(pubSubMessagePayload, null, 2));

  try {
    await pubsub.topic(topicName).publishMessage({ json: pubSubMessagePayload });
    console.log(`Message ${jobId} published to ${topicName}.`);
  } catch (pubsubError) {
    console.error(`Failed to publish message to Pub/Sub topic ${topicName}:`, pubsubError);
    throw new Error(`Failed to publish message to Pub/Sub: ${pubsubError}`);
  }
} 