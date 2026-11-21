import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { formatarBRL, sufixoTelefoneComparacao } from '@/lib/crm-bridge/queries';
import { registrarLog } from '@/lib/logger';
import { gerarReciboPdfBuffer } from '@/lib/recibo/gerarReciboPdf';
import { ErroVenda, registrarVendaAtomica } from '@/lib/vendas/vendaAtomica';
import { codigoVenda, nomeArquivoRecibo } from '@/lib/whatsapp/reciboWhatsapp';
import { enviarDocumentoWhatsApp } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * POST /api/crm-bridge/pre-venda
 * Fecha a venda pelo chat do PhoneCenterCRM com baixa atômica no estoque,
 * vinculação de cliente/reserva/proposta, geração de Notinha PDF oficial e envio opcional no WhatsApp!
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const aparelhoId = body.aparelhoId ? String(body.aparelhoId).trim() : '';
    const modeloNovo = String(body.modeloNovo || '').trim();
    const clienteNome = String(body.clienteNome || 'Cliente WhatsApp').trim();
    const clienteTelefone = String(body.clienteTelefone || '').trim();
    const clienteCpf = String(body.clienteCpf || '').trim();
    const valorVenda = Math.max(0, Number(body.valorVenda || 0));
    const valorTroca = Math.max(0, Number(body.valorTroca || 0));
    const trocaModelo = String(body.trocaModelo || '').trim();
    const entradaPix = Math.max(0, Number(body.entradaPix || 0));
    const formaPagamento = String(body.formaPagamento || 'pix').trim().toLowerCase();
    const vendedorNome = String(body.vendedorNome || auth.usuario?.nome || 'Atendimento CRM').trim();
    const reservaPixId = body.reservaPixId ? String(body.reservaPixId).trim() : '';
    const propostaId = body.propostaId ? String(body.propostaId).trim() : '';
    const enviarWhatsapp = Boolean(body.enviarWhatsapp);
    const conversationId = body.conversationId ? String(body.conversationId).trim() : '';

    if (!modeloNovo || valorVenda <= 0) {
      return crmBridgeJson(
        { ok: false, error: 'Informe modeloNovo e valorVenda (> 0).' },
        400,
        req
      );
    }

    // 1. Localiza ou cadastra cliente no ERP
    let clienteId: string | null = null;
    const sufixoTel = sufixoTelefoneComparacao(clienteTelefone);
    if (sufixoTel.length >= 8) {
      const { data: cliExist } = await supabaseAdmin
        .from('clientes')
        .select('id, nome')
        .eq('loja_id', loja.id)
        .ilike('telefone', `%${sufixoTel}%`)
        .limit(1)
        .maybeSingle();
      if (cliExist?.id) clienteId = String(cliExist.id);
    }
    if (!clienteId && clienteNome) {
      const { data: cliNovo } = await supabaseAdmin
        .from('clientes')
        .insert({
          loja_id: loja.id,
          nome: clienteNome,
          telefone: clienteTelefone,
          cpf: clienteCpf,
          email: '',
          dataCadastro: new Date().toISOString(),
          ativo: true,
        })
        .select('id')
        .maybeSingle();
      if (cliNovo?.id) clienteId = String(cliNovo.id);
    }

    // 2. Busca aparelho no estoque caso aparelhoId tenha sido informado
    let aparelhoRow: Record<string, unknown> | null = null;
    if (aparelhoId) {
      const { data: ap } = await supabaseAdmin
        .from('aparelhos')
        .select('*')
        .eq('id', aparelhoId)
        .eq('loja_id', loja.id)
        .maybeSingle();
      if (!ap) {
        return crmBridgeJson(
          { ok: false, error: 'Aparelho não encontrado nesta loja.' },
          404,
          req
        );
      }
      aparelhoRow = ap as Record<string, unknown>;
    }

    const custo = aparelhoRow ? Number(aparelhoRow.custo || 0) : 0;
    const valorLiquido = Math.max(0, valorVenda - valorTroca);
    const lucro = Number((valorVenda - custo).toFixed(2));
    const agora = new Date().toISOString();
    const descricaoAparelho = aparelhoRow
      ? [
          aparelhoRow.modelo,
          aparelhoRow.capacidade,
          aparelhoRow.cor,
        ]
          .filter(Boolean)
          .join(' ')
      : modeloNovo;

    const registroVenda: Record<string, unknown> = {
      loja_id: loja.id,
      clienteId: clienteId || undefined,
      clienteNome,
      aparelhoDescricao: descricaoAparelho,
      valor: valorVenda,
      custo,
      lucro,
      percentualLucro: custo > 0 ? Number(((lucro / custo) * 100).toFixed(2)) : 0,
      metodo: formaPagamento || 'pix',
      status: 'pago',
      valorPago: valorLiquido,
      saldoDevedor: 0,
      tipoEntrega: 'Varejo',
      vendedor: vendedorNome,
      dataPagamento: agora,
      descricao: `Venda CRM - ${descricaoAparelho} para ${clienteNome}`,
      itens: [
        {
          id: Date.now().toString(),
          aparelhoId: aparelhoRow?.id || undefined,
          descricao: descricaoAparelho,
          quantidade: 1,
          valorInterno: custo,
          valorExibir: valorVenda,
          desconto: 0,
          tipoDesconto: 'R$',
          total: valorVenda,
          observacao: aparelhoRow?.imei ? `IMEI: ${aparelhoRow.imei}` : '',
          imei: String(aparelhoRow?.imei || ''),
        },
      ],
      ativo: true,
      taxa_cartao: 0,
    };

    let vendaId = '';
    if (aparelhoRow?.id) {
      try {
        const resAtom = await registrarVendaAtomica(supabaseAdmin, {
          venda: registroVenda,
          aparelhoIds: [String(aparelhoRow.id)],
          camposAparelho: { [String(aparelhoRow.id)]: { cliente: clienteNome } },
          origem: 'crm_venda',
          usuarioId: auth.usuario?.id || null,
          usuarioNome: vendedorNome,
          observacao: `Venda fechada no PhoneCenterCRM para ${clienteNome}`,
        });
        vendaId = String(resAtom.venda.id);
      } catch (err) {
        if (err instanceof ErroVenda && err.codigo === 'fora_do_estoque') {
          return crmBridgeJson({ ok: false, error: err.message }, 409, req);
        }
        throw err;
      }
    } else {
      const { data: vIns, error: vErr } = await supabaseAdmin
        .from('vendas')
        .insert(registroVenda)
        .select('id')
        .single();
      if (vErr || !vIns?.id) {
        throw new Error(vErr?.message || 'Erro ao registrar venda no banco.');
      }
      vendaId = String(vIns.id);
    }

    // 3. Atualiza reserva Pix e proposta vinculadas (não-bloqueante)
    if (reservaPixId) {
      await supabaseAdmin
        .from('crm_reservas_pix')
        .update({ status: 'pago', pago_em: agora, updated_at: agora })
        .eq('id', reservaPixId)
        .eq('loja_id', loja.id);
    }
    if (propostaId) {
      await supabaseAdmin
        .from('crm_propostas')
        .update({ status: 'aceita', aceita_em: agora, updated_at: agora })
        .eq('id', propostaId)
        .eq('loja_id', loja.id);
    }

    // 4. Gera Notinha PDF oficial + link público
    const { data: lojaInfo } = await supabaseAdmin
      .from('lojas')
      .select('nome, cnpj, telefone, endereco, logo_url, assinatura_url, garantia_dias, dias_garantia')
      .eq('id', loja.id)
      .maybeSingle();

    const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://app.phonecenter.tech').replace(
      /\/+$/,
      ''
    );
    const linkRecibo = `${origin}/recibo/${vendaId}`;
    const cod = codigoVenda(vendaId);

    const pdfBuffer = await gerarReciboPdfBuffer({
      vendaId,
      codigoVenda: cod,
      loja: {
        nome: String(lojaInfo?.nome || loja.nome),
        cnpj: lojaInfo?.cnpj ? String(lojaInfo.cnpj) : null,
        telefone: lojaInfo?.telefone ? String(lojaInfo.telefone) : null,
        endereco: lojaInfo?.endereco ? String(lojaInfo.endereco) : null,
        logoUrl: lojaInfo?.logo_url ? String(lojaInfo.logo_url) : null,
        assinaturaUrl: lojaInfo?.assinatura_url ? String(lojaInfo.assinatura_url) : null,
      },
      cliente: {
        nome: clienteNome,
        telefone: clienteTelefone || null,
        cpf: clienteCpf || null,
      },
      aparelho: {
        modelo: descricaoAparelho,
        capacidade: aparelhoRow?.capacidade ? String(aparelhoRow.capacidade) : null,
        cor: aparelhoRow?.cor ? String(aparelhoRow.cor) : null,
        imei: aparelhoRow?.imei ? String(aparelhoRow.imei) : null,
        condicao: aparelhoRow?.condicao ? String(aparelhoRow.condicao) : null,
        valor: valorVenda,
      },
      upgrade:
        valorTroca > 0
          ? {
              ativo: true,
              modelo: trocaModelo || 'Aparelho na troca',
              valor: valorTroca,
            }
          : null,
      pagamento: {
        forma: formaPagamento,
        valorTotal: valorVenda,
        valorEntrada: entradaPix + valorTroca,
        valorFinal: valorLiquido,
      },
      diasGarantia: Number(lojaInfo?.garantia_dias || lojaInfo?.dias_garantia || 90),
      vendedor: vendedorNome,
      linkRecibo,
    });

    const pdfBase64 = pdfBuffer.toString('base64');
    let whatsappEnviado = false;

    if (enviarWhatsapp && clienteTelefone.replace(/\D/g, '').length >= 10) {
      const legenda = [
        `🧾 *RECIBO OFICIAL — ${(lojaInfo?.nome || loja.nome).toUpperCase()}*`,
        `Olá *${clienteNome}*! Obrigado pela sua compra.`,
        `📱 Aparelho: *${descricaoAparelho}*`,
        `💰 Valor: *${formatarBRL(valorVenda)}*`,
        `🔗 Recibo Digital: ${linkRecibo}`,
      ].join('\n');

      const docEnv = await enviarDocumentoWhatsApp({
        lojaId: loja.id,
        telefone: clienteTelefone,
        base64: pdfBase64,
        nomeArquivo: nomeArquivoRecibo(vendaId),
        legenda,
      });
      whatsappEnviado = docEnv.success;
    }

    // 5. Posta nota privada com o link do recibo na conversa do EvoCRM se disponível
    if (conversationId) {
      try {
        const { config: cfgLoja } = await obterConfigCrmLoja(loja.id);
        const accessToken = (cfgLoja.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
        if (accessToken) {
          const apiUrl = (
            cfgLoja.crm_api_url ||
            process.env.CRM_EVO_API_URL ||
            'https://api-crm.phonecenter.tech'
          ).replace(/\/+$/, '');
          await fetch(`${apiUrl}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              api_access_token: accessToken,
            },
            body: JSON.stringify({
              content: `✅ Venda #${cod} registrada no PhoneCenter ERP (${formatarBRL(valorVenda)}). Recibo: ${linkRecibo}`,
              message_type: 'outgoing',
              private: true,
            }),
          });
        }
      } catch {
        // Não bloqueia
      }
    }

    await registrarLog({
      loja_id: loja.id,
      usuario_id: auth.usuario?.id || null,
      usuario_nome: vendedorNome,
      tipo_evento: 'venda',
      acao: 'Venda fechada pelo CRM',
      detalhes: `Venda #${cod} (${descricaoAparelho}) para ${clienteNome} por ${formatarBRL(valorVenda)}.`,
    });

    return crmBridgeJson(
      {
        ok: true,
        vendaId,
        codigo: cod,
        linkRecibo,
        whatsappEnviado,
        pdfBase64,
      },
      201,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao registrar venda.' },
      500,
      req
    );
  }
}
