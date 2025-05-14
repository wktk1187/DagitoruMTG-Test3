/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
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

function createRichText(text: string | null | undefined): Array<{ type: 'text'; text: { content: string } }> | undefined {
  return text ? [{ type: 'text' as const, text: { content: text } }] : undefined;
}

function createDateProperty(dateString: string | null | undefined): { start: string } | undefined {
  if (!dateString) return undefined;
  try {
    const cleanedDate = dateString.replace(/[年]/g, '-').replace(/[月]/g, '-').replace(/[日]/g, '').trim();
    const dateObj = new Date(cleanedDate);
    if (!isNaN(dateObj.getTime())) {
      return { start: dateObj.toISOString().split('T')[0] }; 
    }
  } catch (e) {
    console.warn('Could not parse dateString for Notion Date property:', dateString, e);
  }
  return undefined;
}

export async function createNotionPageWithSummary(
  payload: CreateNotionPagePayload
): Promise<string> {
  const dbId = process.env.NOTION_DB_ID as string;
  const notionApiKey = process.env.NOTION_API_KEY as string;

  if (!dbId || !notionApiKey) {
    console.error('Notion DB ID or API Key is not configured. Cannot create page.');
    return `about:blank#error-notion-config-missing`;
  }

  console.log('Attempting to create Notion page with payload:', JSON.stringify(payload, null, 2));

  const {
    title,
    meetingDateRaw,
    clientNameRaw,
    consultantNameRaw,
    slackFileUrl,
    transcriptFullText,
    summarySections,
  } = payload;

  const pageTitleContent = title || summarySections.meetingName || '無題の議事録';
  
  const properties: any = {
    '会議名': { title: createRichText(pageTitleContent) },
  };

  const notionDate = createDateProperty(meetingDateRaw);
  if (notionDate) {
    properties['日時'] = { date: notionDate };
  }

  const clientNameText = createRichText(clientNameRaw);
  if (clientNameText) {
    properties['クライアント名'] = { rich_text: clientNameText };
  }

  const consultantNameText = createRichText(consultantNameRaw);
  if (consultantNameText) {
    properties['コンサルタント名'] = { rich_text: consultantNameText };
  }

  properties['会議の基本情報'] = { rich_text: createRichText(summarySections.meetingInfo) };
  properties['会議の目的とアジェンダ'] = { rich_text: createRichText(summarySections.agenda) };
  properties['会議の内容（議論と決定事項）'] = { rich_text: createRichText(summarySections.discussion) };
  properties['今後のスケジュール'] = { rich_text: createRichText(summarySections.scheduleTasks) }; 
  
  let sharedInfoContent = summarySections.sharedInfo;
  if (slackFileUrl) {
    sharedInfoContent = `${sharedInfoContent}\n\n元ファイル (Slack): ${slackFileUrl}`.trim();
  }
  properties['共有情報・添付資料'] = { rich_text: createRichText(sharedInfoContent) };
  properties['その他特記事項'] = { rich_text: createRichText(summarySections.otherNotes) };

  const notionChildren: any[] = [];
  if (transcriptFullText && transcriptFullText.trim().length > 0) {
    notionChildren.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: "文字起こし全文" } }],
      },
    });
    const MAX_BLOCK_LENGTH = 1950; 
    for (let i = 0; i < transcriptFullText.length; i += MAX_BLOCK_LENGTH) {
      notionChildren.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: transcriptFullText.substring(i, i + MAX_BLOCK_LENGTH) } }],
        },
      });
    }
  }

  try {
    console.log('Creating Notion page with properties:', JSON.stringify(properties, null, 2));
    if (notionChildren.length > 0) {
      console.log('And children (first block type):', notionChildren[0].type);
    }

    const response = await notion.pages.create({
      parent: { database_id: dbId },
      properties: properties,
      ...(notionChildren.length > 0 && { children: notionChildren }),
    });

    const pageId = (response as any).id.replace(/-/g, "");
    const pageUrl = `https://www.notion.so/${pageId}`;
    console.log('Successfully created Notion page:', pageUrl);
    return pageUrl;

  } catch (error: any) {
    console.error('Error creating Notion page. Request body to be sent was:', JSON.stringify({ parent: { database_id: dbId }, properties: properties, ...(notionChildren.length > 0 && { children: notionChildren }), }, null, 2));
    console.error('Notion API Error details:', error.body || error.message || error);
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