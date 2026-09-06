import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

function formatarTelefoneWhatsApp(numeroRaw: string): string {
  let limpo = numeroRaw.replace(/\D/g, '');
  if (!limpo) return '';
  // Se for DDD + 8 ou 9 dígitos sem código do país (ex: 31999999999 ou 11988887777)
  if (limpo.length === 10 || limpo.length === 11) {
    limpo = '55' + limpo;
  }
  return limpo;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      lojaId, 
      clienteId, 
      mensagemPersonalizada, 
      modoSimulacao = false 
    } = body;

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    // 1. Buscar loja e configurações
    const { data: loja, error: errLoja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, chave_pix, chave_pix_cobranca, config_atacado')
      .eq('id', lojaId)
      .maybeSingle();

    if (errLoja || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const configAtacado = loja.config_atacado || {};
    const templateMsg = mensagemPersonalizada || configAtacado.modelo_mensagem || 
      'Olá {nome}! Tudo bem? Passando para lembrar sobre seu saldo em aberto de R$ {valor} no {nome_loja}.\n\nChave PIX: {chave_pix}';

    const chavePixLoja = loja.chave_pix || loja.chave_pix_cobranca || 'Solicitar via WhatsApp';
    const nomeLoja = loja.nome || 'Phone Center';

    // 2. Buscar destinatários
    let query = supabaseAdmin
      .from('lojistas_devedores')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('ativo', true);

    if (clienteId) {
      query = query.eq('id', clienteId);
    } else {
      query = query.gt('saldo_devedor', 0);
    }

    const { data: devedores, error: errDev } = await query;
    if (errDev) throw errDev;

    if (!devedores || devedores.length === 0) {
      return NextResponse.json({
        success: true,
        totalEnviados: 0,
        mensagem: 'Nenhum lojista devedor com saldo em aberto encontrado para envio.'
      });
    }

    // Configurações da Evolution API
    let evolutionUrl = (process.env.EVOLUTION_API_URL || 'http://13.140.36.50:8080').trim().replace(/\/+$/, '');
    if (!evolutionUrl.startsWith('http://') && !evolutionUrl.startsWith('https://')) {
      evolutionUrl = 'http://' + evolutionUrl;
    }
    const evolutionApiKey = (process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449').trim();

    // Buscar sessão/instância do WhatsApp vinculada à loja
    const { data: session } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('session_name')
      .eq('loja_id', lojaId)
      .maybeSingle();

    const instanceName = session?.session_name || process.env.EVOLUTION_INSTANCE_NAME || 'lucasimports';

    const resultados: any[] = [];
    let enviadosCount = 0;
    let falhasCount = 0;

    for (const dev of devedores) {
      const tel = dev.whatsapp || dev.telefone || '';
      const cleanPhone = formatarTelefoneWhatsApp(tel);
      const saldoFmt = Number(dev.saldo_devedor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      if (!cleanPhone || cleanPhone.length < 10) {
        resultados.push({
          cliente: dev.nome,
          status: 'erro',
          motivo: 'Número de WhatsApp inválido ou não cadastrado'
        });
        falhasCount++;
        continue;
      }

      // Interpolação de variáveis no texto
      const textoFinal = templateMsg
        .replace(/\{nome\}/gi, dev.nome)
        .replace(/\{valor\}/gi, saldoFmt)
        .replace(/\{chave_pix\}/gi, chavePixLoja)
        .replace(/\{nome_loja\}/gi, nomeLoja);

      if (modoSimulacao) {
        resultados.push({
          cliente: dev.nome,
          telefone: cleanPhone,
          valor: dev.saldo_devedor,
          mensagem: textoFinal,
          status: 'simulado'
        });
        enviadosCount++;
        continue;
      }

      // Envio Real via Evolution API
      try {
        const endpoint = `${evolutionUrl}/message/sendText/${instanceName}`;
        const resEnvio = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolutionApiKey
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: textoFinal,
            options: { delay: 1200, presence: 'composing' }
          })
        });

        if (!resEnvio.ok) {
          const errBody = await resEnvio.text();
          resultados.push({
            cliente: dev.nome,
            status: 'erro',
            motivo: `Evolution API (${resEnvio.status}): ${errBody.slice(0, 100)}`
          });
          falhasCount++;
        } else {
          // Sucesso
          enviadosCount++;
          resultados.push({
            cliente: dev.nome,
            telefone: cleanPhone,
            status: 'enviado'
          });

          // Atualizar último disparo no cliente
          await supabaseAdmin
            .from('lojistas_devedores')
            .update({ ultimo_disparo_cobranca: new Date().toISOString() })
            .eq('id', dev.id);

          // Inserir registro no histórico
          await supabaseAdmin.from('historico_cobrancas_atacado').insert({
            loja_id: lojaId,
            lojista_id: dev.id,
            lojista_nome: dev.nome,
            whatsapp: cleanPhone,
            valor_cobrado: Number(dev.saldo_devedor || 0),
            mensagem_enviada: textoFinal,
            status: 'enviado',
            origem: clienteId ? 'manual_unitario' : 'manual_lote'
          });
        }
      } catch (sendErr: any) {
        console.error(`Falha no envio para ${dev.nome}:`, sendErr);
        resultados.push({
          cliente: dev.nome,
          status: 'erro',
          motivo: sendErr.message || 'Erro de rede'
        });
        falhasCount++;
      }
    }

    return NextResponse.json({
      success: true,
      totalEnviados: enviadosCount,
      totalFalhas: falhasCount,
      resultados,
      mensagem: modoSimulacao 
        ? `Simulação de ${enviadosCount} cobrança(s) gerada com sucesso!`
        : `Cobranças enviadas: ${enviadosCount} sucesso(s) e ${falhasCount} falha(s).`
    });

  } catch (err: any) {
    console.error('Erro na rota de disparo de cobranças:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao disparar cobranças' }, { status: 500 });
  }
}
