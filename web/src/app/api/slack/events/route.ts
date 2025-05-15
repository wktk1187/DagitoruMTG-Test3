/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { PubSub, ClientConfig } from '@google-cloud/pubsub';
import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const slackToken = process.env.SLACK_BOT_TOKEN;
let slackClient: WebClient | undefined;
if (slackToken) {
  slackClient = new WebClient(slackToken);
  console.log('Slack WebClient initialized.');
} else {
  console.error('SLACK_BOT_TOKEN is not set. Slack API calls will fail.');
}

let pubsub: PubSub;
const gcpCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64; 
const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;

const GACP_BASE64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
let initialized = false;
if (GACP_BASE64 && !admin.apps.length) { 
  try {
    const serviceAccountJson = Buffer.from(GACP_BASE64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully for Slack events.');
    initialized = true;
  } catch (e: any) {
    console.error('Firebase Admin SDK initialization error for Slack events:', e.message);
  }
} else if (admin.apps.length) {
  console.log('Firebase Admin SDK already initialized for Slack events.');
  initialized = true;
} else {
  console.warn('GOOGLE_APPLICATION_CREDENTIALS_BASE64 not set for Firebase Admin in Slack events. Firestore operations will fail.');
}

const db = initialized ? admin.firestore() : null;
const SLACK_EVENTS_COLLECTION = 'slackEventsReceived';

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
  pubsub = new PubSub({ projectId: gcpProjectId }); 
}

async function verifySlackSignature(headers: Headers, rawBody: string): Promise<boolean> {
    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (!slackSigningSecret) {
        console.error('SLACK_SIGNING_SECRET is not set. Cannot verify signature.');
        return false;
    }

    const requestTimestamp = headers.get('x-slack-request-timestamp');
    const slackSignature = headers.get('x-slack-signature');

    if (!requestTimestamp || !slackSignature) {
        console.warn('Missing Slack signature headers (x-slack-request-timestamp or x-slack-signature).');
        return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(requestTimestamp, 10)) > 60 * 5) {
        console.warn('Slack request timestamp is too old or too far in the future.');
        return false;
    }

    const sigBaseString = `v0:${requestTimestamp}:${rawBody}`;
    const calculatedSignature = `v0=${crypto.createHmac('sha256', slackSigningSecret)
                                    .update(sigBaseString, 'utf8')
                                    .digest('hex')}`;

    if (crypto.timingSafeEqual(Buffer.from(calculatedSignature, 'utf8'), Buffer.from(slackSignature, 'utf8'))) {
        return true;
    } else {
        console.warn('Slack signature mismatch.');
        return false;
    }
}

const PUBSUB_TOPIC_NAME = process.env.PUBSUB_TOPIC_MEETING_JOBS || 'meeting-jobs';

export async function POST(req: NextRequest) {
  console.log('Received request to /api/slack/events');
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
    console.log('[URL_VERIFICATION] Received challenge:', receivedChallenge);
    console.log('[URL_VERIFICATION] Challenge to respond:', challengeToRespond);
    const response = new Response(challengeToRespond, { status: 200, headers: { 'Content-Type': 'text/plain' }});
    return response;
  }

  if (!await verifySlackSignature(req.headers, rawBody)) { 
    console.error('Invalid Slack signature');
    return new NextResponse('Invalid signature', { status: 401 });
  }
  console.log('Slack signature verified.');

  const payload = body; 
  if (payload.type === 'event_callback') { 
    const event = payload.event;
    const eventId = payload.event_id; 

    console.log(`Event callback received: ${event.type}, Event ID: ${eventId}`);

    if (db && eventId) {
      const eventDocRef = db.collection(SLACK_EVENTS_COLLECTION).doc(eventId);
      try {
        const eventDoc = await eventDocRef.get();
        if (eventDoc.exists) { 
          console.log(`Event ID ${eventId} already processed/received recently. Skipping.`);
          return NextResponse.json({ message: 'Event already processed' }, { status: 200 }); 
        }
        await eventDocRef.set({
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          eventType: event.type,
        });
        console.log(`Event ID ${eventId} marked as received in Firestore.`);
      } catch (dbError) {
        if (dbError instanceof Error) {
            console.error(`Firestore error checking/setting event ID ${eventId}:`, dbError.message);
        } else {
            console.error(`Firestore error checking/setting event ID ${eventId}: An unknown error occurred`, dbError);
        }
      }
    } else if (!db) {
        console.warn('Firestore (db) is not initialized. Skipping duplicate event check.');
    } else if (!eventId) {
        console.warn('Event ID is missing from Slack event. Cannot perform duplicate check.');
    }

    if (event.type === 'file_shared') {
      console.log('File shared event detected');
      if (event.bot_id) {
          console.log(`Event from bot_id ${event.bot_id}, skipping.`);
          return NextResponse.json({ message: 'Event from bot, skipped' }, { status: 200 });
      }
      if (event.user_id && event.file_id) { 
        const fileId = event.file_id;
        const originalMessageText = payload.event?.message?.text || payload.event?.text || event.files?.[0]?.initial_comment?.comment || '';

        console.log(`Processing file_shared: file_id=${fileId}, user_id=${event.user_id}`);

        try {
          if (!slackClient) { 
            console.error('Slack WebClient is not initialized. SLACK_BOT_TOKEN might be missing.');
            return NextResponse.json({ error: 'Slack client not configured' }, { status: 500 });
          }

          const fileInfoResponse = await slackClient.files.info({ file: fileId });
          if (!fileInfoResponse.ok || !fileInfoResponse.file) {
            console.error('Failed to fetch file info from Slack:', fileInfoResponse.error || 'Unknown error. Response:', fileInfoResponse);
            return NextResponse.json({ error: `Failed to fetch file info from Slack: ${fileInfoResponse.error}` }, { status: 500 });
          }
          const slackFileData = fileInfoResponse.file as any; 
          const downloadUrl = slackFileData.url_private_download;
          const originalFileName = slackFileData.name;
          const originalFileExtension = slackFileData.filetype;
          const slackFilePermalink = slackFileData.permalink; 

          if (!downloadUrl) {
            console.error('url_private_download is missing from Slack file info:', slackFileData);
            return NextResponse.json({ error: 'Could not get download URL from Slack' }, { status: 500 });
          }

          const jobId = randomUUID();
          const messagePayload = {
            jobId: jobId,
            originalFileId: fileId,
            slackFileDownloadUrl: downloadUrl,
            slackBotToken: slackToken, 
            originalFileName: originalFileName,
            originalFileExtension: originalFileExtension,
            slackChannelId: event.channel_id || event.channel,
            slackThreadTs: event.thread_ts || event.ts, 
            slackFilePermalink: slackFilePermalink,
            slackUserId: event.user_id,
            originalMessageText: originalMessageText, 
            eventTs: payload.event_time, 
          };

          console.log('Publishing message to Pub/Sub topic:', PUBSUB_TOPIC_NAME, 'for jobId', jobId);
          const dataBuffer = Buffer.from(JSON.stringify(messagePayload));
          await pubsub.topic(PUBSUB_TOPIC_NAME).publishMessage({ data: dataBuffer }); 
          console.log(`Message published to ${PUBSUB_TOPIC_NAME} for jobId ${jobId}.`);

        } catch (e) {
            if (e instanceof Error) {
                console.error('Error in file_shared processing or publishing to Pub/Sub:', e.message, e.stack);
            } else {
                console.error('Error in file_shared processing or publishing to Pub/Sub: An unknown error occurred', e);
            }
          return NextResponse.json({ error: 'Failed to process file_shared event' }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ message: 'Event received and processed' }, { status: 200 });
  }

  console.log('Event type not recognized or not handled:', payload.type);
  return NextResponse.json({ error: 'Event type not handled' }, { status: 400 });
} 