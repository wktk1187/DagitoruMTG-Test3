import { Client } from '@notionhq/client';
import { randomUUID } from 'crypto';

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

export interface SummarySections {
  meetingName: string;
  meetingInfo: string; // Should match Notion prop: 会議の基本情報
  agenda: string;      // Should match Notion prop: 会議の目的とアジェンダ
  discussion: string;  // Should match Notion prop: 会議の内容（議論と決定事項）
  scheduleTasks: string; // Should match Notion prop: 今後のスケジュールとタスク管理
  sharedInfo: string;  // Should match Notion prop: 共有情報・添付資料
  otherNotes: string;  // Should match Notion prop: その他特記事項
}

export interface CreateNotionPagePayload {
  title?: string;
  meetingDateRaw?: string;
  clientNameRaw?: string;
  consultantNameRaw?: string;
  slackFileUrl?: string;
  transcriptFullText?: string;
  summarySections: SummarySections;
  // Add other fields from pubSubMessagePayload that might be needed directly
  // e.g., if you have specific Notion properties for originalFileId, slackUserId, etc.
}

export async function createNotionPageWithSummary(
  payload: CreateNotionPagePayload
): Promise<string> {
  const dbId = process.env.NOTION_DB_ID as string;
  const notionApiKey = process.env.NOTION_API_KEY as string;

  if (!dbId || !notionApiKey) {
    console.error('Notion DB ID or API Key is not configured.');
    return `about:blank#error-notion-config-missing-dbId-or-apiKey`;
  }

  console.log('Attempting to create Notion page with payload:', JSON.stringify(payload, null, 2));

  const {
    title,
    meetingDateRaw,
    clientNameRaw,
    consultantNameRaw,
    slackFileUrl,
    transcriptFullText, // Added for potential use in page content
    summarySections,
  } = payload;

  const pageTitle = title || summarySections.meetingName || '無題の議事録';

  let notionDateISO: string | undefined = undefined;
  if (meetingDateRaw) {
    try {
      // Handles YYYY/MM/DD, YYYY-MM-DD, YYYY年MM月DD日 by replacing non-digits for date parts
      const cleanedDate = meetingDateRaw.replace(/[年]/g, '-').replace(/[月]/g, '-').replace(/[日]/g, '');
      const dateObj = new Date(cleanedDate);
      if (!isNaN(dateObj.getTime())) {
        notionDateISO = dateObj.toISOString().split('T')[0];
      }
    } catch (e) {
      console.warn('Could not parse meetingDateRaw for Notion:', meetingDateRaw, e);
    }
  }
  
  const properties: any = {
    '会議名': { title: [{ type: 'text', text: { content: pageTitle } }] },
    // Conditionally add properties if they have values
    ...(notionDateISO && { '日時': { date: { start: notionDateISO } } }),
    ...(clientNameRaw && { 'クライアント名': { rich_text: [{ type: 'text', text: { content: clientNameRaw } }] } }),
    ...(consultantNameRaw && { 'コンサルタント名': { rich_text: [{ type: 'text', text: { content: consultantNameRaw } }] } }),
    '会議の基本情報': { rich_text: [{ type: 'text', text: { content: summarySections.meetingInfo } }] },
    '会議の目的とアジェンダ': { rich_text: [{ type: 'text', text: { content: summarySections.agenda } }] },
    '会議の内容（議論と決定事項）': { rich_text: [{ type: 'text', text: { content: summarySections.discussion } }] },
    '今後のスケジュール': { rich_text: [{ type: 'text', text: { content: summarySections.scheduleTasks } }] },
    '共有情報・添付資料': { rich_text: [{ type: 'text', text: { content: `${summarySections.sharedInfo}${slackFileUrl ? `\n\n元ファイル (Slack): ${slackFileUrl}` : ''}` } }] },
    'その他特記事項': { rich_text: [{ type: 'text', text: { content: summarySections.otherNotes } }] },
  };

  // Optional: Add full transcript as page content if transcriptFullText is provided
  const children: any[] = [];
  if (transcriptFullText) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: "議事録全文：" } }],
      },
    });
    // Split transcript into chunks if too long for a single block (Notion limit ~2000 chars/block)
    const MAX_BLOCK_LENGTH = 1900; // Notion rich_text limit is 2000, leave some margin
    for (let i = 0; i < transcriptFullText.length; i += MAX_BLOCK_LENGTH) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: transcriptFullText.substring(i, i + MAX_BLOCK_LENGTH) } }],
        },
      });
    }
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: dbId },
      properties: properties,
      ...(children.length > 0 && { children: children }), // Add children only if there are any
    });
    console.log('Successfully created Notion page:', (response as any).id);
    const pageId = (response as any).id.replace(/-/g, "");
    return `https://www.notion.so/${pageId}`;

  } catch (error: any) {
    console.error('Error creating Notion page:', error.body || error.message || error);
    throw new Error(`Failed to create Notion page: ${error.message}`);
  }
}

export async function createMeetingPage(payload: {
  title: string;
  markdown: string;
  transcriptUrl: string;
}) {
  const dbId = process.env.NOTION_DB_ID as string;
  if (!dbId) throw new Error('NOTION_DB_ID not set');

  const { title, markdown, transcriptUrl } = payload;

  const res = (await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      Name: {
        title: [
          {
            type: 'text',
            text: { content: title },
          },
        ],
      },
      Transcript_URL: { url: transcriptUrl },
      Status: { select: { name: 'Done' } },
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: markdown } }],
        },
      },
    ],
  })) as { url: string };
  return res.url;
} 