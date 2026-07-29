import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // 1. Filtra o evento de mensagem recebida
    if (payload.event === 'messages.upsert') {
      const messageData = payload.data;
      const remoteJid = messageData.key.remoteJid; // Número do zap do lojista
      const userMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text;

      // Ignora mensagens enviadas pelo próprio bot
      if (messageData.key.fromMe) {
        return NextResponse.json({ status: 'ignored_from_me' }, { status: 200 });
      }

      console.log(`Mensagem de ${remoteJid}: ${userMessage}`);

      // TODO: Aqui entra a chamada pro Gemini + consulta no Supabase
    }

    // SEMPRE retorne 200 rápido pra Evolution não ficar reentregando o webhook
    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('Erro no Webhook:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}