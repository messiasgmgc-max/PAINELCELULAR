import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarTextoWhatsApp, formatarTelefoneWhatsApp } from '@/lib/whatsappService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      lojaId, 
      clienteId, 
      destinatarios: destinatariosFrontend,
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

    // 2. Montar lista de devedores consolidada
    let devedoresParaDisparo: Array<{
      id?: string;
      nome: string;
      telefone?: string;
      whatsapp?: string;
      saldo_devedor: number;
    }> = [];

    // Se o frontend passou a lista exata exibida na tela sob "Fiado & Devedores"
    if (Array.isArray(destinatariosFrontend) && destinatariosFrontend.length > 0) {
      devedoresParaDisparo = destinatariosFrontend.map((d: any) => ({
        id: d.id,
        nome: d.nome || d.lojistaNome,
        telefone: d.whatsapp || d.telefone,
        whatsapp: d.whatsapp || d.telefone,
        saldo_devedor: Number(d.saldoDevedor || d.saldo_devedor || 0),
      })).filter((d: any) => d.saldo_devedor > 0.01);
    } else {
      // Caso contrário, busca na tabela lojistas_devedores e sincroniza com vendas
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

      const { data: devedoresDb } = await query;
      devedoresParaDisparo = (devedoresDb || []).map(d => ({
        id: d.id,
        nome: d.nome,
        telefone: d.whatsapp || d.telefone,
        whatsapp: d.whatsapp || d.telefone,
        saldo_devedor: Number(d.saldo_devedor || 0),
      }));

      // Se nenhum devedor estava cadastrado com saldo > 0 na tabela lojistas_devedores,
      // sincroniza dinamicamente a partir das vendas da loja com fiado/pendente
      if (devedoresParaDisparo.length === 0 && !clienteId) {
        try {
          const { data: vendasPendentes } = await supabaseAdmin
            .from('vendas')
            .select('clienteNome, valor, valorPago, saldoDevedor, metodo, status, clienteTelefone')
            .eq('loja_id', lojaId);

          if (vendasPendentes && vendasPendentes.length > 0) {
            const mapDeb = new Map<string, { nome: string; telefone: string; saldo: number }>();
            vendasPendentes.forEach(v => {
              const nome = (v.clienteNome || '').trim();
              if (!nome || ['não informado', 'lojista / revenda', 'cliente balcão'].includes(nome.toLowerCase())) return;
              
              const val = Number(v.valor || 0);
              const pago = Number(v.valorPago || 0);
              let dev = 0;
              if (v.saldoDevedor !== undefined && v.saldoDevedor !== null && Number(v.saldoDevedor) > 0) {
                dev = Number(v.saldoDevedor);
              } else if (v.metodo === 'fiado' || v.status === 'pendente' || v.status === 'parcial') {
                dev = Math.max(0, val - pago);
                if (dev <= 0 && v.status !== 'pago') dev = val;
              }

              if (dev > 0.01) {
                const chave = nome.toLowerCase();
                if (!mapDeb.has(chave)) {
                  mapDeb.set(chave, { nome, telefone: v.clienteTelefone || '', saldo: dev });
                } else {
                  mapDeb.get(chave)!.saldo += dev;
                }
              }
            });

            mapDeb.forEach((item) => {
              devedoresParaDisparo.push({
                nome: item.nome,
                telefone: item.telefone,
                whatsapp: item.telefone,
                saldo_devedor: item.saldo,
              });
            });
          }
        } catch (eSync) {
          console.warn('Aviso ao sincronizar vendas pendentes para cobrança:', eSync);
        }
      }
    }

    if (!devedoresParaDisparo || devedoresParaDisparo.length === 0) {
      return NextResponse.json({
        success: true,
        totalEnviados: 0,
        totalFalhas: 0,
        mensagem: 'Nenhum lojista devedor com saldo em aberto encontrado para envio.'
      });
    }

    const resultados: any[] = [];
    let enviadosCount = 0;
    let falhasCount = 0;

    for (const dev of devedoresParaDisparo) {
      let tel = dev.whatsapp || dev.telefone || '';

      // Se não veio telefone, busca em lojistas_devedores, clientes ou compradores_frequentes
      if (!tel) {
        try {
          const { data: lDb } = await supabaseAdmin
            .from('lojistas_devedores')
            .select('whatsapp, telefone')
            .eq('loja_id', lojaId)
            .ilike('nome', dev.nome.trim())
            .maybeSingle();
          if (lDb?.whatsapp || lDb?.telefone) tel = lDb.whatsapp || lDb.telefone || '';
        } catch {}

        if (!tel) {
          try {
            const { data: compDb } = await supabaseAdmin
              .from('compradores_frequentes')
              .select('telefone')
              .eq('loja_id', lojaId)
              .ilike('nome', dev.nome.trim())
              .maybeSingle();
            if (compDb?.telefone) tel = compDb.telefone;
          } catch {}
        }

        if (!tel) {
          try {
            const { data: cliDb } = await supabaseAdmin
              .from('clientes')
              .select('telefone')
              .eq('loja_id', lojaId)
              .ilike('nome', dev.nome.trim())
              .maybeSingle();
            if (cliDb?.telefone) tel = cliDb.telefone;
          } catch {}
        }
      }

      const cleanPhone = formatarTelefoneWhatsApp(tel);
      const saldoFmt = Number(dev.saldo_devedor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      if (!cleanPhone || cleanPhone.length < 10) {
        resultados.push({
          cliente: dev.nome,
          status: 'erro',
          motivo: `Número de WhatsApp não cadastrado para o lojista "${dev.nome}"`
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

      // Envio Real via Evolution API (com retry 12/13 dígitos)
      const envio = await enviarTextoWhatsApp({
        lojaId,
        telefone: cleanPhone,
        texto: textoFinal,
      });

      if (!envio.success) {
        resultados.push({
          cliente: dev.nome,
          status: 'erro',
          motivo: envio.error || 'Falha ao entregar mensagem no WhatsApp'
        });
        falhasCount++;
      } else {
        enviadosCount++;
        resultados.push({
          cliente: dev.nome,
          telefone: cleanPhone,
          status: 'enviado'
        });

        // Atualizar último disparo no cliente (se tiver id na tabela lojistas_devedores)
        if (dev.id && !String(dev.id).startsWith('venda-')) {
          await supabaseAdmin
            .from('lojistas_devedores')
            .update({ ultimo_disparo_cobranca: new Date().toISOString() })
            .eq('id', dev.id);
        } else {
          await supabaseAdmin
            .from('lojistas_devedores')
            .update({ ultimo_disparo_cobranca: new Date().toISOString() })
            .eq('loja_id', lojaId)
            .ilike('nome', dev.nome.trim());
        }

        // Inserir registro no histórico de cobranças
        try {
          await supabaseAdmin.from('historico_cobrancas_atacado').insert({
            loja_id: lojaId,
            lojista_id: dev.id && !String(dev.id).startsWith('venda-') ? dev.id : undefined,
            lojista_nome: dev.nome,
            whatsapp: cleanPhone,
            valor_cobrado: Number(dev.saldo_devedor || 0),
            mensagem_enviada: textoFinal,
            status: 'enviado',
            origem: clienteId ? 'manual_unitario' : 'manual_lote'
          });
        } catch {}
      }
    }

    return NextResponse.json({
      success: enviadosCount > 0 || (modoSimulacao && devedoresParaDisparo.length > 0),
      totalEnviados: enviadosCount,
      totalFalhas: falhasCount,
      resultados,
      mensagem: modoSimulacao 
        ? `Simulação concluída: ${enviadosCount} devedor(es) receberiam mensagem.`
        : (falhasCount > 0 && enviadosCount === 0)
          ? `Nenhuma mensagem enviada. ${falhasCount} falha(s): ${resultados.find(r => r.status === 'erro')?.motivo || ''}`
          : `Cobranças enviadas: ${enviadosCount} sucesso(s) e ${falhasCount} falha(s).`
    });

  } catch (err: any) {
    console.error('Erro na rota de disparo de cobranças:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao disparar cobranças' }, { status: 500 });
  }
}
