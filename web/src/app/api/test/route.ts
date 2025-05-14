import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  console.log("/api/test GET request received - v2"); // Added v2 for differentiation
  return NextResponse.json({ message: 'Hello from test API v2 aklsjdfhaksdjfhalksdjfh' });
}

export async function POST(req: NextRequest) {
  console.log("/api/test POST request received - v2"); // Added v2 for differentiation
  let body = {};
  try {
    body = await req.json();
  } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.log('Could not parse JSON body for /api/test POST, or no body provided.');
  }
  return NextResponse.json({ message: 'Hello from test API POST v2 aklsjdfhaksdjfhalksdjfh', receivedBody: body });
} 