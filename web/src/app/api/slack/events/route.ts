/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature, slackClient } from '@/libs/slack';
import { PubSub, ClientConfig } from '@google-cloud/pubsub';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let pubsub: PubSub;
const gcpCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64; 
const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;

if (gcpCredentialsBase64 && gcpProjectId) {
  try {
    const gcpCredentialsJsonString = Buffer.from(gcpCredentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(gcpCredentialsJsonString);
    const clientConfig: ClientConfig = {
      projectId: gcpProjectId,
      credentials,
    };
    pubsub = new PubSub(clientConfig);
    console.log('PubSub client initialized WITH credentials from BASE64 encoded env var.');
  } catch (e) {
    console.error('Failed to decode/parse BASE64 credentials or initialize PubSub with it. Falling back to project ID only for PubSub.', e);
    pubsub = new PubSub({ projectId: gcpProjectId }); 
  }
} else {
  let warningMessage = 'PubSub might not be initialized correctly for GCP communication.';
  if (!gcpCredentialsBase64) warningMessage += ' GOOGLE_APPLICATION_CREDENTIALS_BASE64 env var not set.';
  if (!gcpProjectId) warningMessage += ' GOOGLE_CLOUD_PROJECT env var not set.';
  console.warn(warningMessage);
  pubsub = new PubSub({ projectId: gcpProjectId }); // Attempt with projectId if available, or undefined if not
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    const params = new URLSearchParams(rawBody);
    if (params.has('payload')) {
      body = JSON.parse(params.get('payload') as string);
    }
  }

  if (body?.type === 'url_verification') {
    const receivedChallenge = body.challenge;
    const challengeToRespond = (receivedChallenge ?? '').toString().trim();
    console.log('[URL_VERIFICATION] Received rawBody:', rawBody);
    // console.log('[URL_VERIFICATION] Parsed body:', JSON.stringify(body)); // Can be verbose
    console.log('[URL_VERIFICATION] Received challenge:', receivedChallenge);
    console.log('[URL_VERIFICATION] Challenge to respond:', challengeToRespond);
    const response = new Response(challengeToRespond, { status: 200, headers: { 'Content-Type': 'text/plain' }});
    // const responseHeaders: { [key: string]: string } = {};
    // response.headers.forEach((value, key) => { responseHeaders[key] = value; });
    // console.log('[URL_VERIFICATION] Response headers to be sent:', JSON.stringify(responseHeaders));
    return response;
  }

  if (!verifySlackSignature(req.headers, rawBody)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const payload = body;
  if (payload?.event?.type === 'file_shared') {
    try {
      await handleFileShared(payload.event, payload.event.text || ''); 
    } catch (e: any) {
      console.error('file_shared handling error', e.message, e.stack);
      return new NextResponse(`Error handling file_shared: ${e.message}`, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

type SlackFileSharedEvent = {
  file_id: string;
  user_id: string; 
  file?: {
    id: string;
  };
  channel_id: string;
  event_ts: string; 
  text?: string; 
};

// Define a more complete type for the file object returned by files.info
type SlackFile = {
    id: string;
    name: string;
    filetype: string;
    url_private_download: string;
    permalink: string;
    // Add other fields if needed from files.info response
};

async function handleFileShared(event: any, originalMessageText: string) { // Reverted to any for event to simplify, ensure payload structure matches access
  console.log('Handling file_shared event:', JSON.stringify(event, null, 2));
  console.log('Original message text (if any from event.text):', originalMessageText);

  const fileIdFromEvent = event.file?.id || event.file_id;
  const channelId = event.channel_id;
  const threadTs = event.event_ts; 

  if (!fileIdFromEvent || !channelId || !threadTs) {
    console.error('Missing file_id, channelId, or event_ts in file_shared event payload', event);
    throw new Error('Essential event identification missing for file processing.');
  }

  let fileInfoFull: SlackFile;
  try {
    const fileInfoResult = await slackClient.files.info({ file: fileIdFromEvent });
    if (!fileInfoResult.ok || !fileInfoResult.file) {
      console.error('Failed to retrieve file info from Slack API or file info is missing:', fileInfoResult);
      throw new Error(`Failed to retrieve file info for ${fileIdFromEvent}`);
    }
    fileInfoFull = fileInfoResult.file as SlackFile; 
    console.log('Successfully retrieved full file info:', JSON.stringify(fileInfoFull, null, 2));
  } catch (error: any) {
    console.error(`Error fetching file info for ${fileIdFromEvent} from Slack:`, error.message);
    throw new Error(`Error fetching file info from Slack: ${error.message}`);
  }

  if (!fileInfoFull.url_private_download || !fileInfoFull.name || !fileInfoFull.filetype || !fileInfoFull.permalink) {
    console.error('Essential file details missing from fileInfoFull', fileInfoFull);
    throw new Error('Essential file details missing after fetching from Slack API.');
  }

  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `:hourglass_flowing_sand: ファイル「${fileInfoFull.name}」を受け付けました。処理を開始します...`,
    });
  } catch (slackError) {
    console.error('Failed to post initial ack message to Slack:', slackError);
  }

  const topicName = process.env.PUBSUB_TOPIC || 'meeting-jobs';
  if (!topicName) {
    throw new Error("PUBSUB_TOPIC env var not set.");
  }
  const jobId = randomUUID();

  const pubSubMessagePayload = {
    jobId,
    slackFileId: fileIdFromEvent,
    slackFileDownloadUrl: fileInfoFull.url_private_download,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    originalFileName: fileInfoFull.name,
    originalFileExtension: fileInfoFull.filetype,
    slackChannelId: channelId,
    slackThreadTs: threadTs,
    slackFilePermalink: fileInfoFull.permalink,
    slackUserId: event.user_id,
    originalMessageText: originalMessageText,
    eventTs: event.event_ts,
  };

  console.log('Publishing message to Pub/Sub topic:', topicName, JSON.stringify(pubSubMessagePayload, null, 2));

  try {
    await pubsub.topic(topicName).publishMessage({ json: pubSubMessagePayload });
    console.log(`Message ${jobId} published to ${topicName}.`);
  } catch (pubsubError: any) {
    console.error(`Failed to publish message to Pub/Sub topic ${topicName}:`, pubsubError);
    throw new Error(`Failed to publish message to Pub/Sub: ${pubsubError.message}`);
  }
} 