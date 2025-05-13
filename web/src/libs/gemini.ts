const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-pro';

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set');
}

export async function summarizeTranscript(jsonTranscript: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `あなたは優秀な議事録作成アシスタントです。以下の JSON 文字起こし結果を読み取り、7 セクションの議事録を Markdown 形式で生成してください。\n<JSON>::${jsonTranscript}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}`);
  }
  const data = await res.json();
  // 最初の候補のテキストを返す想定
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
} 