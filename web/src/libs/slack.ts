import { WebClient } from '@slack/web-api';
import crypto from 'node:crypto';

const signingSecret = process.env.SLACK_SIGNING_SECRET as string | undefined;
if (!signingSecret) {
  console.warn('SLACK_SIGNING_SECRET is not set');
}

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export function verifySlackSignature(headers: Headers, rawBody: string): boolean {
  if (!signingSecret) return false;

  const timestamp = headers.get('x-slack-request-timestamp');
  const slackSignature = headers.get('x-slack-signature');
  if (!timestamp || !slackSignature) return false;

  // Replay attack protection (5 分以内)
  const fiveMinutes = 60 * 5;
  const ts = Number(timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > fiveMinutes) {
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const mySig =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBase, 'utf8').digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySig, 'utf8'), Buffer.from(slackSignature, 'utf8'));
} 