import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuthOptions as VertexGoogleAuthOptions } from 'google-auth-library';

const GCP_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT as string;
const GCP_REGION = process.env.GCP_REGION || 'asia-northeast1';
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-pro';

let googleAuthOptions: VertexGoogleAuthOptions | undefined = undefined;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
  try {
    const credentialsJson = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf-8');
    const credentials = JSON.parse(credentialsJson);
    googleAuthOptions = { credentials };
    console.log('Vertex AI client will use credentials from GOOGLE_APPLICATION_CREDENTIALS_BASE64 env var.');
  } catch (e) {
    if (e instanceof Error) {
      console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_BASE64 for Vertex AI:', e.message);
    } else {
      console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_BASE64 for Vertex AI: An unknown error occurred', e);
    }
  }
} else if (process.env.NODE_ENV !== 'production') {
    // ローカル開発環境など、ADC (Application Default Credentials) が期待できる場合
    console.log('GOOGLE_APPLICATION_CREDENTIALS_BASE64 not set for Vertex AI, attempting to use Application Default Credentials.');
} else {
    console.warn('GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not set for Vertex AI in production-like environment. Authentication will likely fail.');
}

if (!GCP_PROJECT_ID && !googleAuthOptions?.credentials?.project_id) {
  console.warn('GOOGLE_CLOUD_PROJECT is not set and cannot be inferred from credentials for Vertex AI. Summarization might fail.');
}

export interface MeetingInfo { // Also used by notion.ts, consider moving to a shared types file
  date: string;
  client: string;
  consultant: string;
}

export interface GeminiSummaryOutput {
  meetingName: string;
  meetingInfo: string;
  agenda: string;
  discussion: string;
  scheduleTasks: string;
  sharedInfo: string;
  otherNotes: string;
}

export async function callGeminiToSummarize(
  transcript: string,
  originalMessageText: string | undefined,
  meetingInfo: MeetingInfo
): Promise<GeminiSummaryOutput> {
  console.log('callGeminiToSummarize called with:');
  console.log('Transcript length:', transcript.length > 500 ? transcript.substring(0, 500) + '...': transcript);
  console.log('Original message text:', originalMessageText);
  console.log('Meeting info from text:', meetingInfo);

  const effectiveProjectId = GCP_PROJECT_ID || googleAuthOptions?.credentials?.project_id;

  if (!effectiveProjectId) { 
      console.error('GCP Project ID for Vertex AI is not configured and cannot be inferred.');
      return {
        meetingName: `Dummy Summary for: ${meetingInfo.client || 'Unknown Client'} - ${meetingInfo.date || 'Unknown Date'}`,
        meetingInfo: `Date: ${meetingInfo.date}, Client: ${meetingInfo.client}, Consultant: ${meetingInfo.consultant}`,
        agenda: "Dummy Agenda - GCP Project ID not configured",
        discussion: "Dummy Discussion - GCP Project ID not configured",
        scheduleTasks: "Dummy Schedule/Tasks - GCP Project ID not configured",
        sharedInfo: "Dummy Shared Info - GCP Project ID not configured",
        otherNotes: "Dummy Other Notes - GCP Project ID not configured"
      };
  }

  const vertex_ai = new VertexAI({ 
    project: effectiveProjectId!,
    location: GCP_REGION,
    googleAuthOptions: googleAuthOptions
  });
  const model = GEMINI_MODEL_NAME;

  const generativeModel = vertex_ai.getGenerativeModel({ model: model });
  
  const prompt = `
以下の会議の文字起こしテキストと、補足情報に基づいて、指定された7つのセクションで構成される議事録の要約を作成してください。
各セクションの内容は、簡潔かつ具体的に記述してください。
もし情報が不足しているセクションがあれば、「該当なし」または「情報なし」と記述してください。

--- 
# 補足情報
- 会議日: ${meetingInfo.date}
- クライアント名: ${meetingInfo.client}
- コンサルタント名: ${meetingInfo.consultant}
- ファイル共有時のメッセージ: ${originalMessageText || 'なし'}
--- 
# 文字起こしテキスト
${transcript}
--- 
# 出力フォーマット (以下の7セクションで、JSONオブジェクトとして出力してください。各値は文字列であること):
{
  "meetingName": "string (会議の主題や目的を簡潔に表す名前)",
  "meetingInfo": "string (会議の基本情報。日付、参加者、クライアント名など)",
  "agenda": "string (会議の目的と主要な議題)",
  "discussion": "string (主要な議論内容と、それに対する決定事項や結論)",
  "scheduleTasks": "string (会議で決定された今後のスケジュールや具体的なタスク、担当者、期日など)",
  "sharedInfo": "string (会議中に共有された情報、資料、リンクなど。該当があればSlackの元ファイルリンクもここに含めてください。)",
  "otherNotes": "string (その他特記事項や、上記セクションに含まれない重要な情報)"
}
--- 
上記フォーマットに従い、JSONオブジェクトを生成してください。
`;

  console.log('Sending prompt to Gemini...');

  try {
    const resp = await generativeModel.generateContent(prompt);
    const content = resp.response.candidates?.[0]?.content;

    if (content?.parts?.[0]?.text) {
      const geminiResponseText = content.parts[0].text;
      console.log('Gemini raw response text:', geminiResponseText);
      try {
        const parsedSummary = JSON.parse(geminiResponseText);
        const requiredKeys: (keyof GeminiSummaryOutput)[] = ["meetingName", "meetingInfo", "agenda", "discussion", "scheduleTasks", "sharedInfo", "otherNotes"];
        const allKeysPresent = requiredKeys.every(key => key in parsedSummary && typeof parsedSummary[key] === 'string');
        
        if (allKeysPresent) {
          return parsedSummary as GeminiSummaryOutput;
        } else {
          console.error('Gemini response JSON does not match expected structure.', parsedSummary);
          throw new Error('Gemini response JSON structure mismatch.');
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response as JSON:', parseError);
        console.error('Gemini raw text was:', geminiResponseText);
        return {
            meetingName: `Summary for: ${meetingInfo.client} - ${meetingInfo.date} (JSON Parse Error)`,
            meetingInfo: `Date: ${meetingInfo.date}, Client: ${meetingInfo.client}, Consultant: ${meetingInfo.consultant}`,
            agenda: "N/A due to parse error",
            discussion: `Could not parse Gemini response. Raw text (first 1000 chars): ${geminiResponseText.substring(0, 1000)}...`,
            scheduleTasks: "N/A due to parse error",
            sharedInfo: "N/A due to parse error",
            otherNotes: "N/A due to parse error"
        };
      }
    } else {
      console.error('No text content found in Gemini response', JSON.stringify(resp.response, null, 2));
      throw new Error('No text content in Gemini response');
    }
  } catch (error) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      console.error('Error calling Gemini API:', error.message, error.stack);
      errorMessage = error.message;
    } else {
      console.error('Error calling Gemini API: An unknown error occurred', error);
    }
    return {
        meetingName: `Summary for: ${meetingInfo.client} - ${meetingInfo.date} (API Call Error)`,
        meetingInfo: `Date: ${meetingInfo.date}, Client: ${meetingInfo.client}, Consultant: ${meetingInfo.consultant}`,
        agenda: "N/A due to API error",
        discussion: `Gemini API call failed: ${errorMessage}`,
        scheduleTasks: "N/A due to API error",
        sharedInfo: "N/A due to API error",
        otherNotes: "N/A due to API error"
    };
  }
}

// Old summarizeTranscript function removed 