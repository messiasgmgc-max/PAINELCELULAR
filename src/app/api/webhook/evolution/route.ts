import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildDispatchPayload, buildWhatsAppText, parseGeminiPlan, type GeminiCommandPlan } from './commandExecutor';

// Inicializa a SDK do Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL_CANDIDATES = (
  process.env.GEMINI_MODEL_CANDIDATES ||
  'gemini-2.0-flash-lite,gemini-2.0-flash,gemini-1.5-flash'
)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

function normalizeLocalBrazilPhone(phone: string) {
  let normalized = normalizePhone(phone);
  while (normalized.startsWith('55')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function buildPhoneCandidates(phone: string) {
  const base = normalizeLocalBrazilPhone(phone);
  const candidates = new Set<string>();

  if (!base) return [];

  candidates.add(base);

  // Variação com/sem nono dígito para celular BR
  if (base.length === 10) {
    // Ex: 31 + 93586377 -> 31 + 9 + 93586377
    candidates.add(`${base.slice(0, 2)}9${base.slice(2)}`);
  }

  if (base.length === 11 && base[2] === '9') {
    // Ex: 31 + 993586377 -> 31 + 93586377
    candidates.add(`${base.slice(0, 2)}${base.slice(3)}`);
  }

  return Array.from(candidates);
}

function extractMessagePayload(payload: any) {
  const data = payload?.data;
  if (Array.isArray(data?.messages) && data.messages.length > 0) {
    return data.messages[0];
  }
  if (Array.isArray(data) && data.length > 0) {
    return data[0];
  }
  if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
    return payload.messages[0];
  }
  return data ?? null;
}

function extractMessageText(messageData: any) {
  return (
    messageData?.message?.conversation ||
    messageData?.message?.extendedTextMessage?.text ||
    messageData?.message?.imageMessage?.caption ||
    messageData?.message?.videoMessage?.caption ||
    messageData?.message?.buttonsResponseMessage?.selectedDisplayText ||
    messageData?.message?.listResponseMessage?.title ||
    messageData?.message?.templateButtonReplyMessage?.selectedDisplayText ||
    messageData?.conversation ||
    ''
  );
}

function buildFallbackCommandFromText(text: string): GeminiCommandPlan | null {
  const trimmed = text.trim();

  const createLoja = trimmed.match(/^criar\s+loja\s+(.+)$/i);
  if (createLoja && createLoja[1]) {
    return {
      type: 'command',
      action: 'create_loja',
      params: {
        nome: createLoja[1].trim(),
      },
    };
  }

  if (/^listar\s+lojas$/i.test(trimmed) || /^list\s+lojas$/i.test(trimmed)) {
    return {
      type: 'command',
      action: 'list_lojas',
      params: {},
    };
  }

  return null;
}

async function notifyAdminError(motivo: string) {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const adminPhone = normalizePhone(process.env.WEBHOOK_ALERT_PHONE || '');

    if (!evolutionUrl || !instanceName || !apiKey || !adminPhone) {
      console.error('[Webhook Alert]', motivo);
      return;
    }

    await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: adminPhone,
        text: `🚨 Webhook com erro:\n${motivo}`,
      }),
    });
  } catch (e) {
    console.error('Falha ao enviar alerta de erro do webhook:', e);
  }
}

async function sendWhatsAppText(number: string, text: string) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!evolutionUrl || !instanceName || !apiKey) {
    return { ok: false as const, error: 'Variáveis da Evolution API não configuradas.' };
  }

  async function generateContentWithModelFallback(contents: string, systemInstruction: string) {
    let lastError: unknown = null;

    for (const model of GEMINI_MODEL_CANDIDATES) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });

        return {
          modelUsed: model,
          text: response.text || '',
        };
      } catch (error) {
        lastError = error;
        console.error(`⚠️ [Gemini] Falha no modelo ${model}:`, error);
      }
    }

    throw lastError;
  }

  const response = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: normalizePhone(number),
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false as const, error: `Evolution API ${response.status}: ${body}` };
  }

  return { ok: true as const };
}

async function executeGeminiCommand(plan: ReturnType<typeof parseGeminiPlan>, lojaId: string | null, senderPhone: string) {
  if (!plan) {
    return { data: null, error: 'Plano inválido', message: 'Plano inválido', dispatchPayload: null as string | null };
  }

  try {
    if (plan.action === 'create_aparelho') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar aparelho', message: 'Loja não identificada para criar aparelho', dispatchPayload: null as string | null };
      }

      const payload = {
        marca: String(plan.params.marca || ''),
        modelo: String(plan.params.modelo || ''),
        cor: String(plan.params.cor || ''),
        capacidade: String(plan.params.capacidade || ''),
        condicao: String(plan.params.condicao || 'seminovo'),
        preco: Number(plan.params.preco || 0),
        descricao: String(plan.params.descricao || ''),
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('aparelhos').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Aparelho criado com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Aparelho criado com sucesso. Verifique no painel.'),
      };
    }

    if (plan.action === 'create_cliente') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar cliente', message: 'Loja não identificada para criar cliente', dispatchPayload: null as string | null };
      }

      const payload = {
        nome: String(plan.params.nome || ''),
        email: String(plan.params.email || `${Date.now()}@local.com`),
        telefone: String(plan.params.telefone || ''),
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('clientes').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Cliente criado com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Cliente criado com sucesso. Verifique no painel.'),
      };
    }

    if (plan.action === 'create_tecnico') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar técnico', message: 'Loja não identificada para criar técnico', dispatchPayload: null as string | null };
      }

      const payload = {
        nome: String(plan.params.nome || ''),
        telefone: String(plan.params.telefone || ''),
        email: String(plan.params.email || ''),
        especialidade: String(plan.params.especialidade || ''),
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('tecnicos').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Técnico criado com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Técnico cadastrado com sucesso.'),
      };
    }

    if (plan.action === 'create_os') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar OS', message: 'Loja não identificada para criar OS', dispatchPayload: null as string | null };
      }

      const payload = {
        clienteNome: String(plan.params.clienteNome || ''),
        aparelhoMarca: String(plan.params.aparelhoMarca || ''),
        aparelhoModelo: String(plan.params.aparelhoModelo || ''),
        defeito: String(plan.params.defeito || ''),
        status: String(plan.params.status || 'em_andamento'),
        precoVenda: Number(plan.params.precoVenda || 0),
        numeroOS: Number(plan.params.numeroOS || Date.now()),
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('ordens_servico').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'OS criada com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Ordem de serviço criada com sucesso.'),
      };
    }

    if (plan.action === 'create_agendamento') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar agendamento', message: 'Loja não identificada para criar agendamento', dispatchPayload: null as string | null };
      }

      const payload = {
        clienteNome: String(plan.params.clienteNome || ''),
        telefone: String(plan.params.telefone || ''),
        data: String(plan.params.data || new Date().toISOString()),
        descricao: String(plan.params.descricao || ''),
        status: String(plan.params.status || 'agendado'),
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('agendamentos').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Agendamento criado com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Agendamento criado com sucesso.'),
      };
    }

    if (plan.action === 'create_garantia') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar garantia', message: 'Loja não identificada para criar garantia', dispatchPayload: null as string | null };
      }

      const payload = {
        osId: String(plan.params.osId || ''),
        osNumero: Number(plan.params.osNumero || 0),
        clienteNome: String(plan.params.clienteNome || ''),
        aparelhoDescricao: String(plan.params.aparelhoDescricao || ''),
        dataInicio: String(plan.params.dataInicio || new Date().toISOString()),
        diasGarantia: Number(plan.params.diasGarantia || 90),
        historico: [
          {
            data: new Date().toISOString(),
            acao: 'Cadastro via WhatsApp',
            descricao: String(plan.params.descricao || 'Garantia criada pelo assistente'),
          },
        ],
        ativo: true,
        loja_id: lojaId,
      };

      const { data, error } = await supabaseAdmin.from('garantias').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Garantia criada com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Garantia criada com sucesso.'),
      };
    }

    if (plan.action === 'create_loja') {
      const payload = {
        nome: String(plan.params.nome || ''),
        telefone: String(plan.params.telefone || ''),
        ativo: true,
      };

      const { data, error } = await supabaseAdmin.from('lojas').insert([payload]).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Loja criada com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Loja criada com sucesso.'),
      };
    }

    if (plan.action === 'update_loja') {
      const id = String(plan.params.id || '');
      const payload = {
        nome: String(plan.params.nome || ''),
        telefone: String(plan.params.telefone || ''),
      };

      const { data, error } = await supabaseAdmin.from('lojas').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return {
        data,
        error: null,
        message: 'Loja atualizada com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, 'Loja atualizada com sucesso.'),
      };
    }

    if (plan.action === 'list_lojas') {
      const { data, error } = await supabaseAdmin.from('lojas').select('id,nome,telefone,ativo').eq('ativo', true).order('nome');
      if (error) throw error;
      return {
        data,
        error: null,
        message: `Lojas encontradas: ${JSON.stringify(data || [])}`,
        dispatchPayload: buildDispatchPayload(senderPhone, 'Lista de lojas pronta para consulta.'),
      };
    }

    if (plan.action === 'search_entities') {
      const entity = String(plan.params.entity || 'clientes');
      const term = String(plan.params.term || '');
      let query = supabaseAdmin.from(entity).select('*').eq('ativo', true);

      if (entity === 'clientes') {
        query = query.or(`nome.ilike.%${term}%,telefone.ilike.%${term}%,email.ilike.%${term}%`);
      } else if (entity === 'aparelhos') {
        query = query.or(`marca.ilike.%${term}%,modelo.ilike.%${term}%,imei.ilike.%${term}%`);
      } else if (entity === 'tecnicos') {
        query = query.or(`nome.ilike.%${term}%,telefone.ilike.%${term}%`);
      } else if (entity === 'ordens_servico') {
        query = query.or(`clienteNome.ilike.%${term}%,aparelhoMarca.ilike.%${term}%,aparelhoModelo.ilike.%${term}%`);
      } else if (entity === 'agendamentos') {
        query = query.or(`clienteNome.ilike.%${term}%,telefone.ilike.%${term}%`);
      } else if (entity === 'garantias') {
        query = query.or(`clienteNome.ilike.%${term}%,aparelhoDescricao.ilike.%${term}%`);
      }

      if (entity !== 'lojas' && lojaId) {
        query = query.eq('loja_id', lojaId);
      }

      const { data, error } = await query.limit(10);
      if (error) throw error;
      return {
        data,
        error: null,
        message: `Busca concluída para ${entity}: ${JSON.stringify(data || [])}`,
        dispatchPayload: buildDispatchPayload(senderPhone, `Busca concluída para ${entity}.`),
      };
    }

    return { data: null, error: 'Ação não suportada ainda', message: 'Ação não suportada ainda', dispatchPayload: null as string | null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
      dispatchPayload: null as string | null,
    };
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('📥 [Webhook] Payload recebido em /api/webhook/evolution');
    const eventName = String(payload?.event || payload?.type || '');
    const isMessageEvent =
      eventName === 'messages.upsert' ||
      eventName === 'message.upsert' ||
      eventName.toLowerCase().includes('upsert');
    const tentativeMessageData = extractMessagePayload(payload);
    const hasMessageData = Boolean(
      tentativeMessageData?.message ||
      tentativeMessageData?.conversation ||
      tentativeMessageData?.text
    );

    if (!isMessageEvent && !hasMessageData) {
      console.log(`ℹ️ [Webhook] Ignorado por evento não-mensagem: ${eventName || 'sem_event'}`);
      return NextResponse.json({ status: 'ignored_event', event: eventName || null }, { status: 200 });
    }

    const messageData = tentativeMessageData;
    if (!messageData) {
      console.log('ℹ️ [Webhook] Ignorado: sem messageData no payload');
      return NextResponse.json({ status: 'ignored_no_message_data' }, { status: 200 });
    }

    const fromMe = Boolean(messageData?.key?.fromMe ?? messageData?.fromMe);
    if (fromMe) {
      console.log('ℹ️ [Webhook] Ignorado: mensagem fromMe=true');
      return NextResponse.json({ status: 'ignored_from_me' }, { status: 200 });
    }

    const remoteJid =
      messageData?.key?.remoteJid ||
      messageData?.key?.participant ||
      messageData?.remoteJid ||
      messageData?.participant ||
      messageData?.sender ||
      messageData?.from ||
      messageData?.jid ||
      '';

    const rawPhone = remoteJid.split('@')[0];
    const cleanPhone = normalizePhone(rawPhone);
    const localPhone = normalizeLocalBrazilPhone(rawPhone);
    if (!cleanPhone) {
      console.log('⚠️ [Webhook] Ignorado: não foi possível extrair telefone do payload');
      return NextResponse.json(
        {
          status: 'ignored_missing_phone',
          event: eventName || null,
          remoteJid: remoteJid || null,
        },
        { status: 200 }
      );
    }

    const phoneWithoutDDI = localPhone;
    const phoneCandidates = buildPhoneCandidates(rawPhone);

    const userMessage = extractMessageText(messageData);

    if (!userMessage) {
      console.log(`ℹ️ [Webhook] Ignorado: mensagem sem texto para ${cleanPhone}`);
      return NextResponse.json({ status: 'empty_message' }, { status: 200 });
    }

    console.log(`\n📩 [Zap Recebido] De: ${cleanPhone} | Mensagem: "${userMessage}"`);

    let contextStoreId: string | null = null;
    let userRole = 'DESCONHECIDO';
    let userName = 'Usuário';

    // Busca de Lojista
    const lojaPhoneOr = phoneCandidates.map((candidate) => `telefone.ilike.%${candidate}%`).join(',');
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('*')
      .or(lojaPhoneOr)
      .eq('ativo', true)
      .maybeSingle();

    if (loja) {
      contextStoreId = loja.id;
      userRole = 'LOJISTA';
      userName = loja.nome;
      console.log(`🔍 [Auth] Lojista Identificado: ${loja.nome} (ID: ${loja.id})`);
    } else {
      // Busca de Cliente
      const clientePhoneOr = phoneCandidates.map((candidate) => `telefone.ilike.%${candidate}%`).join(',');
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .or(clientePhoneOr)
        .eq('ativo', true)
        .maybeSingle();

      if (cliente) {
        contextStoreId = cliente.loja_id;
        userRole = 'CLIENTE';
        userName = cliente.nome;
        console.log(`🔍 [Auth] Cliente Identificado: ${cliente.nome} | Loja: ${cliente.loja_id}`);
      } else {
        const superAdminPhone = normalizePhone(process.env.WHATSAPP_SUPERADMIN_PHONE || '');
        const superAdminCandidates = buildPhoneCandidates(process.env.WHATSAPP_SUPERADMIN_PHONE || '');
        const isSuperAdmin = Boolean(
          superAdminPhone &&
          (
            cleanPhone === superAdminPhone ||
            superAdminCandidates.includes(phoneWithoutDDI) ||
            superAdminCandidates.some((candidate) => phoneCandidates.includes(candidate))
          )
        );

        if (isSuperAdmin) {
          userRole = 'SUPERADMIN';
          userName = 'Super Admin';
          console.log(`🔍 [Auth] Super Admin liberado por telefone: ${cleanPhone}`);
        } else {
          console.log(`⚠️ [Auth] Telefone ${cleanPhone} não encontrado no banco.`);
          await sendWhatsAppText(cleanPhone, 'Seu número não está cadastrado para usar este assistente.');
          return NextResponse.json({ status: 'unregistered_user' }, { status: 200 });
        }
      }
    }

    let aparelhosEstoque: any[] | null = null;
    let ordensServico: any[] | null = null;

    if (contextStoreId) {
      const [{ data: aparelhos }, { data: ordens }] = await Promise.all([
        supabaseAdmin
          .from('aparelhos')
          .select('id, marca, modelo, cor, capacidade, condicao, preco, imei')
          .eq('loja_id', contextStoreId)
          .eq('ativo', true),
        supabaseAdmin
          .from('ordens_servico')
          .select('numeroOS, clienteNome, aparelhoMarca, aparelhoModelo, defeito, status, precoVenda')
          .eq('loja_id', contextStoreId)
          .eq('ativo', true)
          .order('numeroOS', { ascending: false })
          .limit(10),
      ]);

      aparelhosEstoque = aparelhos;
      ordensServico = ordens;
    }

    const systemInstruction = `
Você é o assistente virtual inteligente do sistema Phone Center.
Você está conversando com um ${userRole} chamado(a) ${userName}.

--- DADOS DA LOJA DO SUPABASE ---
Estoque de Aparelhos Atuais:
${JSON.stringify(aparelhosEstoque, null, 2)}

Últimas Ordens de Serviço (OS):
${JSON.stringify(ordensServico, null, 2)}

--- REGRAS DE RESPOSTA ---
- Responda de forma direta, cortês e objetiva via WhatsApp.
- Se a mensagem for um comando de gestão, responda APENAS com um JSON válido nesse formato:
  {"type":"command","action":"create_aparelho","params":{...}}
- Se a mensagem não for um comando, responda normalmente com um texto claro.
`;

    let plannedCommand: GeminiCommandPlan | null = null;
    let finalReply = '';
    let commandResponse = null;
    let plannedAction = null;
    let geminiFallbackUsed = false;

    console.log('🤖 [Gemini] Processando resposta com Gemini...');
    try {
      const generated = await generateContentWithModelFallback(userMessage, systemInstruction);
      const aiReply = generated.text;
      console.log(`🤖 [Gemini] Modelo usado: ${generated.modelUsed}`);
      console.log(`💬 [Gemini Resposta]: "${aiReply}"`);
      plannedCommand = parseGeminiPlan(aiReply);
      finalReply = aiReply;
    } catch (geminiError) {
      geminiFallbackUsed = true;
      console.error('⚠️ [Gemini] Falha ao gerar resposta:', geminiError);

      plannedCommand = buildFallbackCommandFromText(userMessage);
      if (plannedCommand) {
        finalReply = 'Comando recebido. Processando em modo contingência.';
      } else {
        finalReply = '⚠️ IA temporariamente indisponível. Tente novamente em instantes.';
      }
    }

    if (plannedCommand) {
      try {
        const execution = await executeGeminiCommand(plannedCommand, contextStoreId, cleanPhone);
        commandResponse = execution;
        plannedAction = plannedCommand.action;

        if (execution.error) {
          finalReply = buildWhatsAppText('error', { error: execution.message }, cleanPhone);
        } else {
          finalReply = buildWhatsAppText(plannedCommand.action, execution.data, cleanPhone);
        }
      } catch (cmdError) {
        finalReply = 'Falha ao executar o comando solicitado.';
        console.error('❌ [Command Error]:', cmdError);
        await notifyAdminError(`Falha ao executar comando para ${cleanPhone}. Erro: ${cmdError instanceof Error ? cmdError.message : 'Desconhecido'}`);
      }
    }

    const delivery = await sendWhatsAppText(cleanPhone, finalReply);
    if (!delivery.ok) {
      console.error('❌ [Evolution API] Erro ao enviar mensagem:', delivery.error);
      await notifyAdminError(`Erro de envio para ${cleanPhone}: ${delivery.error}`);
      return NextResponse.json(
        {
          status: 'delivery_error',
          event: eventName || null,
          message: delivery.error,
          commandDetected: Boolean(plannedCommand),
          geminiFallbackUsed,
        },
        { status: 200 }
      );
    } else {
      console.log(`🚀 [Evolution API] Mensagem enviada para ${cleanPhone} com sucesso.`);
    }

    return NextResponse.json(
      {
        status: 'success',
        command: commandResponse ? { action: plannedAction ?? null, message: commandResponse.message } : null,
        dispatchPayload: commandResponse?.dispatchPayload ?? null,
        event: eventName,
        commandDetected: Boolean(plannedCommand),
        geminiFallbackUsed,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ [Webhook Error]:', error);
    await notifyAdminError(`Erro no catch principal do webhook: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}