import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { patchLiberarReserva, patchReserva } from '@/lib/estoque/ciclo';
import { aplicarMudancaEstoque } from '@/lib/estoque/movimentacoes';
import { registrarLog } from '@/lib/logger';
import { enviarTextoWhatsApp } from '@/lib/whatsappService';
import { formatarBRL } from './queries';
import { obterConfigCrmLoja } from './lojaConfig';

/**
 * Calcula CRC16-CCITT (0x1021, init 0xFFFF) exigido pelo padrão EMV/BACEN do Pix.
 */
export function calcularCrc16Pix(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function limparTextoPix(str: string, maxLen: number): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Gera BR Code Pix Copia e Cola válido (padrão EMV QRCPS-MPM / BACEN).
 */
export function gerarBrCodePix(input: {
  chavePix: string;
  nomeRecebedor: string;
  cidade?: string;
  valor?: number;
  txid?: string;
  descricao?: string;
}): string {
  const chave = input.chavePix.trim();
  if (!chave) {
    throw new Error('Chave Pix não informada.');
  }

  const nome = limparTextoPix(input.nomeRecebedor || 'PHONECENTER', 25) || 'PHONECENTER';
  const cidade = limparTextoPix(input.cidade || 'BELO HORIZONTE', 15) || 'BRASIL';
  const txid = (input.txid || 'PHONECENTER')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 25) || '***';

  let merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave);
  if (input.descricao) {
    const descLimpa = limparTextoPix(input.descricao, 35);
    if (descLimpa) {
      merchantAccount += tlv('02', descLimpa);
    }
  }

  let body = '';
  body += tlv('00', '01'); // Payload Format Indicator
  body += tlv('26', merchantAccount); // Merchant Account Information
  body += tlv('52', '0000'); // Merchant Category Code
  body += tlv('53', '986'); // Currency BRL
  if (input.valor && input.valor > 0) {
    body += tlv('54', input.valor.toFixed(2));
  }
  body += tlv('58', 'BR'); // Country Code
  body += tlv('59', nome); // Merchant Name
  body += tlv('60', cidade); // Merchant City
  body += tlv('62', tlv('05', txid)); // Additional Data Field (TXID)
  body += '6304'; // CRC16 placeholder

  const crc = calcularCrc16Pix(body);
  return `${body}${crc}`;
}

export function gerarSlugLoja(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Cria cobrança de sinal de reserva:
 * 1) Se MERCADOPAGO_ACCESS_TOKEN estiver ativo -> cria pagamento Pix dinâmico no Mercado Pago
 * 2) Senão se ASAAS_API_KEY estiver ativo -> cria cobrança Pix no Asaas
 * 3) Fallback imediato (sem gateway pago) -> gera BR Code EMV BACEN oficial usando CRM_PIX_KEY / chave informada
 */
export async function criarReservaPixBridge(
  lojaId: string,
  nomeLoja: string,
  input: {
    aparelhoId?: string;
    aparelhoModelo: string;
    clienteNome?: string;
    clienteTelefone?: string;
    valorSinal: number;
    chavePixManual?: string;
    cidade?: string;
  }
) {
  const valorSinal = Math.round((Number(input.valorSinal) || 0) * 100) / 100;
  if (valorSinal <= 0) {
    throw new Error('valorSinal deve ser maior que zero.');
  }

  const protocolo = `RES${crypto.randomInt(10000, 99999)}`;
  let provedor: 'estatico_emv' | 'asaas' | 'mercadopago' = 'estatico_emv';
  let provedorChargeId = '';
  let pixCopiaCola = '';
  let linkPagamento = '';

  const { config: cfgLoja } = await obterConfigCrmLoja(lojaId);
  const mpToken = (cfgLoja.mercadopago_access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  const asaasKey = (cfgLoja.asaas_api_key || process.env.ASAAS_API_KEY || '').trim();

  if (mpToken) {
    try {
      const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mpToken}`,
          'X-Idempotency-Key': protocolo,
        },
        body: JSON.stringify({
          transaction_amount: valorSinal,
          description: `Sinal Reserva ${input.aparelhoModelo} (${protocolo})`,
          payment_method_id: 'pix',
          payer: {
            email: `cliente.${protocolo.toLowerCase()}@phonecenter.tech`,
            first_name: input.clienteNome || 'Cliente',
          },
          external_reference: protocolo,
        }),
      });
      const mpData = await mpRes.json();
      const qrCode = mpData?.point_of_interaction?.transaction_data?.qr_code;
      if (mpRes.ok && qrCode) {
        provedor = 'mercadopago';
        provedorChargeId = String(mpData.id || '');
        pixCopiaCola = String(qrCode);
        linkPagamento = String(mpData?.point_of_interaction?.transaction_data?.ticket_url || '');
      }
    } catch {
      // fallback para EMV
    }
  } else if (asaasKey) {
    // Asaas requer customerId; lê da loja no Supabase ou fallback env
    const asaasCustomer = (cfgLoja.asaas_customer_id || process.env.ASAAS_DEFAULT_CUSTOMER_ID || '').trim();
    const asaasUrl = (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/+$/, '');
    if (asaasCustomer) {
      try {
        const dueDate = new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10);
        const aRes = await fetch(`${asaasUrl}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', access_token: asaasKey },
          body: JSON.stringify({
            customer: asaasCustomer,
            billingType: 'PIX',
            value: valorSinal,
            dueDate,
            description: `Sinal Reserva ${input.aparelhoModelo} (${protocolo})`,
            externalReference: protocolo,
          }),
        });
        const aData = await aRes.json();
        if (aRes.ok && aData?.id) {
          const qrRes = await fetch(`${asaasUrl}/payments/${aData.id}/pixQrCode`, {
            headers: { access_token: asaasKey },
          });
          const qrData = await qrRes.json();
          if (qrRes.ok && qrData?.payload) {
            provedor = 'asaas';
            provedorChargeId = String(aData.id);
            pixCopiaCola = String(qrData.payload);
            linkPagamento = String(aData.invoiceUrl || '');
          }
        }
      } catch {
        // fallback para EMV
      }
    }
  }

  if (!pixCopiaCola) {
    const chavePix = (input.chavePixManual || cfgLoja.pix_key || process.env.CRM_PIX_KEY || '').trim();
    if (!chavePix) {
      throw new Error(
        'Configure a Chave Pix da loja em /crm-config (tabela crm_loja_configs no Supabase) ou informe chavePix no formulário.'
      );
    }
    pixCopiaCola = gerarBrCodePix({
      chavePix,
      nomeRecebedor: nomeLoja,
      cidade: input.cidade || cfgLoja.pix_city || process.env.CRM_PIX_CITY || 'BRASIL',
      valor: valorSinal,
      txid: protocolo,
      descricao: `Reserva ${input.aparelhoModelo}`,
    });
  }

  const textoWhatsapp = [
    `🔐 *SINAL DE RESERVA — ${nomeLoja.toUpperCase()}*`,
    `📱 Aparelho: *${input.aparelhoModelo}*`,
    `💰 Valor do Sinal: *${formatarBRL(valorSinal)}*`,
    `📄 Protocolo: *#${protocolo}*`,
    '',
    `👇 *Pix Copia e Cola:*`,
    pixCopiaCola,
    linkPagamento ? `\n🔗 Link de pagamento: ${linkPagamento}` : '',
    '',
    `_Assim que confirmar o pagamento, reservamos seu aparelho imediatamente!_`,
  ]
    .filter(Boolean)
    .join('\n');

  const { data, error } = await supabaseAdmin
    .from('crm_reservas_pix')
    .insert({
      loja_id: lojaId,
      protocolo,
      aparelho_id: input.aparelhoId || null,
      aparelho_modelo: input.aparelhoModelo.trim(),
      cliente_nome: (input.clienteNome || 'Cliente').trim(),
      cliente_telefone: (input.clienteTelefone || '').trim(),
      valor_sinal: valorSinal,
      provedor,
      provedor_charge_id: provedorChargeId,
      pix_copia_cola: pixCopiaCola,
      link_pagamento: linkPagamento,
      status: 'pendente',
    })
    .select('*')
    .single();

  if (error) {
    // Retorna mesmo se migration ainda não foi aplicada, sinalizando aviso
    return {
      saved: false,
      migrationPendente: error.message.includes('does not exist'),
      protocolo,
      provedor,
      pixCopiaCola,
      linkPagamento,
      textoWhatsapp,
    };
  }

  return {
    saved: true,
    migrationPendente: false,
    reserva: data,
    protocolo,
    provedor,
    pixCopiaCola,
    linkPagamento,
    textoWhatsapp,
  };
}

/**
 * Consulta a API oficial do Mercado Pago para confirmar que um pagamento está
 * realmente com status === 'approved' (nunca confia cegamente em 'payment.updated').
 */
export async function verificarStatusPagamentoMercadoPago(
  paymentId: string,
  mpToken: string
): Promise<{ approved: boolean; status: string; externalReference?: string }> {
  const id = String(paymentId || '').trim();
  const token = String(mpToken || '').trim();
  if (!id || !token) {
    return { approved: false, status: 'unverified' };
  }

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { approved: false, status: `http_${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status || '').toLowerCase();
    return {
      approved: status === 'approved',
      status: status || 'unknown',
      externalReference: data.external_reference ? String(data.external_reference) : undefined,
    };
  } catch {
    return { approved: false, status: 'network_error' };
  }
}

/**
 * Confirma o pagamento do sinal Pix de forma idempotente, trava o aparelho no estoque
 * como 'reservado' (via aplicarMudancaEstoque com auditoria), registra alerta no
 * Chat Interno e envia confirmação automática no WhatsApp do cliente.
 */
export async function efetivarConfirmacaoReservaPix(
  reservaId: string,
  lojaId: string
): Promise<{
  updated: boolean;
  reserva: Record<string, unknown> | null;
  estoqueReservado: boolean;
  whatsappEnviado: boolean;
}> {
  const agora = new Date().toISOString();

  const { data: atual } = await supabaseAdmin
    .from('crm_reservas_pix')
    .select('*')
    .eq('id', reservaId)
    .eq('loja_id', lojaId)
    .maybeSingle();

  if (!atual) {
    return { updated: false, reserva: null, estoqueReservado: false, whatsappEnviado: false };
  }

  if (atual.status === 'pago') {
    return { updated: false, reserva: atual, estoqueReservado: false, whatsappEnviado: false };
  }

  const { data: reservaAtualizada } = await supabaseAdmin
    .from('crm_reservas_pix')
    .update({
      status: 'pago',
      pago_em: agora,
      updated_at: agora,
    })
    .eq('id', reservaId)
    .eq('loja_id', lojaId)
    .neq('status', 'pago')
    .select('*')
    .maybeSingle();

  if (!reservaAtualizada) {
    return { updated: false, reserva: atual, estoqueReservado: false, whatsappEnviado: false };
  }

  const protocolo = String(reservaAtualizada.protocolo || '');
  const clienteNome = String(reservaAtualizada.cliente_nome || 'Cliente');
  const modelo = String(reservaAtualizada.aparelho_modelo || 'Aparelho');
  const aparelhoId = reservaAtualizada.aparelho_id ? String(reservaAtualizada.aparelho_id) : '';

  let estoqueReservado = false;
  if (aparelhoId) {
    try {
      const resEst = await aplicarMudancaEstoque(supabaseAdmin, {
        ids: [aparelhoId],
        patch: patchReserva(`[RESERVADO #${protocolo} - ${clienteNome}]`),
        tipo: 'edicao',
        origem: 'crm_reserva',
        lojaId,
        filtroElegivel: (a) => {
          const st = String(a.status || 'disponivel').toLowerCase();
          return a.ativo !== false && st !== 'vendido' && st !== 'baixado' && st !== 'cliente';
        },
        observacao: `Sinal Pix confirmado (#${protocolo}) — ${modelo}`,
      });
      estoqueReservado = resEst.afetados > 0;
    } catch (err) {
      console.warn('[Pix Reserva] Aviso ao travar aparelho no estoque:', err);
    }
  }

  try {
    await supabaseAdmin.from('crm_chat_interno').insert({
      loja_id: lojaId,
      canal: 'vendas',
      autor_nome: 'Pix Automático',
      autor_cargo: 'sistema',
      mensagem: `✅ Sinal Pix confirmado (#${protocolo}) para ${clienteNome} — ${modelo} (${formatarBRL(Number(reservaAtualizada.valor_sinal) || 0)}).${estoqueReservado ? ' 🔒 Aparelho travado como RESERVADO no estoque!' : ''}`,
      referencia_ticket: protocolo,
    });
  } catch {
    // Não bloqueia se chat interno não existir
  }

  let whatsappEnviado = false;
  const telefone = String(reservaAtualizada.cliente_telefone || '').trim();
  if (telefone.replace(/\D/g, '').length >= 10) {
    try {
      const envio = await enviarTextoWhatsApp({
        lojaId,
        telefone,
        texto: [
          `✅ *SINAL DE RESERVA CONFIRMADO!*`,
          ``,
          `Olá *${clienteNome}*! Recebemos o pagamento do seu sinal (*#${protocolo}*).`,
          `📱 Aparelho reservado: *${modelo}*`,
          `💰 Valor confirmado: *${formatarBRL(Number(reservaAtualizada.valor_sinal) || 0)}*`,
          ``,
          `Seu aparelho já está separado para você! Qualquer dúvida, responda por aqui.`,
        ].join('\n'),
      });
      whatsappEnviado = envio.success;
    } catch {
      whatsappEnviado = false;
    }
  }

  await registrarLog({
    loja_id: lojaId,
    tipo_evento: 'estoque',
    acao: 'Reserva Pix confirmada',
    detalhes: `Protocolo #${protocolo} (${modelo}) para ${clienteNome}. Estoque reservado: ${estoqueReservado ? 'sim' : 'não'}.`,
  });

  return {
    updated: true,
    reserva: reservaAtualizada,
    estoqueReservado,
    whatsappEnviado,
  };
}

/**
 * Cancela uma reserva Pix e libera o aparelho no estoque de volta para 'disponivel'.
 */
export async function cancelarELiberarReservaPix(
  reservaId: string,
  lojaId: string
): Promise<{ updated: boolean; reserva: Record<string, unknown> | null; estoqueLiberado: boolean }> {
  const agora = new Date().toISOString();
  const { data: reserva } = await supabaseAdmin
    .from('crm_reservas_pix')
    .update({
      status: 'cancelado',
      pago_em: null,
      updated_at: agora,
    })
    .eq('id', reservaId)
    .eq('loja_id', lojaId)
    .select('*')
    .maybeSingle();

  if (!reserva) {
    return { updated: false, reserva: null, estoqueLiberado: false };
  }

  let estoqueLiberado = false;
  const aparelhoId = reserva.aparelho_id ? String(reserva.aparelho_id) : '';
  if (aparelhoId) {
    try {
      const resEst = await aplicarMudancaEstoque(supabaseAdmin, {
        ids: [aparelhoId],
        patch: patchLiberarReserva(''),
        tipo: 'restauracao',
        origem: 'crm_reserva',
        lojaId,
        filtroElegivel: (a) => String(a.status || '').toLowerCase() === 'reservado',
        observacao: `Reserva Pix cancelada (#${reserva.protocolo || ''})`,
      });
      estoqueLiberado = resEst.afetados > 0;
    } catch (err) {
      console.warn('[Pix Reserva] Aviso ao liberar aparelho no estoque:', err);
    }
  }

  return { updated: true, reserva, estoqueLiberado };
}
