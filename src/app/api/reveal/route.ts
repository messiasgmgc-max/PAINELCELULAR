import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY || '',
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || '',
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY || '',
    EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    EMAIL_HOST: process.env.EMAIL_HOST || '',
    EMAIL_PORT: process.env.EMAIL_PORT || '',
    EMAIL_USER: process.env.EMAIL_USER || '',
    EMAIL_PASS: process.env.EMAIL_PASS || '',
    MF_FORWARD_WEBHOOK_URL: process.env.MF_FORWARD_WEBHOOK_URL || '',
  });
}
