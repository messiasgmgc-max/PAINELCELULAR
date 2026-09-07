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
    const defaultMsg = 'Olá {nome}! Tudo bem? Passando para lembrar sobre os pagamentos pendentes das suas retiradas de atacado na {nome_loja}.\n\n*Saldo em aberto: {valor}*\n\nChave Pix para quitação: {chave_pix}\n\nSe já realizou a transferência, por favor nos envie o comprovante!';
    const templateMsg = mensagemPersonalizada || configAtacado.mensagem_template || configAtacado.modelo_mensagem || defaultMsg;

    const chavePixLoja = configAtacado.chave_pix || loja.chave_pix || loja.chave_pix_cobranca || 'Solicitar via WhatsApp';
    const nomeLoja = loja.nome || 'Lucas Imports';

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

      // ── Montagem dinâmica dos Itens e Extrato Detalhado do Lojista ──
      let listaItensSimples = '';
      let listaItensDetalhados = '';
      let blocoExtratoCompleto = '';

      try {
        const { data: vendasLojista } = await supabaseAdmin
          .from('vendas')
          .select('id, descricao, itens, valor, valorPago, saldoDevedor, metodo, status, dataPagamento, dataVencimento, created_at')
          .eq('loja_id', lojaId)
          .ilike('clienteNome', dev.nome.trim())
          .order('dataPagamento', { ascending: false });

        const pendentes = (vendasLojista || []).filter(v => {
          const val = Number(v.valor || 0);
          const pago = Number(v.valorPago || 0);
          const saldo = v.saldoDevedor !== undefined && v.saldoDevedor !== null ? Number(v.saldoDevedor) : (val - pago);
          return saldo > 0.01 || v.metodo === 'fiado' || v.status === 'pendente' || v.status === 'parcial';
        });

        const itensColetados: Array<{
          modelo: string;
          detalhes: string;
          valor: number;
          data: string;
          vencimento?: string;
        }> = [];

        pendentes.forEach(v => {
          const dataVenda = v.dataPagamento || v.created_at ? new Date(v.dataPagamento || v.created_at).toLocaleDateString('pt-BR') : '';
          const dataVenc = v.dataVencimento ? new Date(v.dataVencimento).toLocaleDateString('pt-BR') : undefined;

          if (v.itens && Array.isArray(v.itens) && v.itens.length > 0) {
            v.itens.forEach((it: any) => {
              const valItem = Number(it.total || it.valorExibir || it.valor || (v.valor / v.itens.length));
              const desc = it.descricao || it.modelo || 'Aparelho';
              const imei = it.imei || '';
              const cor = it.cor || '';
              const cap = it.capacidade || '';
              const extraParts = [cap, cor, imei ? `IMEI: ${imei}` : ''].filter(Boolean).join(' · ');

              itensColetados.push({
                modelo: desc,
                detalhes: extraParts ? `${desc} (${extraParts})` : desc,
                valor: valItem,
                data: dataVenda,
                vencimento: dataVenc,
              });
            });
          } else {
            const valVenda = Number(v.saldoDevedor || v.valor || 0);
            itensColetados.push({
              modelo: v.descricao || 'Pedido / Aparelho',
              detalhes: v.descricao || 'Pedido / Aparelho',
              valor: valVenda,
              data: dataVenda,
              vencimento: dataVenc,
            });
          }
        });

        if (itensColetados.length > 0) {
          listaItensSimples = itensColetados
            .map(it => `• ${it.modelo} (R$ ${it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
            .join('\n');

          listaItensDetalhados = itensColetados
            .map(it => `• ${it.detalhes} - R$ ${it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` + (it.vencimento ? ` (Venc: ${it.vencimento})` : ''))
            .join('\n');
        } else {
          listaItensSimples = `• Saldo devedor consolidado: R$ ${saldoFmt}`;
          listaItensDetalhados = `• Saldo devedor consolidado: R$ ${saldoFmt}`;
        }

        // Monta bloco de extrato completo (idêntico ao copia e cola do Fiado)
        let ext = `📦 *PEDIDOS E APARELHOS EM ABERTO:*\n`;
        if (pendentes.length > 0) {
          pendentes.forEach(p => {
            const dataV = p.dataPagamento || p.created_at ? new Date(p.dataPagamento || p.created_at).toLocaleDateString('pt-BR') : '';
            const valTotal = Number(p.valor || 0);
            const valPago = Number(p.valorPago || 0);
            const valSaldo = Math.max(0, valTotal - valPago);
            const venc = p.dataVencimento ? ` | Vencimento: ${new Date(p.dataVencimento).toLocaleDateString('pt-BR')}` : '';

            ext += `⏳ *${p.descricao || 'Pedido'}* (${dataV})\n`;
            ext += `   Valor: R$ ${valTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            if (valPago > 0) {
              ext += ` | Já pago: R$ ${valPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | *Resta: R$ ${valSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
            }
            ext += `${venc}\n`;

            // Se o pedido tiver aparelhos detalhados internamente
            if (p.itens && Array.isArray(p.itens) && p.itens.length > 0) {
              p.itens.forEach((it: any) => {
                const im = it.imei ? ` | IMEI: ${it.imei}` : '';
                const corCap = [it.capacidade, it.cor].filter(Boolean).join(' ');
                ext += `   └ 📱 ${it.descricao || it.modelo}${corCap ? ` (${corCap})` : ''}${im} (R$ ${Number(it.total || it.valorExibir || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
              });
            }
          });
        } else {
          ext += `• Saldo total em aberto: R$ ${saldoFmt}\n`;
        }

        blocoExtratoCompleto = ext.trim();
      } catch (errItens) {
        console.warn('Aviso ao montar itens detalhados para cobrança:', errItens);
        listaItensSimples = `• Saldo em aberto: R$ ${saldoFmt}`;
        listaItensDetalhados = `• Saldo em aberto: R$ ${saldoFmt}`;
        blocoExtratoCompleto = `• Saldo total em aberto: R$ ${saldoFmt}`;
      }

      // Interpolação de variáveis no texto
      const textoFinal = templateMsg
        .replace(/\{nome\}/gi, dev.nome)
        .replace(/\{valor\}/gi, saldoFmt)
        .replace(/\{chave_pix\}/gi, chavePixLoja)
        .replace(/\{nome_loja\}/gi, nomeLoja)
        .replace(/\{itens_detalhados\}/gi, listaItensDetalhados)
        .replace(/\{itens\}/gi, listaItensSimples)
        .replace(/\{extrato_completo\}/gi, blocoExtratoCompleto)
        .replace(/\{extrato\}/gi, blocoExtratoCompleto);

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
        }

        // Histórico de auditoria de disparos de atacado
        try {
          await supabaseAdmin.from('historico_cobrancas_atacado').insert([{
            loja_id: lojaId,
            lojista_id: dev.id && !String(dev.id).startsWith('venda-') ? dev.id : null,
            lojista_nome: dev.nome,
            whatsapp: cleanPhone,
            valor_cobrado: dev.saldo_devedor,
            mensagem_enviada: textoFinal,
            status: 'enviado',
            origem: 'manual_lote',
          }]);
        } catch (eLog) {
          console.warn('Aviso histórico cobrança:', eLog);
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessados: devedoresParaDisparo.length,
      totalEnviados: enviadosCount,
      totalFalhas: falhasCount,
      mensagem: modoSimulacao 
        ? `Simulação concluída: ${enviadosCount} lojista(s) devedor(es) receberiam mensagem.`
        : `Disparo finalizado: ${enviadosCount} mensagem(ns) enviada(s) com sucesso.`,
      resultados
    });

  } catch (err: any) {
    console.error('Erro na rota de disparo de cobrança de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
