import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildWhatsAppText, parseGeminiPlan } from './commandExecutor';

// Instancia cliente do Supabase com Service Role Key para bypass de RLS no backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações do Evolution API
const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'phonecenter';

// ── GET: Endpoint de Validação & Healthcheck do Webhook ──
export async function GET() {
  return NextResponse.json(
    {
      status: 'online',
      service: 'Phone Center Evolution Webhook Engine',
      timestamp: new Date().toISOString(),
      evolution_url: EVOLUTION_URL ? 'Configurado' : 'Pendente',
      instance: DEFAULT_INSTANCE,
    },
    { status: 200 }
  );
}

// ── AUXILIAR: Enviar Mensagem via Evolution API ──
async function enviarMensagemWhatsApp(instanceName: string, number: string, text: string) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no .env.local');
    return false;
  }

  const cleanNumber = number.replace(/\D/g, '');
  if (!cleanNumber) return false;

  const targetInstance = instanceName || DEFAULT_INSTANCE;
  const endpoint = `${EVOLUTION_URL}/message/sendText/${targetInstance}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text,
        options: {
          delay: 1200,
          presence: 'composing',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro ao enviar mensagem via Evolution API (${response.status}):`, errText);
      return false;
    }

    console.log(`✅ Mensagem enviada com sucesso para ${cleanNumber} via instância "${targetInstance}"`);
    return true;
  } catch (err: any) {
    console.error('❌ Falha na requisição para Evolution API:', err?.message || err);
    return false;
  }
}

// ── AUXILIAR: Resolver ID da Loja ──
async function resolverLojaId(instanceName?: string): Promise<string | null> {
  // 1. Se a instância é no formato "loja-{uuid}"
  if (instanceName && instanceName.startsWith('loja-')) {
    const extractedId = instanceName.replace('loja-', '').trim();
    if (extractedId.length >= 30) return extractedId;
  }

  // 2. Busca na tabela whatsapp_sessions por session_name ou loja_id
  if (instanceName) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('loja_id')
      .or(`session_name.eq.${instanceName},loja_id.eq.${instanceName}`)
      .maybeSingle();

    if (session?.loja_id) return session.loja_id;
  }

  // 3. Fallback: pega a primeira loja ativa cadastrada
  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return loja?.id || null;
}

// ── AUXILIAR: Processar Lista de Preços de Fornecedor ──
async function processarListaPrecos(lines: string[], senderName: string, lojaId: string) {
  let currentModelName = '';
  let currentCapacity = '';
  let pendingColors: string[] = [];
  const extractedData: Record<string, number[]> = {};

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const modelMatch = cleanLine.match(/^[📲📱]\s*\*?([^*🇺🇸%]+)\*?/iu);
    if (modelMatch) {
      let fullModel = modelMatch[1]
        .replace(/\*/g, '')
        .replace(/IPHONE/gi, 'iPhone')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .trim();

      const capMatch = fullModel.match(/(\d+\s*(?:GB|TB))/i);
      if (capMatch) {
        currentCapacity = capMatch[1].toUpperCase().replace(/\s/g, '');
        currentModelName = fullModel.replace(capMatch[0], '').trim();
      } else {
        currentModelName = fullModel;
        currentCapacity = 'N/A';
      }
      pendingColors = [];
      continue;
    }

    const priceMatch = cleanLine.match(
      /(?:💰|💵|R\$|[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18])\s*(?:R\$)?\s*(?:\d+%\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{3,})/i
    );

    if (priceMatch && currentModelName) {
      const rawPrice = priceMatch[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(rawPrice);

      if (!isNaN(price) && price > 0) {
        const colorsToProcess = [...pendingColors];
        if (colorsToProcess.length === 0) {
          let detectedColor = 'Padrão';
          if (cleanLine.includes('⚫')) detectedColor = 'Preto';
          else if (cleanLine.includes('⚪')) detectedColor = 'Branco/Prata';
          else if (cleanLine.includes('🔵')) detectedColor = 'Azul';
          else if (cleanLine.includes('🟡')) detectedColor = 'Dourado/Amarelo';
          else if (cleanLine.includes('🔴')) detectedColor = 'Vermelho';
          else if (cleanLine.includes('🟣')) detectedColor = 'Roxo';
          else if (cleanLine.includes('🟢')) detectedColor = 'Verde';
          else if (cleanLine.includes('🩷')) detectedColor = 'Rosa';
          else if (cleanLine.includes('🩶')) detectedColor = 'Cinza';
          colorsToProcess.push(detectedColor);
        }

        for (const cor of colorsToProcess) {
          const key = `${currentModelName}|${currentCapacity}|${cor}`;
          if (!extractedData[key]) extractedData[key] = [];
          extractedData[key].push(price);
        }
        pendingColors = [];
      }
    }
  }

  const entries = Object.entries(extractedData);
  if (entries.length === 0) return 0;

  let cadastradosOuAtualizados = 0;

  for (const [modelKey, prices] of entries) {
    if (prices.length === 0) continue;
    const sorted = [...prices].sort((a, b) => b - a);
    let basePrice = sorted[0];
    basePrice += 300; // Margem padrão

    const [modelName, capacity, cor] = modelKey.split('|');

    // Atualiza ou insere na tabela aparelhos
    const { data: existentes } = await supabase
      .from('aparelhos')
      .select('id')
      .ilike('modelo', modelName)
      .eq('loja_id', lojaId)
      .eq('condicao', 'seminovo');

    if (existentes && existentes.length > 0) {
      await supabase
        .from('aparelhos')
        .update({
          preco: basePrice,
          observacoes: `Atualizado via WhatsApp (${senderName})`,
        })
        .ilike('modelo', modelName)
        .eq('loja_id', lojaId);
    } else {
      await supabase.from('aparelhos').insert({
        loja_id: lojaId,
        marca: modelName.toUpperCase().includes('IPHONE') ? 'Apple' : 'Smartphone',
        modelo: modelName,
        capacidade: capacity,
        cor,
        condicao: 'seminovo',
        preco: basePrice,
        ativo: true,
        observacoes: `Importado de lista WhatsApp (${senderName})`,
      });
    }

    cadastradosOuAtualizados++;
  }

  return cadastradosOuAtualizados;
}

// ── POST: Processamento Principal do Webhook ──
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === '') {
      return NextResponse.json({ message: 'Payload vazio recebido.' }, { status: 200 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
    }

    console.log('📡 [Evolution Webhook Event]:', payload.event || payload.type || 'Evento sem nome');

    // 1. Extração da instância
    const instanceName =
      payload.instance ||
      payload.instanceName ||
      payload.data?.instance ||
      DEFAULT_INSTANCE;

    const lojaId = await resolverLojaId(instanceName);

    // 2. Trata eventos de Conexão / Status / QR Code
    const eventName = String(payload.event || payload.type || '').toLowerCase();

    if (eventName.includes('qrcode') || eventName.includes('connection')) {
      const qrCodeBase64 = payload.data?.qrcode?.base64 || payload.data?.qrcode || payload.qrcode;
      const connectionState = payload.data?.state || payload.data?.status || payload.state || payload.status;

      if (lojaId && (qrCodeBase64 || connectionState)) {
        let statusBanco = 'disconnected';
        if (['open', 'connected', 'isLogged', 'inChat'].includes(connectionState)) {
          statusBanco = 'connected';
        } else if (qrCodeBase64 || connectionState === 'connecting') {
          statusBanco = 'qr_code';
        }

        await supabase.from('whatsapp_sessions').upsert(
          {
            loja_id: lojaId,
            status: statusBanco,
            qr_code: statusBanco === 'connected' ? null : qrCodeBase64 || null,
            session_name: instanceName,
          },
          { onConflict: 'loja_id' }
        );
      }

      return NextResponse.json({ status: 'ok', message: 'Status de conexão atualizado.' }, { status: 200 });
    }

    // 3. Trata recebimento de mensagens (messages.upsert / MESSAGES_UPSERT)
    const isMessageEvent =
      eventName.includes('message') ||
      eventName.includes('upsert') ||
      payload.data?.key?.remoteJid ||
      payload.key?.remoteJid;

    if (!isMessageEvent) {
      return NextResponse.json({ status: 'ok', message: 'Evento ignorado.' }, { status: 200 });
    }

    // Extrai dados da mensagem
    const msgData = payload.data?.message ? payload.data : payload;
    const key = msgData.key || {};
    const remoteJid = String(key.remoteJid || '');

    // Ignora chamadas de status broadcast ou mensagens enviadas pelo próprio bot (fromMe)
    if (key.fromMe || remoteJid.includes('status@broadcast') || remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ status: 'ok', message: 'Mensagem de grupo/sistema ignorada.' }, { status: 200 });
    }

    const senderPhone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '');
    const pushName = msgData.pushName || msgData.verifiedBizName || senderPhone;

    // Extrai o texto da mensagem
    const messageContent = msgData.message || {};
    const textContent =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.buttonsResponseMessage?.selectedButtonId ||
      messageContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
      '';

    if (!textContent || textContent.trim() === '') {
      return NextResponse.json({ status: 'ok', message: 'Mensagem sem texto.' }, { status: 200 });
    }

    console.log(`📩 Mensagem recebida de ${pushName} (${senderPhone}): "${textContent.slice(0, 60)}..."`);

    // 4. Salva log no Supabase (`whatsapp_logs`)
    if (lojaId) {
      await supabase.from('whatsapp_logs').insert({
        loja_id: lojaId,
        contato: `${pushName} (${senderPhone})`,
        mensagem: textContent,
        created_at: new Date().toISOString(),
      });
    }

    // 5. Verifica se é uma Lista de Preços de Fornecedor
    const isListaPrecos = textContent.includes('📲') || textContent.includes('📱') || /iPhone\s*\d+/i.test(textContent);

    if (isListaPrecos && lojaId) {
      const lines = textContent.split('\n');
      const totalProcessados = await processarListaPrecos(lines, pushName, lojaId);

      if (totalProcessados > 0) {
        const respostaLista = `🚀 *Phone Center Auto-Bot*\n\nRecebemos sua lista! Processamos *${totalProcessados} modelos* e atualizamos o estoque da loja automaticamente.\n\nObrigado! ✅`;
        await enviarMensagemWhatsApp(instanceName, senderPhone, respostaLista);
        return NextResponse.json({ status: 'ok', message: `Lista processada: ${totalProcessados} modelos.` }, { status: 200 });
      }
    }

    // 6. Resposta Inteligente / Consultas do Sistema (!estoque, !ajuda, consultas)
    const lowerText = textContent.toLowerCase().trim();

    if (lowerText.startsWith('!estoque') || lowerText.includes('estoque') || lowerText.includes('aparelhos disponiveis')) {
      if (lojaId) {
        const { data: aparelhos } = await supabase
          .from('aparelhos')
          .select('marca, modelo, capacidade, cor, preco, condicao')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .limit(10);

        if (aparelhos && aparelhos.length > 0) {
          let respostaEstoque = `📱 *ESTOQUE DISPONÍVEL - PHONE CENTER*\n\n`;
          aparelhos.forEach((a) => {
            const precoFmt = a.preco ? `R$ ${Number(a.preco).toFixed(2)}` : 'Consulte';
            respostaEstoque += `• *${a.marca} ${a.modelo}* (${a.capacidade || 'N/A'}) - ${a.cor || 'Padrão'} [${a.condicao?.toUpperCase()}] - ${precoFmt}\n`;
          });
          respostaEstoque += `\nPara mais detalhes ou compras, fale com nossa equipe! 💬`;
          await enviarMensagemWhatsApp(instanceName, senderPhone, respostaEstoque);
          return NextResponse.json({ status: 'ok', message: 'Consulta de estoque respondida.' }, { status: 200 });
        }
      }
    }

    if (lowerText.startsWith('!ajuda') || lowerText.startsWith('!menu')) {
      const menuAjuda = `📱 *PHONE CENTER BOT - COMANDOS*\n\n• *!estoque* - Consulta os aparelhos disponíveis no estoque\n• Envie uma *lista de preços* para cadastrar aparelhos automaticamente\n• Fale normalmente para tirar dúvidas com nossa IA de suporte!`;
      await enviarMensagemWhatsApp(instanceName, senderPhone, menuAjuda);
      return NextResponse.json({ status: 'ok', message: 'Menu de ajuda enviado.' }, { status: 200 });
    }

    // 7. Processamento de Comandos IA Gemini / Groq (se plano configurado)
    const geminiPlan = parseGeminiPlan(textContent);
    if (geminiPlan) {
      const textResposta = buildWhatsAppText(geminiPlan.action, geminiPlan.params, senderPhone);
      await enviarMensagemWhatsApp(instanceName, senderPhone, textResposta);
      return NextResponse.json({ status: 'ok', message: 'Comando IA executado.' }, { status: 200 });
    }

    // Retorna OK para a Evolution API
    return NextResponse.json({ status: 'ok', message: 'Webhook processado com sucesso.' }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Erro crítico no Webhook Evolution API:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}