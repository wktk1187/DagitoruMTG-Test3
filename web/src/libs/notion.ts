import { Client } from '@notionhq/client';

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

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