import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  buildDispatchPayload,
  buildWhatsAppText,
  parseGeminiPlan,
  type GeminiCommandAction,
  type GeminiCommandPlan,
} from './commandExecutor';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const WEBHOOK_DEBUG_EVENTS = process.env.WEBHOOK_DEBUG_EVENTS === 'true';

function parseRetryDelayMs(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^([\d.]+)\s*s$/i);
  if (!match) return 0;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.ceil(seconds * 1000);
}

function extractApiErrorDetails(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  let parsed: any = null;

  if (rawMessage.startsWith('{')) {
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      parsed = null;
    }
  }

  const statusCode =
    Number(parsed?.error?.code) ||
    Number((error as any)?.status) ||
    Number((error as any)?.error?.code) ||
    0;

  const statusText = String(parsed?.error?.status || (error as any)?.statusText || '');
  const lowerMessage = rawMessage.toLowerCase();
  const isModelNotFound = statusCode === 404 || statusText === 'NOT_FOUND' || lowerMessage.includes('is not found for api version');
  const isQuotaExceeded = statusCode === 429 || statusText === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota exceeded');
  const isHardQuotaLimit = isQuotaExceeded && lowerMessage.includes('limit: 0');

  let retryMs = 0;
  const retryInfo = parsed?.error?.details?.find((detail: any) => detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
  if (retryInfo?.retryDelay) {
    retryMs = parseRetryDelayMs(String(retryInfo.retryDelay));
  }

  if (!retryMs) {
    const retryInMessage = rawMessage.match(/Please retry in\s+([\d.]+)s/i);
    if (retryInMessage?.[1]) {
      retryMs = Math.ceil(Number(retryInMessage[1]) * 1000);
    }
  }

  return { statusCode, isModelNotFound, isQuotaExceeded, isHardQuotaLimit, retryMs };
}

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

  if (
    /^listar\s+lojas$/i.test(trimmed) ||
    /^list\s+lojas$/i.test(trimmed) ||
    /^liste\s+(.+\s+)?lojas(\s+.+)?$/i.test(trimmed)
  ) {
    return {
      type: 'command',
      action: 'list_lojas',
      params: {},
    };
  }

  const createVenda = trimmed.match(/^criar\s+venda\s+(.+)$/i);
  if (createVenda && createVenda[1]) {
    return {
      type: 'command',
      action: 'create_venda',
      params: {
        clienteNome: 'Cliente não informado',
        metodo: 'pix',
        itens: [
          {
            descricao: createVenda[1].trim(),
            quantidade: 1,
            valorExibir: 0,
            valorInterno: 0,
            desconto: 0,
            tipoDesconto: 'R$',
          },
        ],
      },
    };
  }

  if (/^gerar\s+etiquetas$/i.test(trimmed)) {
    return {
      type: 'command',
      action: 'generate_etiquetas',
      params: {
        template: '3col',
        quantityPerItem: 1,
      },
    };
  }

  if (/^(consultar|listar|ver)\s+estoque$/i.test(trimmed)) {
    return {
      type: 'command',
      action: 'list_estoque',
      params: {
        limit: 30,
      },
    };
  }

  const queryEntity = trimmed.match(/^(consulta|consultar|consulta|listar|ver|buscar)\s+(?:o|a|os|as)?\s*(agendamentos|agendamento|garantias|garantia|ordens(?:\s+de\s+serviço)?|ordem|clientes|cliente|tecnicos|tecnico|técnicos|técnico|aparelhos|aparelho|lojas|loja)(?:\s+(?:de|da|do|sobre)\s+(.+))?$/i);
  if (queryEntity) {
    const entityAlias = queryEntity[2].toLowerCase();
    const term = (queryEntity[3] || '').trim();

    const entityMap: Record<string, string> = {
      agendamentos: 'agendamentos',
      agendamento: 'agendamentos',
      garantias: 'garantias',
      garantia: 'garantias',
      ordens: 'ordens_servico',
      ordem: 'ordens_servico',
      'ordens de serviço': 'ordens_servico',
      clientes: 'clientes',
      cliente: 'clientes',
      tecnicos: 'tecnicos',
      tecnico: 'tecnicos',
      técnicos: 'tecnicos',
      técnico: 'tecnicos',
      aparelhos: 'aparelhos',
      aparelho: 'aparelhos',
      lojas: 'lojas',
      loja: 'lojas',
    };

    const entity = entityMap[entityAlias];
    if (entity) {
      return {
        type: 'command',
        action: 'query_entities',
        params: {
          entity,
          term,
        },
      };
    }
  }

  const estoqueDaLoja = trimmed.match(/^(consultar|listar|ver)\s+estoque\s+da\s+loja\s+(.+)$/i);
  if (estoqueDaLoja && estoqueDaLoja[2]) {
    return {
      type: 'command',
      action: 'list_estoque',
      params: {
        loja_nome: estoqueDaLoja[2].trim(),
        limit: 30,
      },
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

export async function classifyMessageWithGroq(message: string) {
  const systemInstruction = `Você é um classificador de intenções para um sistema de assistência técnica. Responda EXCLUSIVAMENTE UM JSON VÁLIDO (sem markdown, sem texto extra).
Formato obrigatório: {"intent":"AGENDAR|COMPRAR|DUVIDA|OUTRO","comando":"NOME_DO_COMANDO","parametros":{}}
Comandos permitidos em "comando": create_aparelho, create_cliente, create_tecnico, create_os, create_agendamento, create_garantia, create_loja, update_loja, list_lojas, query_entities, search_entities, OUTRO.
Quando o usuário pedir cadastro/criação de aparelho/telefone/celular, use "comando":"create_aparelho" e extraia em "parametros" os campos marca, modelo, capacidade, cor, imei, condicao, preco e descricao quando disponíveis.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: message },
    ],
  });

  const rawContent = response.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(rawContent) as {
    intent?: string;
    comando?: string;
    parametros?: Record<string, unknown>;
  };

  return {
    intent: parsed.intent || 'OUTRO',
    comando: parsed.comando || 'OUTRO',
    parametros: parsed.parametros && typeof parsed.parametros === 'object' ? parsed.parametros : {},
  };
}

function mapGroqCommandToAction(comando: string): GeminiCommandAction | null {
  const normalized = String(comando || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  const map: Record<string, GeminiCommandAction> = {
    create_aparelho: 'create_aparelho',
    criar_aparelho: 'create_aparelho',
    cadastrar_aparelho: 'create_aparelho',
    create_cliente: 'create_cliente',
    criar_cliente: 'create_cliente',
    cadastrar_cliente: 'create_cliente',
    create_tecnico: 'create_tecnico',
    criar_tecnico: 'create_tecnico',
    cadastrar_tecnico: 'create_tecnico',
    create_os: 'create_os',
    criar_os: 'create_os',
    create_agendamento: 'create_agendamento',
    criar_agendamento: 'create_agendamento',
    create_garantia: 'create_garantia',
    criar_garantia: 'create_garantia',
    create_loja: 'create_loja',
    update_loja: 'update_loja',
    list_lojas: 'list_lojas',
    query_entities: 'query_entities',
    search_entities: 'search_entities',
  };

  return map[normalized] || null;
}

function buildPlanFromGroqClassification(classification: Record<string, unknown>): GeminiCommandPlan | null {
  const comando = String(classification.comando || '');
  const action = mapGroqCommandToAction(comando);
  if (!action) return null;

  const parametros = classification.parametros;
  return {
    type: 'command',
    action,
    params: parametros && typeof parametros === 'object' ? (parametros as Record<string, unknown>) : {},
  };
}

async function sendWhatsAppText(number: string, text: string) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const endpointCandidates = (process.env.EVOLUTION_TEXT_ENDPOINTS || 'message/sendText')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!evolutionUrl || !instanceName || !apiKey) {
    return { ok: false as const, error: 'Variáveis da Evolution API não configuradas.' };
  }

  const normalized = normalizePhone(number);
  const localCandidates = buildPhoneCandidates(normalized);
  const numberCandidates = new Set<string>();

  numberCandidates.add(normalized);
  for (const local of localCandidates) {
    numberCandidates.add(`55${local}`);
    numberCandidates.add(local);
  }

  const payloadVariants = Array.from(numberCandidates).flatMap((candidate) => ([
    { number: candidate, text },
    { number: candidate, textMessage: { text } },
    { number: candidate, message: { text } },
    { number: `${candidate}@c.us`, text },
    { number: `${candidate}@c.us`, textMessage: { text } },
    { number: `${candidate}@s.whatsapp.net`, text },
    { number: `${candidate}@s.whatsapp.net`, textMessage: { text } },
    { id: `${candidate}@s.whatsapp.net`, text },
    { id: `${candidate}@s.whatsapp.net`, textMessage: { text } },
  ]));

  const errors: string[] = [];

  for (const endpoint of endpointCandidates) {
    const endpointBase = endpoint.replace(/^\/+|\/+$/g, '');
    const urls = [
      `${evolutionUrl}/${endpointBase}/${instanceName}`,
      `${evolutionUrl}/${instanceName}/${endpointBase}`,
      `${evolutionUrl}/${endpointBase}`,
    ];

    for (const payload of payloadVariants) {
      for (const url of urls) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify(payload),
        });

        const bodyText = await response.text();
        const lowerBody = bodyText.toLowerCase();
        const contentType = response.headers.get('content-type') || '';
        const bodyLooksLikeError =
          lowerBody.includes('error') ||
          lowerBody.includes('invalid') ||
          lowerBody.includes('not found') ||
          lowerBody.includes('unauthorized');

        let bodyLooksLikeSuccess = false;
        if (contentType.toLowerCase().includes('application/json')) {
          try {
            const parsed = JSON.parse(bodyText) as Record<string, unknown>;
            bodyLooksLikeSuccess = Boolean(
              parsed?.key ||
              parsed?.id ||
              parsed?.messageId ||
              parsed?.status ||
              parsed?.success === true
            );
          } catch {
            bodyLooksLikeSuccess = false;
          }
        }

        if (response.ok && !bodyLooksLikeError && bodyLooksLikeSuccess) {
          console.log(`📤 [Evolution API] sendWhatsAppText ok via ${url} | destino=${String((payload as any).number || (payload as any).id || '-')} | body=${bodyText.slice(0, 400)}`);
          return { ok: true as const };
        }

        errors.push(`${url} -> ${response.status}: ${bodyText}`);
      }
    }
  }

  return { ok: false as const, error: errors.join(' | ') || 'Falha ao enviar texto na Evolution API.' };
}

async function sendWhatsAppDocument(number: string, fileName: string, caption: string, base64Content: string) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const endpointCandidates = (process.env.EVOLUTION_DOCUMENT_ENDPOINTS || 'send/media,message/sendMedia,message/sendFile')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!evolutionUrl || !instanceName || !apiKey) {
    return { ok: false as const, error: 'Variáveis da Evolution API não configuradas para documento.' };
  }

  const payloadVariants = [
    {
      number: normalizePhone(number),
      mediatype: 'document',
      mimetype: 'application/pdf',
      fileName,
      caption,
      media: `data:application/pdf;base64,${base64Content}`,
    },
    {
      number: normalizePhone(number),
      fileName,
      caption,
      mimetype: 'application/pdf',
      media: base64Content,
    },
    {
      id: `${normalizePhone(number)}@s.whatsapp.net`,
      filename: fileName,
      caption,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: `data:application/pdf;base64,${base64Content}`,
    },
  ];

  const errors: string[] = [];
  for (const endpoint of endpointCandidates) {
    const endpointBase = endpoint.replace(/^\/+|\/+$/g, '');
    const urls = [
      `${evolutionUrl}/${endpointBase}/${instanceName}`,
      `${evolutionUrl}/${instanceName}/${endpointBase}`,
      `${evolutionUrl}/${endpointBase}`,
    ];

    for (const payload of payloadVariants) {
      for (const url of urls) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return { ok: true as const };
        }

        const body = await response.text();
        errors.push(`${url} -> ${response.status}: ${body}`);
      }
    }
  }

  return { ok: false as const, error: errors.join(' | ') || 'Falha ao enviar documento na Evolution API.' };
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdfBuffer(lines: string[]) {
  const textCommands = lines
    .map((line, index) => {
      const y = 800 - (index * 14);
      if (y < 40) return '';
      return `1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`;
    })
    .filter(Boolean)
    .join('\n');

  const contentStream = `BT\n/F1 10 Tf\n${textCommands}\nET`;

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5] = `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPosition = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function formatMetodoPagamentoLabel(metodo: string) {
  if (metodo === 'cartao_credito') return 'Cartão Crédito';
  if (metodo === 'cartao_debito') return 'Cartão Débito';
  if (metodo === 'dinheiro') return 'Dinheiro';
  if (metodo === 'pix') return 'PIX';
  if (metodo === 'boleto') return 'Boleto';
  return metodo || 'Não informado';
}

function buildVendaA4Html(venda: Record<string, any>) {
  const itens = Array.isArray(venda.itens) ? venda.itens : [];
  const itensHtml = itens.length > 0
    ? itens.map((item: any) => `
      <tr>
        <td style="text-align:center">${item.quantidade || 1}</td>
        <td>${item.descricao || 'Item'}</td>
        <td style="text-align:right">R$ ${Number(item.valorExibir || 0).toFixed(2).replace('.', ',')}</td>
        <td style="text-align:right">R$ ${Number(item.desconto || 0).toFixed(2).replace('.', ',')}</td>
        <td style="text-align:right">R$ ${Number(item.total || 0).toFixed(2).replace('.', ',')}</td>
      </tr>
    `).join('')
    : `<tr><td style="text-align:center">1</td><td>Item Avulso</td><td style="text-align:right">R$ ${Number(venda.valor || 0).toFixed(2).replace('.', ',')}</td><td style="text-align:right">R$ 0,00</td><td style="text-align:right">R$ ${Number(venda.valor || 0).toFixed(2).replace('.', ',')}</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo A4 - ${String(venda.id || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 1.5cm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #111; padding: 6px; }
    th { background: #f3f4f6; text-align: left; }
  </style>
</head>
<body>
  <h2>Recibo de Venda</h2>
  <p><strong>ID:</strong> ${String(venda.id || '')}</p>
  <p><strong>Cliente:</strong> ${String(venda.clienteNome || 'Não informado')}</p>
  <p><strong>Data:</strong> ${String(venda.dataPagamento || '')}</p>
  <p><strong>Método:</strong> ${formatMetodoPagamentoLabel(String(venda.metodo || ''))}</p>
  <table>
    <thead>
      <tr>
        <th style="width: 8%">Qtd</th>
        <th>Descrição</th>
        <th style="width: 18%">Valor Unit.</th>
        <th style="width: 14%">Desc.</th>
        <th style="width: 18%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
    </tbody>
  </table>
  <p style="margin-top:12px;"><strong>Total da venda:</strong> R$ ${Number(venda.valor || 0).toFixed(2).replace('.', ',')}</p>
  <p><strong>Garantia:</strong> ${String(venda.garantia || '90 dias')}</p>
</body>
</html>
  `.trim();
}

function buildVendaA4PdfBuffer(venda: Record<string, any>) {
  const itens = Array.isArray(venda.itens) ? venda.itens : [];
  const lines: string[] = [
    'RECIBO DE VENDA - PHONE CENTER',
    `ID: ${String(venda.id || '')}`,
    `Cliente: ${String(venda.clienteNome || 'Nao informado')}`,
    `Data: ${String(venda.dataPagamento || '')}`,
    `Metodo: ${formatMetodoPagamentoLabel(String(venda.metodo || ''))}`,
    '----------------------------------------------',
    'Itens:',
  ];

  if (itens.length === 0) {
    lines.push(`- Item avulso | Total: R$ ${Number(venda.valor || 0).toFixed(2)}`);
  } else {
    for (const item of itens) {
      lines.push(
        `- ${String(item.descricao || 'Item')} | Qtd: ${Number(item.quantidade || 1)} | Vlr: R$ ${Number(item.total || 0).toFixed(2)}`
      );
    }
  }

  lines.push('----------------------------------------------');
  lines.push(`Total: R$ ${Number(venda.valor || 0).toFixed(2)}`);
  lines.push(`Garantia: ${String(venda.garantia || '90 dias')}`);

  return buildSimplePdfBuffer(lines);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEtiquetasHtml(aparelhos: Record<string, any>[], template: '3col' | '2col' | '1col', quantityPerItem: number) {
  const cols = template === '3col' ? 3 : template === '2col' ? 2 : 1;
  const etiquetas: string[] = [];

  for (const aparelho of aparelhos) {
    for (let i = 0; i < quantityPerItem; i += 1) {
      etiquetas.push(`
        <div class="etiqueta">
          <div class="titulo">${escapeHtml(`${String(aparelho.marca || '')} ${String(aparelho.modelo || '')}`.trim())}</div>
          <div class="linha"><strong>Cor:</strong> ${escapeHtml(String(aparelho.cor || '-'))}</div>
          <div class="linha"><strong>Cap.:</strong> ${escapeHtml(String(aparelho.capacidade || '-'))}</div>
          <div class="linha"><strong>IMEI:</strong> ${escapeHtml(String(aparelho.imei || '-'))}</div>
          <div class="preco">R$ ${Number(aparelho.preco || 0).toFixed(2).replace('.', ',')}</div>
        </div>
      `);
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    body { font-family: Arial, sans-serif; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4mm; }
    .etiqueta { border: 1px solid #111; border-radius: 3mm; padding: 3mm; min-height: 32mm; box-sizing: border-box; }
    .titulo { font-size: 12px; font-weight: 700; margin-bottom: 2mm; }
    .linha { font-size: 10px; margin-bottom: 1mm; }
    .preco { margin-top: 2mm; font-size: 13px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="grid">
    ${etiquetas.join('')}
  </div>
</body>
</html>
  `.trim();
}

interface CommandExecutionResult {
  data: unknown;
  error: string | null;
  message: string;
  dispatchPayload: string | null;
  artifacts?: Record<string, unknown> | null;
}

async function executeGeminiCommand(
  plan: ReturnType<typeof parseGeminiPlan>,
  lojaId: string | null,
  senderPhone: string,
  isSuperAdmin: boolean
): Promise<CommandExecutionResult> {
  if (!plan) {
    return { data: null, error: 'Plano inválido', message: 'Plano inválido', dispatchPayload: null as string | null, artifacts: null };
  }

  try {
    if (plan.action === 'create_aparelho') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar aparelho', message: 'Loja não identificada para criar aparelho', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_cliente') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar cliente', message: 'Loja não identificada para criar cliente', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_tecnico') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar técnico', message: 'Loja não identificada para criar técnico', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_os') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar OS', message: 'Loja não identificada para criar OS', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_agendamento') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar agendamento', message: 'Loja não identificada para criar agendamento', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_garantia') {
      if (!lojaId) {
        return { data: null, error: 'Loja não identificada para criar garantia', message: 'Loja não identificada para criar garantia', dispatchPayload: null as string | null, artifacts: null };
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
        artifacts: null,
      };
    }

    if (plan.action === 'create_venda') {
    if (!lojaId) {
      return { data: null, error: 'Loja não identificada para criar venda', message: 'Loja não identificada para criar venda', dispatchPayload: null as string | null, artifacts: null };
    }

    const rawItens = Array.isArray(plan.params.itens) ? plan.params.itens : [];
    const itens = rawItens.map((item, index) => {
      const parsed = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const quantidade = Math.max(1, Number(parsed.quantidade || 1));
      const valorExibir = Number(parsed.valorExibir || 0);
      const valorInterno = Number(parsed.valorInterno || 0);
      const desconto = Number(parsed.desconto || 0);
      const tipoDesconto = parsed.tipoDesconto === '%' ? '%' : 'R$';
      const descontoAplicado = tipoDesconto === '%' ? (valorExibir * (desconto / 100)) : desconto;
      const total = (valorExibir - descontoAplicado) * quantidade;

      return {
        id: String(parsed.id || `${Date.now()}-${index}`),
        aparelhoId: String(parsed.aparelhoId || ''),
        descricao: String(parsed.descricao || `Item ${index + 1}`),
        quantidade,
        valorInterno,
        valorExibir,
        desconto,
        tipoDesconto,
        total: Number.isFinite(total) ? total : 0,
        observacao: String(parsed.observacao || ''),
      };
    });

    if (itens.length === 0) {
      return { data: null, error: 'Itens obrigatórios para criar venda', message: 'Itens obrigatórios para criar venda', dispatchPayload: null as string | null, artifacts: null };
    }

    const totalProdutos = itens.reduce((acc, item) => acc + item.total, 0);
    const descontoTotal = Number(plan.params.descontoTotal || 0);
    const valorFinal = Math.max(0, totalProdutos - descontoTotal);
    const custoTotal = itens.reduce((acc, item) => acc + (item.valorInterno * item.quantidade), 0);
    const lucro = valorFinal - custoTotal;
    const percentualLucro = valorFinal > 0 ? (lucro / valorFinal) * 100 : 0;

    const payload = {
      clienteId: plan.params.clienteId ? String(plan.params.clienteId) : null,
      clienteNome: String(plan.params.clienteNome || 'Cliente não informado'),
      vendedor: String(plan.params.vendedor || ''),
      tipoEntrega: String(plan.params.tipoEntrega || 'Retirada'),
      itens,
      valor: valorFinal,
      custo: custoTotal,
      lucro,
      percentualLucro,
      dataPagamento: String(plan.params.dataPagamento || new Date().toISOString().split('T')[0]),
      status: String(plan.params.status || 'pago'),
      metodo: String(plan.params.metodo || 'pix'),
      descricao: String(plan.params.descricao || `Venda via WhatsApp - ${itens.length} item(ns)`),
      garantia: String(plan.params.garantia || '90 dias'),
      descontoTotal,
      loja_id: lojaId,
    };

    const { data, error } = await supabaseAdmin.from('vendas').insert([payload]).select().single();
    if (error) throw error;

    const vendaData = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
    const vendaA4Html = buildVendaA4Html(vendaData);
    const vendaA4PdfBuffer = buildVendaA4PdfBuffer(vendaData);
    const vendaA4PdfBase64 = vendaA4PdfBuffer.toString('base64');

    return {
      data,
      error: null,
      message: 'Venda criada com sucesso.',
      dispatchPayload: buildDispatchPayload(senderPhone, 'Venda criada com sucesso. Recibo A4 disponível no retorno do webhook.'),
      artifacts: {
        venda: data,
        reciboA4Html: vendaA4Html,
        reciboA4PdfBase64: vendaA4PdfBase64,
      },
    };
    }

    if (plan.action === 'generate_etiquetas') {
    if (!lojaId) {
      return { data: null, error: 'Loja não identificada para gerar etiquetas', message: 'Loja não identificada para gerar etiquetas', dispatchPayload: null as string | null, artifacts: null };
    }

    const templateRaw = String(plan.params.template || '3col').toLowerCase();
    const template = (templateRaw === '1col' || templateRaw === '2col' || templateRaw === '3col') ? templateRaw : '3col';
    const quantityPerItem = Math.max(1, Number(plan.params.quantityPerItem || 1));
    const modeloFiltro = String(plan.params.modelo || '').trim().toLowerCase();

    let query = supabaseAdmin
      .from('aparelhos')
      .select('id,marca,modelo,cor,capacidade,imei,preco')
      .eq('loja_id', lojaId)
      .eq('ativo', true);

    if (modeloFiltro) {
      query = query.ilike('modelo', `%${modeloFiltro}%`);
    }

    const { data, error } = await query.limit(300);
    if (error) throw error;

    const rows = Array.isArray(data) ? data as Record<string, any>[] : [];
    if (rows.length === 0) {
      return { data: null, error: 'Nenhum aparelho encontrado para gerar etiquetas', message: 'Nenhum aparelho encontrado para gerar etiquetas', dispatchPayload: null as string | null, artifacts: null };
    }

    const etiquetasHtml = buildEtiquetasHtml(rows, template, quantityPerItem);
    const etiquetasBase64 = Buffer.from(etiquetasHtml, 'utf-8').toString('base64');
    const totalEtiquetas = rows.length * quantityPerItem;

    return {
      data: {
        template,
        quantityPerItem,
        totalModelos: rows.length,
        totalEtiquetas,
      },
      error: null,
      message: 'Etiquetas geradas com sucesso.',
      dispatchPayload: buildDispatchPayload(senderPhone, `Etiquetas geradas: ${totalEtiquetas} (${template}).`),
      artifacts: {
        etiquetasHtml,
        etiquetasBase64,
        template,
        quantityPerItem,
        totalEtiquetas,
      },
    };
    }

    if (plan.action === 'create_loja') {
      if (!isSuperAdmin) {
        return { data: null, error: 'Apenas superadmin pode criar loja', message: 'Apenas superadmin pode criar loja', dispatchPayload: null as string | null, artifacts: null };
      }

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
        artifacts: null,
      };
    }

    if (plan.action === 'update_loja') {
      if (!isSuperAdmin) {
        return { data: null, error: 'Apenas superadmin pode atualizar loja', message: 'Apenas superadmin pode atualizar loja', dispatchPayload: null as string | null, artifacts: null };
      }

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
        artifacts: null,
      };
    }

    if (plan.action === 'list_lojas') {
      if (!isSuperAdmin) {
        return { data: null, error: 'Apenas superadmin pode listar lojas', message: 'Apenas superadmin pode listar lojas', dispatchPayload: null as string | null, artifacts: null };
      }

      const { data, error } = await supabaseAdmin.from('lojas').select('id,nome,telefone,ativo').eq('ativo', true).order('nome');
      if (error) throw error;
      return {
        data,
        error: null,
        message: `Lojas encontradas: ${JSON.stringify(data || [])}`,
        dispatchPayload: buildDispatchPayload(senderPhone, 'Lista de lojas pronta para consulta.'),
        artifacts: null,
      };
    }

    if (plan.action === 'query_entities' || plan.action === 'search_entities') {
      const entity = String(plan.params.entity || 'clientes');
      const term = String(plan.params.term || '');

      if (entity === 'lojas' && !isSuperAdmin) {
        return { data: null, error: 'Apenas superadmin pode buscar lojas', message: 'Apenas superadmin pode buscar lojas', dispatchPayload: null as string | null, artifacts: null };
      }

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

      if (!isSuperAdmin && lojaId && entity !== 'lojas') {
        query = query.eq('loja_id', lojaId);
      }

      if (isSuperAdmin && plan.params.loja_id && entity !== 'lojas') {
        query = query.eq('loja_id', String(plan.params.loja_id));
      }

      const { data, error } = await query.limit(10);
      if (error) throw error;
      return {
        data,
        error: null,
        message: `Busca concluída para ${entity}: ${JSON.stringify(data || [])}`,
        dispatchPayload: buildDispatchPayload(senderPhone, `Busca concluída para ${entity}.`),
        artifacts: null,
      };
    }

    if (plan.action === 'list_estoque') {
      const limit = Math.min(100, Math.max(1, Number(plan.params.limit || 30)));
      const lojaIdParam = String(plan.params.loja_id || '').trim();
      const lojaNomeParam = String(plan.params.loja_nome || '').trim();
      const termo = String(plan.params.term || '').trim();

      let effectiveLojaId: string | null = null;
      if (isSuperAdmin) {
        if (lojaIdParam) {
          effectiveLojaId = lojaIdParam;
        } else if (lojaNomeParam) {
          const { data: lojaByName } = await supabaseAdmin
            .from('lojas')
            .select('id')
            .ilike('nome', `%${lojaNomeParam}%`)
            .eq('ativo', true)
            .maybeSingle();
          effectiveLojaId = lojaByName?.id || null;
        }
      } else {
        effectiveLojaId = lojaId;
      }

      if (!isSuperAdmin && !effectiveLojaId) {
        return { data: null, error: 'Loja não identificada para consultar estoque', message: 'Loja não identificada para consultar estoque', dispatchPayload: null as string | null, artifacts: null };
      }

      let query = supabaseAdmin
        .from('aparelhos')
        .select('id,loja_id,marca,modelo,cor,capacidade,condicao,preco,imei')
        .eq('ativo', true)
        .order('modelo', { ascending: true });

      if (effectiveLojaId) {
        query = query.eq('loja_id', effectiveLojaId);
      }

      if (termo) {
        query = query.or(`marca.ilike.%${termo}%,modelo.ilike.%${termo}%,imei.ilike.%${termo}%`);
      }

      const { data, error } = await query.limit(limit);
      if (error) throw error;

      return {
        data,
        error: null,
        message: 'Estoque consultado com sucesso.',
        dispatchPayload: buildDispatchPayload(senderPhone, `Estoque consultado (${(data || []).length} item(ns)).`),
        artifacts: null,
      };
    }

    return { data: null, error: 'Ação não suportada ainda', message: 'Ação não suportada ainda', dispatchPayload: null as string | null, artifacts: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
      dispatchPayload: null as string | null,
      artifacts: null,
    };
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const eventName = String(payload?.event || payload?.type || '');
    const isMessageEvent =
      eventName === 'messages.upsert' ||
      eventName === 'message.upsert' ||
      eventName.toLowerCase().includes('upsert');
    const tentativeMessageData = extractMessagePayload(payload);
    const hasMessageData = Boolean(
      tentativeMessageData?.message ||
      tentativeMessageData?.conversation ||
      tentativeMessageData?.text ||
      payload?.messageText ||
      payload?.text
    );

    if (!isMessageEvent && !hasMessageData) {
      const normalizedEvent = (eventName || 'sem_event').toLowerCase();
      if (normalizedEvent === 'messages.update') {
        if (WEBHOOK_DEBUG_EVENTS) {
          console.debug(`ℹ️ [Webhook][debug] Ignorado por evento não-mensagem: ${eventName || 'sem_event'}`);
        }
      } else {
        console.log(`ℹ️ [Webhook] Ignorado por evento não-mensagem: ${eventName || 'sem_event'}`);
      }
      return NextResponse.json({ status: 'ignored_event', event: eventName || null }, { status: 200 });
    }

    console.log('📥 [Webhook] Payload recebido em /api/webhook/evolution');

    const messageData = tentativeMessageData || {
      conversation: payload?.messageText || payload?.text || '',
      key: {
        remoteJid: payload?.chatId || payload?.chatId || payload?.from || '',
        fromMe: false,
      },
      from: payload?.from || payload?.chatId || '',
    };
    if (!messageData) {
      console.log('ℹ️ [Webhook] Ignorado: sem messageData no payload');
      return NextResponse.json({ status: 'ignored_no_message_data' }, { status: 200 });
    }

    const fromMe = Boolean(messageData?.key?.fromMe ?? messageData?.fromMe);
    if (fromMe) {
      console.log('ℹ️ [Webhook] Ignorado: mensagem fromMe=true');
      return NextResponse.json({ status: 'ignored_from_me' }, { status: 200 });
    }

    const messageText = extractMessageText(messageData);

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
    let isRequesterSuperAdmin = false;

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
          isRequesterSuperAdmin = true;
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

    let finalReply = '';
    let commandResponse: CommandExecutionResult | null = null;
    let plannedAction: string | null = null;
    let groqClassification: Record<string, unknown> | null = null;
    let plannedCommand: GeminiCommandPlan | null = null;

    console.log('🤖 [Groq] Processando classificação da mensagem...');
    try {
      groqClassification = await classifyMessageWithGroq(userMessage);
      plannedCommand = buildPlanFromGroqClassification(groqClassification);

      if (!plannedCommand) {
        plannedCommand = buildFallbackCommandFromText(userMessage);
      }

      console.log(`💬 [Groq] Resposta: ${JSON.stringify(groqClassification)}`);
    } catch (groqError) {
      console.error('⚠️ [Groq] Falha ao classificar a mensagem:', groqError);
      groqClassification = { intent: 'OUTRO', comando: 'OUTRO', parametros: {} };
      plannedCommand = buildFallbackCommandFromText(userMessage);
    }

    if (plannedCommand) {
      try {
        const execution = await executeGeminiCommand(plannedCommand, contextStoreId, cleanPhone, isRequesterSuperAdmin);
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
    } else {
      finalReply = JSON.stringify(groqClassification || { intent: 'OUTRO', comando: 'OUTRO', parametros: {} });
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
          groqClassification,
        },
        { status: 200 }
      );
    } else {
      console.log(`🚀 [Evolution API] Mensagem enviada para ${cleanPhone} com sucesso.`);
    }

    if (
      plannedAction === 'create_venda' &&
      commandResponse &&
      !commandResponse.error &&
      commandResponse.artifacts &&
      typeof commandResponse.artifacts.reciboA4PdfBase64 === 'string'
    ) {
      const pdfBase64 = commandResponse.artifacts.reciboA4PdfBase64 as string;
      const vendaId = String((commandResponse.data as Record<string, unknown> | null)?.id || Date.now());
      const fileName = `recibo-venda-${vendaId}.pdf`;
      const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);

      try {
        await fs.writeFile(tempFilePath, Buffer.from(pdfBase64, 'base64'));

        const docDelivery = await sendWhatsAppDocument(
          cleanPhone,
          fileName,
          `Recibo A4 da venda ${vendaId}`,
          pdfBase64
        );

        if (!docDelivery.ok) {
          console.error('❌ [Evolution API] Erro ao enviar PDF:', docDelivery.error);
          await notifyAdminError(`Erro ao enviar PDF da venda ${vendaId} para ${cleanPhone}: ${docDelivery.error}`);
        } else {
          console.log(`📄 [Evolution API] PDF da venda ${vendaId} enviado com sucesso para ${cleanPhone}.`);
        }
      } catch (pdfError) {
        console.error('❌ [PDF] Erro ao gerar/enviar PDF da venda:', pdfError);
        await notifyAdminError(`Erro no fluxo do PDF da venda para ${cleanPhone}: ${pdfError instanceof Error ? pdfError.message : 'Desconhecido'}`);
      } finally {
        try {
          await fs.unlink(tempFilePath);
          console.log(`🧹 [PDF] Arquivo temporário removido: ${tempFilePath}`);
        } catch {
          console.warn(`⚠️ [PDF] Não foi possível remover o arquivo temporário: ${tempFilePath}`);
        }
      }
    }

    return NextResponse.json(
      {
        status: 'success',
        command: commandResponse ? {
          action: plannedAction ?? null,
          message: commandResponse.message,
          data: commandResponse.data ?? null,
          artifacts: commandResponse.artifacts ?? null,
        } : null,
        dispatchPayload: commandResponse?.dispatchPayload ?? null,
        event: eventName,
        groqClassification,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ [Webhook Error]:', error);
    await notifyAdminError(`Erro no catch principal do webhook: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}