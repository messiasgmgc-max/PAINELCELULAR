import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildDispatchPayload, buildWhatsAppText, parseGeminiPlan } from './commandExecutor';

// Inicializa a SDK do Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Função fofoqueira pra te avisar da merda no zap
async function caguetarErroNoZap(motivo: string) {
  try {
    await fetch('https://evolution-api-test-efae.up.railway.app/message/sendText/Webhook-Lucasimports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'D7A3EDF9C2B5-4FB5-86C8-6041D1C8DB87'
      },
      body: JSON.stringify({
        number: "31993586377",
        text: `🚨 *DEU MERDA NO WEBHOOK, SÔ!*\n\nMotivo: ${motivo}`
      })
    });
  } catch (e) {
    console.error('Puta que pariu, nem o aviso de erro funcionou:', e);
  }
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

    if (payload.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_event' }, { status: 200 });
    }

    const messageData = payload.data;

    if (messageData.key.fromMe) {
      return NextResponse.json({ status: 'ignored_from_me' }, { status: 200 });
    }

    const remoteJid = messageData.key.remoteJid || '';
    const rawPhone = remoteJid.split('@')[0];
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone;

    const userMessage =
      messageData.message?.conversation ||
      messageData.message?.extendedTextMessage?.text ||
      '';

    if (!userMessage) {
      await caguetarErroNoZap(`O arrombado do ${cleanPhone} mandou uma mensagem vazia ou arquivo sem texto.`);
      return NextResponse.json({ status: 'empty_message' }, { status: 200 });
    }

    console.log(`\n📩 [Zap Recebido] De: ${cleanPhone} | Mensagem: "${userMessage}"`);

    // Busca de Lojista
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('*')
      .or(`telefone.ilike.%${phoneWithoutDDI}%`)
      .eq('ativo', true)
      .maybeSingle();

    let contextStoreId: string | null = null;
    let userRole = '';
    let userName = '';

    if (loja) {
      contextStoreId = loja.id;
      userRole = 'LOJISTA';
      userName = loja.nome;
      console.log(`🔍 [Auth] Lojista Identificado: ${loja.nome} (ID: ${loja.id})`);
    } else {
      // Busca de Cliente
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .or(`telefone.ilike.%${phoneWithoutDDI}%`)
        .eq('ativo', true)
        .maybeSingle();

      if (cliente) {
        contextStoreId = cliente.loja_id;
        userRole = 'CLIENTE';
        userName = cliente.nome;
        console.log(`🔍 [Auth] Cliente Identificado: ${cliente.nome} | Loja: ${cliente.loja_id}`);
      } else {
        console.log(`⚠️ [Auth] Telefone ${cleanPhone} não encontrado no banco.`);
        await caguetarErroNoZap(`Telefone não cadastrado tentou usar o bot: ${cleanPhone}`);
        return NextResponse.json({ status: 'unregistered_user' }, { status: 200 });
      }
    }

    const { data: aparelhosEstoque } = await supabaseAdmin
      .from('aparelhos')
      .select('id, marca, modelo, cor, capacidade, condicao, preco, imei')
      .eq('loja_id', contextStoreId)
      .eq('ativo', true);

    const { data: ordensServico } = await supabaseAdmin
      .from('ordens_servico')
      .select('numeroOS, clienteNome, aparelhoMarca, aparelhoModelo, defeito, status, precoVenda')
      .eq('loja_id', contextStoreId)
      .eq('ativo', true)
      .order('numeroOS', { ascending: false })
      .limit(10);

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

    console.log('🤖 [Gemini] Processando resposta com Gemini Flash Lite...');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: userMessage,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const aiReply = response.text || '';
    console.log(`💬 [Gemini Resposta]: "${aiReply}"`);

    const plannedCommand = parseGeminiPlan(aiReply);
    let finalReply = aiReply;
    let commandResponse = null;
    let plannedAction = null;

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
        await caguetarErroNoZap(`Falha ao executar o comando solicitado pelo ${cleanPhone}.\nErro: ${cmdError instanceof Error ? cmdError.message : 'Desconhecido'}`);
      }
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (evolutionUrl && instanceName && apiKey) {
      await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: finalReply,
        }),
      });
      console.log(`🚀 [Evolution API] Mensagem enviada para ${cleanPhone} com sucesso!`);
    } else {
      console.log('⚠️ Variáveis da Evolution API não configuradas para envio da mensagem.');
      await caguetarErroNoZap(`As variáveis da Evolution API sumiram do .env, o zap de resposta pro cliente não foi enviado!`);
    }

    return NextResponse.json(
      {
        status: 'success',
        command: commandResponse ? { action: plannedAction ?? null, message: commandResponse.message } : null,
        dispatchPayload: commandResponse?.dispatchPayload ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ [Webhook Error]:', error);
    await caguetarErroNoZap(`Erro no catch principal da função POST:\n${error instanceof Error ? error.message : JSON.stringify(error)}`);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}