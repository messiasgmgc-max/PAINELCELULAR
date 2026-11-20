import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { formatarBRL } from './queries';

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

  const mpToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  const asaasKey = (process.env.ASAAS_API_KEY || '').trim();

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
    // Asaas requer customerId; se configurado ASAAS_DEFAULT_CUSTOMER_ID cria cobrança Pix
    const asaasCustomer = (process.env.ASAAS_DEFAULT_CUSTOMER_ID || '').trim();
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
    const chavePix = (input.chavePixManual || process.env.CRM_PIX_KEY || '').trim();
    if (!chavePix) {
      throw new Error(
        'Informe chavePixManual ou configure CRM_PIX_KEY (ou MERCADOPAGO_ACCESS_TOKEN / ASAAS_API_KEY) no Coolify.'
      );
    }
    pixCopiaCola = gerarBrCodePix({
      chavePix,
      nomeRecebedor: nomeLoja,
      cidade: input.cidade || process.env.CRM_PIX_CITY || 'BRASIL',
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
