/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
// import { storage } from '@/libs/gcp'; // Removed as gcp.ts was deleted
import { callGeminiToSummarize } from '@/libs/gemini';
import { createNotionPageWithSummary } from '@/libs/notion';
import { slackClient } from '@/libs/slack';

// Helper function to extract meeting info from text
function extractMeetingInfo(text: string | undefined): { date: string; client: string; consultant: string } {
  const info = { date: '不明', client: '不明', consultant: '不明' };
  if (!text) return info;
  const dateMatch = text.match(/(\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}日?)/);
  if (dateMatch) info.date = dateMatch[1];
  const clientMatch = text.match(/(?:クライアント|顧客)[:：\s]*([^\s]+)/);
  if (clientMatch) info.client = clientMatch[1];
  const consultantMatch = text.match(/(?:コンサルタント|担当)[:：\s]*([^\s]+)/);
  if (consultantMatch) info.consultant = consultantMatch[1];
  return info;
}

export async function POST(req: NextRequest) {
  try {
    console.log('Received callback from Cloud Run:', req.headers.get('content-type'));
    const body = await req.json();
    console.log('Callback body parsed:', body);

    // TODO: Implement shared secret verification for requests from Cloud Run
    // const sharedSecret = process.env.CALLBACK_FROM_CLOUD_RUN_SECRET;
    // const requestSecret = req.headers.get('X-Callback-Secret');
    // if (!sharedSecret || !requestSecret || sharedSecret !== requestSecret) {
    //   console.error('Unauthorized callback request');
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    const {
      transcript,
      jobId,
      // slackFileId, // Not directly used in this function yet
      originalFileName,
      slackChannelId,
      slackThreadTs,
      slackFilePermalink,
      // slackUserId, // Not directly used in this function yet
      originalMessageText,
      // eventTs, // Not directly used in this function yet
      // gcsAudioUri, // Potentially for Transcript_URL in Notion
      // speechToTextOperationName // For logging or reference
    } = body;

    if (transcript === undefined || transcript === null) {
      console.error('Transcript missing in callback from Cloud Run for job:', jobId);
      if (slackChannelId && slackThreadTs) {
        await slackClient.chat.postMessage({
          channel: slackChannelId,
          thread_ts: slackThreadTs,
          text: `:warning: 「${originalFileName || 'ファイル'}」の文字起こし処理でエラーが発生しました。文字起こし結果がありません。`,
        });
      }
      return new NextResponse('Transcript missing', { status: 400 });
    }

    const meetingInfo = extractMeetingInfo(originalMessageText);
    console.log('Extracted meeting info for Notion:', meetingInfo);

    console.log('Calling Gemini API for summary for job:', jobId);
    const geminiSummary = await callGeminiToSummarize(transcript, originalMessageText, meetingInfo);
    console.log('Gemini summary received for job:', jobId /*, geminiSummary*/); // Avoid logging large summary object directly

    console.log('Creating Notion page for job:', jobId);
    const notionPageUrl = await createNotionPageWithSummary({
      title: geminiSummary.meetingName || originalFileName || `議事録 (${meetingInfo.date})`,
      meetingDateRaw: meetingInfo.date, // Pass the raw extracted date string
      clientNameRaw: meetingInfo.client,
      consultantNameRaw: meetingInfo.consultant,
      slackFileUrl: slackFilePermalink,
      transcriptFullText: transcript,
      summarySections: geminiSummary, 
    });
    console.log('Notion page created for job:', jobId, notionPageUrl);

    if (slackChannelId && slackThreadTs) {
      await slackClient.chat.postMessage({
        channel: slackChannelId,
        thread_ts: slackThreadTs,
        text: `:white_check_mark: 「${geminiSummary.meetingName || originalFileName || 'ファイル'}」の議事録を作成し、Notionに保存しました！\n${notionPageUrl}`,
      });
    }

    return NextResponse.json({ ok: true, notionPageUrl });

  } catch (error: any) {
    console.error('Error in jobs/callback:', error.message, error.stack);
    // Avoid sending detailed error back to client unless necessary
    return new NextResponse(`Internal Server Error`, { status: 500 });
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