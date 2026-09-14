import { NextResponse } from 'next/server';

// Hash ou timestamp do commit atual gerado no build ou dinamicamente
const CURRENT_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  'v0.1.55-live';

const BUILD_TIME = new Date().toISOString();

export async function GET() {
  return NextResponse.json(
    {
      version: CURRENT_VERSION,
      buildTime: BUILD_TIME,
      timestamp: Date.now(),
      status: 'ok',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}
