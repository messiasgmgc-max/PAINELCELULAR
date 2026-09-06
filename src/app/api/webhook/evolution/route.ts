import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildWhatsAppText, parseGeminiPlan } from './commandExecutor';
import { processImageVision, VisionEtiquetaResult } from '../../../../lib/image-vision-ocr';

export const maxDuration = 300; // Permite até 5 minutos para ciclo de vida do PIX no Vercel

// Instancia cliente do Supabase com Service Role Key para bypass de RLS no backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações do Evolution API
function getCleanEvolutionUrl(): string {
  let url = (process.env.EVOLUTION_API_URL || 'http://13.140.36.50:8080').trim().replace(/\/+$/, '');
  if (!url) return 'http://13.140.36.50:8080';
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  
  // Se informou o IP da VPS mas esqueceu da porta 8080, anexa a porta 8080
  if (url === 'http://13.140.36.50' || url === 'https://13.140.36.50') {
    url = 'http://13.140.36.50:8080';
  }
  
  return url;
}

const EVOLUTION_URL = getCleanEvolutionUrl();
const EVOLUTION_API_KEY = (process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449').trim();
const DEFAULT_INSTANCE = (process.env.EVOLUTION_INSTANCE_NAME || 'lucasimports').trim();

// ── GET: Endpoint de Validação & Healthcheck do Webhook ──
export async function GET() {
  return NextResponse.json(
    {
      status: 'online',
      service: 'Phone Center Evolution Webhook Engine + IA Vision OCR',
      timestamp: new Date().toISOString(),
      evolution_url: EVOLUTION_URL ? 'Configurado' : 'Pendente',
      instance: DEFAULT_INSTANCE,
    },
    { status: 200 }
  );
}

// ── AUXILIAR: Enviar Mensagem via Evolution API ──
async function enviarMensagemWhatsApp(instanceName: string, destination: string, text: string) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no .env.local');
    return false;
  }

  const isGroup = destination.endsWith('@g.us');
  const cleanDestination = isGroup ? destination : destination.replace(/\D/g, '');
  if (!cleanDestination) return false;

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
        number: cleanDestination,
        text,
        options: {
          delay: 800,
          presence: 'composing',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro ao enviar mensagem via Evolution API (${response.status}):`, errText);
      return false;
    }

    console.log(`✅ Mensagem enviada com sucesso para ${cleanDestination} via instância "${targetInstance}"`);
    return true;
  } catch (err: any) {
    console.error('❌ Falha na requisição para Evolution API:', err?.message || err);
    return false;
  }
}

// ── AUXILIAR: Enviar Imagem / QR Code via Evolution API ──
async function enviarImagemWhatsApp(
  instanceName: string,
  destination: string,
  mediaUrlOrBase64: string,
  caption?: string
) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no .env.local');
    return false;
  }

  const isGroup = destination.endsWith('@g.us');
  const cleanDestination = isGroup ? destination : destination.replace(/\D/g, '');
  if (!cleanDestination) return false;

  const targetInstance = instanceName || DEFAULT_INSTANCE;
  const endpoint = `${EVOLUTION_URL}/message/sendMedia/${targetInstance}`;

  // Se for string base64 pura sem o prefixo data URI, inclui o prefixo
  let mediaPayload = mediaUrlOrBase64;
  if (!mediaPayload.startsWith('http://') && !mediaPayload.startsWith('https://') && !mediaPayload.startsWith('data:')) {
    mediaPayload = `data:image/png;base64,${mediaPayload}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanDestination,
        mediatype: 'image',
        mimetype: 'image/png',
        caption: caption || '',
        media: mediaPayload,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro ao enviar imagem via Evolution API (${response.status}):`, errText);
      return false;
    }

    console.log(`✅ Imagem enviada com sucesso para ${cleanDestination} via instância "${targetInstance}"`);
    return true;
  } catch (err: any) {
    console.error('❌ Falha na requisição sendMedia para Evolution API:', err?.message || err);
    return false;
  }
}

// ── AUXILIAR: Aprovar Renovação de Loja e Notificar no WhatsApp ──
async function aprovarRenovacaoLoja(
  lojaId: string,
  diasAdicionar: number,
  paymentId: string,
  valor: number,
  instanceName?: string,
  destination?: string
) {
  const { data: loja } = await supabase
    .from('lojas')
    .select('*')
    .eq('id', lojaId)
    .maybeSingle();

  if (!loja) return;

  // Calcula nova data de vencimento
  let baseDate = new Date();
  if (loja.data_vencimento) {
    const parts = String(loja.data_vencimento).split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const vencAtual = new Date(year, month, day);
      if (vencAtual.getTime() > baseDate.getTime()) {
        baseDate = vencAtual;
      }
    }
  }

  const novaDataMs = baseDate.getTime() + diasAdicionar * 24 * 60 * 60 * 1000;
  const novoVencimento = new Date(novaDataMs).toISOString().split('T')[0];
  const [ny, nm, nd] = novoVencimento.split('-');
  const novoVencimentoFmt = `${nd}/${nm}/${ny}`;

  // 1. Atualizar a loja para ativo
  await supabase
    .from('lojas')
    .update({
      plano_status: 'ativo',
      data_vencimento: novoVencimento,
      solicitacao_liberacao_status: 'aprovado',
      ativo: true,
    })
    .eq('id', lojaId);

  // 2. Atualizar histórico
  await supabase
    .from('historico_pagamentos_planos')
    .update({
      status: 'aprovado',
      observacao: `Aprovado (ID: ${paymentId}) | Renovado +${diasAdicionar} dias até ${novoVencimentoFmt}`,
    })
    .eq('mp_payment_id', paymentId);

  // 3. Notificar no WhatsApp
  if (destination) {
    const msgAprovado = `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!*\n\n` +
      `Recebemos seu PIX de *R$ ${valor.toFixed(2).replace('.', ',')}*!\n` +
      `Sua assinatura foi estendida em *+${diasAdicionar} dias*.\n\n` +
      `📅 *Novo Vencimento*: *${novoVencimentoFmt}*\n` +
      `✅ O sistema está 100% liberado. Boas vendas! 🚀`;
    await enviarMensagemWhatsApp(instanceName || DEFAULT_INSTANCE, destination, msgAprovado);
  }
}

// ── AUXILIAR: Monitorar Ciclo de Vida do PIX (5 minutos com aviso a 1 min de expirar) ──
async function monitorarCicloVidaPix(params: {
  paymentId: string;
  lojaId: string;
  diasAdicionar: number;
  valorFinal: number;
  instanceName: string;
  targetDestination: string;
  tokenMercadoPago: string;
}) {
  const { paymentId, lojaId, diasAdicionar, valorFinal, instanceName, targetDestination, tokenMercadoPago } = params;

  const verificarSeAprovado = async () => {
    // 1. Verifica no banco se já foi aprovado pelo Webhook
    const { data: hist } = await supabase
      .from('historico_pagamentos_planos')
      .select('status')
      .eq('mp_payment_id', paymentId)
      .maybeSingle();

    if (hist?.status === 'aprovado') return true;

    // 2. Consulta API do Mercado Pago
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${tokenMercadoPago}` },
      });
      if (res.ok) {
        const mpData = await res.json();
        if (mpData.status === 'approved') {
          await aprovarRenovacaoLoja(lojaId, diasAdicionar, paymentId, valorFinal, instanceName, targetDestination);
          return true;
        }
      }
    } catch (e) {
      console.error('Erro ao consultar Mercado Pago no monitoramento:', e);
    }
    return false;
  };

  // Aguarda 4 minutos (240 segundos)
  await new Promise((resolve) => setTimeout(resolve, 240 * 1000));

  if (await verificarSeAprovado()) {
    return;
  }

  // Avisa no WhatsApp que falta 1 minuto para expirar
  await enviarMensagemWhatsApp(
    instanceName,
    targetDestination,
    `⚠️ *Aviso de Expiração do PIX*\n\nResta apenas *1 minuto* para o código PIX de *R$ ${valorFinal.toFixed(2).replace('.', ',')}* expirar!\n\nCaso já tenha efetuado o pagamento, aguarde alguns instantes pela confirmação automática. ✅`
  );

  // Aguarda o minuto final (60 segundos)
  await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

  if (await verificarSeAprovado()) {
    return;
  }

  // Marca como expirado e avisa
  await supabase
    .from('historico_pagamentos_planos')
    .update({
      status: 'expirado',
      observacao: `Expirado após 5 minutos sem pagamento (ID: ${paymentId})`,
    })
    .eq('mp_payment_id', paymentId);

  await enviarMensagemWhatsApp(
    instanceName,
    targetDestination,
    `⌛ *Código PIX Expirado*\n\nO prazo de 5 minutos encerrou e o código PIX foi cancelado para sua segurança.\n\nPara gerar um novo quando quiser, basta enviar:\n👉 *!plano pagar*`
  );
}

// ── AUXILIAR: Resolver ID da Loja ──
async function resolverLojaId(instanceName?: string): Promise<string | null> {
  if (instanceName && instanceName.startsWith('loja-')) {
    const extractedId = instanceName.replace('loja-', '').trim();
    if (extractedId.length >= 30) return extractedId;
  }

  if (instanceName) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('loja_id')
      .or(`session_name.eq.${instanceName},loja_id.eq.${instanceName}`)
      .maybeSingle();

    if (session?.loja_id) return session.loja_id;

    // Busca loja por aproximação de nome (ex: lucasimports -> Lucas Imports)
    const { data: lojas } = await supabase.from('lojas').select('id, nome').eq('ativo', true);
    if (lojas && lojas.length > 0) {
      const cleanInst = instanceName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const lojaMatch = lojas.find((l) => {
        const cleanNome = (l.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanNome.includes(cleanInst) || cleanInst.includes(cleanNome);
      });
      if (lojaMatch) return lojaMatch.id;
    }
  }

  return null;
}

// ── AUXILIAR: Verificar se a loja é a Lucas Imports ──
async function verificarSeLojaLucasImports(lojaId: string | null, instanceName: string): Promise<boolean> {
  const cleanInst = (instanceName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanInst.includes('lucasimports')) return true;

  if (lojaId) {
    const { data: loja } = await supabase
      .from('lojas')
      .select('nome')
      .eq('id', lojaId)
      .maybeSingle();

    const cleanNome = (loja?.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanNome.includes('lucasimports')) return true;
  }

  return false;
}

// ── AUXILIAR: Buscar Base64 de Mídia na Evolution API caso não venha no webhook ──
async function buscarMidiaBase64Evolution(
  instanceName: string,
  messageId: string,
  messageObj: any
): Promise<{ base64: string; mimetype: string } | null> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return null;
  const targetInstance = instanceName || DEFAULT_INSTANCE;

  // 1. Tenta POST /chat/findMediaBase64/${targetInstance}
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findMediaBase64/${targetInstance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: {
          key: { id: messageId },
        },
        convertToMp4: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const b64 = data.base64 || data.data?.base64 || data.media;
      if (b64 && typeof b64 === 'string') {
        return {
          base64: b64,
          mimetype: data.mimetype || 'image/jpeg',
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ Falha ao buscar media via /chat/findMediaBase64:', err);
  }

  // 2. Tenta POST /chat/getBase64FromMediaMessage/${targetInstance}
  try {
    const res2 = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${targetInstance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: messageObj,
        convertToMp4: false,
      }),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const b64_2 = data2.base64 || data2.data?.base64 || data2.media;
      if (b64_2 && typeof b64_2 === 'string') {
        return {
          base64: b64_2,
          mimetype: data2.mimetype || 'image/jpeg',
        };
      }
    }
  } catch (err2) {
    console.warn('⚠️ Falha ao buscar media via /chat/getBase64FromMediaMessage:', err2);
  }

  return null;
}

// ── AUXILIAR: Processar e Comparar Resultado do OCR de Etiqueta com Supabase ──
async function processarResultadoVisionEtiqueta(
  vision: VisionEtiquetaResult,
  lojaId: string | null,
  pushName: string
): Promise<string> {
  if (!lojaId) {
    return "❌ Não consegui identificar sua loja para executar este comando, contate o suporte";
  }

  // 1. Se for comprovante de pagamento bancário (Pix/TED)
  if (vision.tipo_documento === 'comprovante_pagamento' || (vision.amount && !vision.imei && !vision.modelo)) {
    const valorFmt = vision.amount ? `R$ ${Number(vision.amount).toFixed(2).replace('.', ',')}` : 'Não identificado';
    const mod = vision.modality || 'Pix / Transferência';
    const tx = vision.machine_serial || 'N/A';
    const pessoa = vision.pagador_ou_recebedor ? `\n👤 *Envolvido:* ${vision.pagador_ou_recebedor}` : '';

    return `🧾 *COMPROVANTE BANCÁRIO IDENTIFICADO COM IA!*

💰 *Valor:* *${valorFmt}*
💳 *Modalidade:* ${mod}${pessoa}
🆔 *Autenticação/TXID:* \`${tx}\`

✅ *Comprovante lido com sucesso!*
💡 *Dica:* Para dar baixa em dívida de lojista, utilize:
\`!abater [Nome do Lojista] ${vision.amount || ''}\``.trim();
  }

  // 2. Se for etiqueta de aparelho celular
  const imei = vision.imei ? String(vision.imei).replace(/\D/g, '') : null;
  const codigoEtiqueta = vision.codigo_etiqueta ? String(vision.codigo_etiqueta).trim() : null;
  const modeloLido = vision.modelo ? String(vision.modelo).trim() : null;
  const capacidadeLida = vision.capacidade ? String(vision.capacidade).trim() : null;
  const corLida = vision.cor ? String(vision.cor).trim() : null;
  const bateriaLida = vision.saude_bateria ? Number(vision.saude_bateria) : null;
  const precoLido = vision.preco ? Number(vision.preco) : null;

  let aparelhoEncontrado: any = null;

  // Busca 1: Por IMEI no Supabase (exato ou que termine com os dígitos)
  if (imei && imei.length >= 4) {
    const qImei = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

    const { data: porImei } = await qImei.or(`imei.eq.${imei},imei.ilike.%${imei}%`).limit(1);
    if (porImei && porImei.length > 0) {
      aparelhoEncontrado = porImei[0];
    }
  }

  // Busca 2: Por Código da Etiqueta / Código Único
  if (!aparelhoEncontrado && codigoEtiqueta) {
    const qCod = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

    const { data: porCod } = await qCod.or(`codigo.eq.${codigoEtiqueta},codigoUnico.eq.${codigoEtiqueta},id.eq.${codigoEtiqueta}`).limit(1);
    if (porCod && porCod.length > 0) {
      aparelhoEncontrado = porCod[0];
    }
  }

  // Busca 3: Por Modelo + Capacidade (se houver correspondência única em estoque)
  if (!aparelhoEncontrado && modeloLido) {
    let qMod = supabase.from('aparelhos').select('*').ilike('modelo', `%${modeloLido}%`).eq('loja_id', lojaId);
    if (capacidadeLida) qMod = qMod.ilike('capacidade', `%${capacidadeLida}%`);

    const { data: porMod } = await qMod.eq('ativo', true).neq('status', 'vendido').limit(2);
    if (porMod && porMod.length === 1) {
      aparelhoEncontrado = porMod[0];
    }
  }

  // ── CASO A: Aparelho LOCALIZADO no Banco de Dados ──
  if (aparelhoEncontrado) {
    const isVendido =
      aparelhoEncontrado.condicao === 'vendido' ||
      aparelhoEncontrado.status === 'vendido' ||
      aparelhoEncontrado.ativo === false;

    // Se já foi vendido, busca histórico na tabela 'vendas'
    if (isVendido) {
      const qVenda = supabase.from('vendas').select('*').eq('loja_id', lojaId);

      const { data: vendas } = await qVenda
        .or(`aparelho_id.eq.${aparelhoEncontrado.id},imei.eq.${aparelhoEncontrado.imei || imei}`)
        .order('created_at', { ascending: false })
        .limit(1);

      const venda = vendas?.[0];
      const dataVendaFmt = venda?.dataPagamento || venda?.created_at || aparelhoEncontrado.dataVenda || 'Data recente';
      const comprador = venda?.clienteNome || aparelhoEncontrado.comprador || 'Cliente';
      const valorVendaFmt = (venda?.valor || aparelhoEncontrado.precoVenda)
        ? `R$ ${Number(venda?.valor || aparelhoEncontrado.precoVenda).toFixed(2).replace('.', ',')}`
        : 'Valor não informado';

      return `⚠️ *ALERTA DE SEGURANÇA: APARELHO JÁ CONSTA COMO VENDIDO!*

📱 *Aparelho:* ${aparelhoEncontrado.marca || ''} ${aparelhoEncontrado.modelo} (${aparelhoEncontrado.capacidade || 'N/A'})
🎨 *Cor:* ${aparelhoEncontrado.cor || 'Padrão'}
🔢 *IMEI:* \`${aparelhoEncontrado.imei || imei || 'Não registrado'}\`
🏷️ *Código:* \`${aparelhoEncontrado.codigo || aparelhoEncontrado.id.slice(0, 8)}\`

📋 *Histórico da Saída:*
• *Status:* 🔴 *VENDIDO / BAIXADO*
• *Comprador:* ${comprador}
• *Valor da Venda:* ${valorVendaFmt}
• *Data de Venda:* ${dataVendaFmt}

⚠️ *Atenção:* Este aparelho já saiu do estoque oficial. Não o comercialize novamente sem antes reativá-lo!`.trim();
    }

    // Aparelho ATIVO e DISPONÍVEL em estoque!
    // Comparação de dados:
    let comparativoBateria = '';
    const batSistema = parseInt(String(aparelhoEncontrado.saudeBateria || aparelhoEncontrado.saude_bateria || '0').replace(/\D/g, ''), 10);
    if (bateriaLida && batSistema > 0) {
      if (bateriaLida === batSistema) {
        comparativoBateria = `🔋 *Saúde Bateria:* ${batSistema}% ✅ *(confere com sistema)*`;
      } else {
        comparativoBateria = `🔋 *Saúde Bateria:* ${bateriaLida}% na etiqueta *(sistema marca ${batSistema}% ⚠️)*`;
      }
    } else if (batSistema > 0) {
      comparativoBateria = `🔋 *Saúde Bateria:* ${batSistema}% (no sistema)`;
    } else if (bateriaLida) {
      comparativoBateria = `🔋 *Saúde Bateria:* ${bateriaLida}% (lida na etiqueta)`;
    }

    const precoVarejo = aparelhoEncontrado.preco ? `R$ ${Number(aparelhoEncontrado.preco).toFixed(2).replace('.', ',')}` : 'Consulte';
    const precoAtacado = (aparelhoEncontrado.precoAtacado || aparelhoEncontrado.preco_atacado)
      ? `R$ ${Number(aparelhoEncontrado.precoAtacado || aparelhoEncontrado.preco_atacado).toFixed(2).replace('.', ',')}`
      : 'Não definido';

    const identificadorAcao = aparelhoEncontrado.imei || aparelhoEncontrado.codigo || aparelhoEncontrado.id;

    return `🏷️ *ETIQUETA IDENTIFICADA COM SUCESSO!*

📱 *${aparelhoEncontrado.marca || ''} ${aparelhoEncontrado.modelo}* (${aparelhoEncontrado.capacidade || capacidadeLida || 'N/A'})
🎨 *Cor:* ${aparelhoEncontrado.cor || corLida || 'Padrão'}
🔢 *IMEI:* \`${aparelhoEncontrado.imei || imei || 'N/A'}\`
🏷️ *Código Sistema:* \`${aparelhoEncontrado.codigo || aparelhoEncontrado.id.slice(0, 8)}\`
${comparativoBateria ? comparativoBateria + '\n' : ''}
📦 *Status:* 🟢 *DISPONÍVEL EM ESTOQUE*
💵 *Preço Varejo:* ${precoVarejo}
🤝 *Preço Atacado:* ${precoAtacado}

⚡ *Ações Rápidas via WhatsApp:*
• *Vender aparelho:* Digite \`!vender ${identificadorAcao} [valor] [nome]\`
• *Alterar preço:* Digite \`!preco ${identificadorAcao} [novo_valor]\``.trim();
  }

  // ── CASO B: Aparelho NÃO ENCONTRADO no banco de dados ──
  const precoSugerido = precoLido ? `R$ ${precoLido.toFixed(2).replace('.', ',')}` : 'Não informado';
  const capFmt = capacidadeLida || '128GB';
  const modFmt = modeloLido || 'Smartphone';
  const imeiFmt = imei || 'SEM-IMEI';

  return `🔍 *APARELHO NÃO ENCONTRADO NO ESTOQUE*

🤖 *Dados lidos da etiqueta com IA:*
• *Modelo:* ${modFmt}
• *Capacidade:* ${capFmt}
• *Cor:* ${corLida || 'Padrão'}
• *IMEI:* \`${imei || 'Não identificado'}\`
• *Bateria:* ${bateriaLida ? bateriaLida + '%' : 'Não informada'}
• *Preço na Etiqueta:* ${precoSugerido}
• *Código da Etiqueta:* ${codigoEtiqueta || 'N/A'}

📥 *Deseja dar entrada desse aparelho no sistema?*
Basta responder:
\`!cadastrar ${modFmt} ${capFmt} ${imeiFmt} ${precoLido || ''}\`
e eu cadastro no estoque da loja instantaneamente!`.trim();
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

// ── AUXILIAR: Normalizar Nome de Modelo para Ordenação e Agrupamento ──
function normalizarModelo(mod?: string | null): string {
  return (mod || '').trim().replace(/^iphone\s*/i, 'iPhone ');
}

// ── AUXILIAR: Extrair Emoji da Cor e Nome Limpo ──
function formatarCorEEmoji(corOriginal?: string | null): { emoji: string; nomeCor: string } {
  if (!corOriginal || corOriginal.trim() === '' || corOriginal === 'N/A') {
    return { emoji: '▫️', nomeCor: '' };
  }

  const texto = corOriginal.trim();
  const lower = texto.toLowerCase();

  let emoji = '';
  if (lower.includes('preto') || lower.includes('black') || lower.includes('grafite') || lower.includes('meia-noite') || lower.includes('space gray')) {
    emoji = '⚫';
  } else if (lower.includes('branco') || lower.includes('white') || lower.includes('prata') || lower.includes('silver') || lower.includes('estelar')) {
    emoji = '⚪';
  } else if (lower.includes('azul') || lower.includes('blue') || lower.includes('sierra') || lower.includes('ultramarine') || lower.includes('ultramarino')) {
    emoji = '🔵';
  } else if (lower.includes('roxo') || lower.includes('purple') || lower.includes('lilas') || lower.includes('lilás')) {
    emoji = '🟣';
  } else if (lower.includes('dourado') || lower.includes('gold') || lower.includes('amarelo') || lower.includes('yellow')) {
    emoji = '🟡';
  } else if (lower.includes('verde') || lower.includes('green') || lower.includes('teal')) {
    emoji = '🟢';
  } else if (lower.includes('vermelho') || lower.includes('red')) {
    emoji = '🔴';
  } else if (lower.includes('rosa') || lower.includes('pink') || lower.includes('rose')) {
    emoji = '🌸';
  } else if (lower.includes('desert') || lower.includes('deserto')) {
    emoji = '🏜️';
  } else if (lower.includes('natural') || lower.includes('titanium') || lower.includes('titânio') || lower.includes('cinza') || lower.includes('gray')) {
    emoji = '🔘';
  } else if (lower.includes('laranja') || lower.includes('orange') || lower.includes('coral')) {
    emoji = '🟠';
  }

  if (!emoji) {
    const emojiMatch = texto.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    if (emojiMatch) {
      emoji = emojiMatch[0];
    } else {
      emoji = '▫️';
    }
  }

  const nomeCorLimpo = texto
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\uFE0F/gu, '')
    .trim();

  return { emoji, nomeCor: nomeCorLimpo };
}

// ── CACHE DE BUFFER E ANTI-FLOOD PARA GRUPOS DE WHATSAPP ──
// Buffer da última mensagem por participante para lidar com mensagens divididas (ex: "15 Pro Max" + "Quem tem?")
const bufferUltimaMensagemParticipante = new Map<string, { texto: string; timestamp: number }>();

// Histórico de respostas enviadas no grupo para evitar flood e repetição desnecessária
const historicoRespostasGrupo = new Map<string, number>();

// ── AUXILIAR: Resposta Natural de Estoque / iPhone para Grupos e Privado ──
async function responderConsultaEstoqueNatural(
  texto: string,
  pushName: string,
  lojaId: string | null,
  instanceName: string,
  isGroup: boolean,
  senderPhone?: string,
  remoteJid?: string
): Promise<string | null> {
  // 1. Exceção de Negócio: A escuta e resposta automática a conversas em grupos ("tem tal modelo? Responde: Tem aqui...")
  // é uma funcionalidade EXCLUSIVA da Lucas Imports.
  // Lojistas e clientes comuns da plataforma NÃO têm essa escuta automática ativada em grupos para não banalizar o bot
  // e evitar misturar estoques. Eles utilizam os comandos normais no privado ou o comando explícito !estoque.
  const isLucas = await verificarSeLojaLucasImports(lojaId, instanceName);
  if (!isLucas || !lojaId) {
    return null;
  }

  const cleanSender = (senderPhone || '').replace(/\D/g, '');
  const cleanPushName = (pushName || '').toLowerCase();

  // Se a mensagem em grupo vier do próprio Lucas ou da equipe da loja, o bot nunca responde a si mesmo
  if (isGroup) {
    if (
      cleanSender.endsWith('94986029') ||
      cleanSender.endsWith('994986029') ||
      cleanPushName.includes('lucas imports') ||
      cleanPushName === 'lucas'
    ) {
      return null;
    }
  }

  const textoLimpo = texto.toLowerCase().trim();

  // Em grupos, ignora textos excessivamente longos (listas de terceiros, bate-papo longo, etc.)
  if (isGroup && textoLimpo.length > 160) {
    return null;
  }

  // Lógica de buffer para mensagens consecutivas do mesmo participante (ex: "15 pro max 256gb" e logo em seguida "quem tem?")
  const participantKey = `${remoteJid || 'direct'}:${cleanSender || 'unknown'}`;
  let textoParaAnalise = textoLimpo;

  const IPHONE_REGEX = /(?:iphone\s*|ip\s*)?(1[1-7]|xr|xs|se|16e)\s*(pro\s*max|promax|pmax|pmx|pm|pro|p|plus|\+|mini)?(?:\b|\s|[?!.,]|$)/i;

  const agora = Date.now();
  if (isGroup) {
    const prevMsg = bufferUltimaMensagemParticipante.get(participantKey);
    // Se o usuário mandou uma mensagem nos últimos 20 segundos
    if (prevMsg && agora - prevMsg.timestamp < 20000) {
      // Se a mensagem atual não tem modelo, mas tem intenção de compra, une com a anterior
      if (!IPHONE_REGEX.test(textoLimpo)) {
        textoParaAnalise = `${prevMsg.texto} ${textoLimpo}`.trim();
      }
    }
    // Atualiza buffer da última mensagem deste participante
    bufferUltimaMensagemParticipante.set(participantKey, { texto: textoLimpo, timestamp: agora });
  }

  // 1. FILTRO DE PRODUTOS EXCLUÍDOS (Não são iPhones: iPads, Apple Watch, Macbooks, fones, acessórios, caminhão, etc.)
  const EXCLUDED_PRODUCTS = [
    /\bipad\b/i,
    /\bwatch\b/i,
    /\bapple\s*watch\b/i,
    /\bmacbook\b/i,
    /\bmac\b/i,
    /\bairpod[s]?\b/i,
    /\bpencil\b/i,
    /\bcaneta\b/i,
    /\btv\s*box\b/i,
    /\bjbl\b/i,
    /\bboombox\b/i,
    /\bcarregador\b/i,
    /\bfonte\b/i,
    /\baxor\b/i,
    /\bcaminh[aã]o\b/i,
    /\bmotoca\b/i,
    /\broupa\b/i
  ];
  if (EXCLUDED_PRODUCTS.some((p) => p.test(textoParaAnalise))) {
    return null;
  }

  // Se menciona termos de Apple Watch sem conter a palavra "iphone"
  if (/\b(4[0-9]mm|series\s*\d|s[789]\b|s1[0-9]\b|gps|cellular)\b/i.test(textoParaAnalise) && !/iphone\b/i.test(textoParaAnalise)) {
    return null;
  }

  // 2. FILTRO DE VENDEDORES ANUNCIANDO, RESPOSTAS OU BATE-PAPO ALEATÓRIO (Não é comprador pedindo)
  const SELLER_OR_CHAT_PATTERNS = [
    /^\s*tem\b/i,
    /^\s*tenho\b/i,
    /\beu\s+tenho\b/i,
    /\btemos\b/i,
    /\bvem\s+nele\b/i,
    /\bvem\s+que\s+tem\b/i,
    /\bpasso\s+por\b/i,
    /\bfa[cç]o\s+a\b/i,
    /\bt[oô]\s+vendendo\b/i,
    /\bvendo\b/i,
    /\b0\s*ciclos\b/i,
    /\bnunca\s+viu\s+chave\b/i,
    /\btela\s+ori\b/i,
    /\btrocadinho\b/i,
    /\btomar\s+no\b/i,
    /\bcu\b/i,
    /\bfdp\b/i,
    /\bkkk/i,
    /\bhaha/i,
    /\bengra[cç]ado\b/i,
    /\bcasamento\b/i,
    /\bde\s+volta\s+no\b/i,
    /\bdando\s+\d+\s+pro\b/i,
    /\banos\b/i,
    /^\s*(\d{1,2}[.,]\d{3}|\d{3,4})\s*$/
  ];
  if (SELLER_OR_CHAT_PATTERNS.some((p) => p.test(textoParaAnalise))) {
    return null;
  }

  // 3. INTENÇÃO DE COMPRA DO CLIENTE / LOJISTA
  const BUYER_INTENT_PATTERNS = [
    /\bquem\s+tem\b/i,
    /\balgu[eé]m\b/i,
    /\balgm\b/i,
    /\bpreciso\s+de\b/i,
    /\bt[oô]\s+precisando\b/i,
    /\bprocuro\b/i,
    /\bprocurando\b/i,
    /\bcompro\b/i,
    /\bcomprando\b/i,
    /\bqual\s+tem\b/i,
    /\bonde\s+tem\b/i,
    /\btem\s+a[ií]\b/i,
    /\btem\s+aqui\b/i,
    /\bquem\s+t[aá]\s+tendo\b/i,
    /\bpra\s+hoje\b/i,
    /\bpra\s+agora\b/i,
    /\bpego\s+hoje\b/i,
    /\bpre[cç]o\s+campe[aã]o\b/i,
    /\bpre[cç]o\s+de\s+noia\b/i,
    /\bmelhor\s+pre[cç]o\b/i,
    /\bmenor\s+valor\b/i,
    /\bquem\s+tiver\b/i,
    /\bmanda\s+pv\b/i,
    /\bdispon[ií]vel\b.*\?/i,
    /\b(64|128|256|512|1tb)\s*(?:gb|gigas|g)?\s*\?+/i,
    /\b(pro|promax|pm|pmx|plus|mini)\b.*\?+/i
  ];

  const temIntencaoCompra = BUYER_INTENT_PATTERNS.some((p) => p.test(textoParaAnalise));

  // Em grupos: SÓ responde se houver intenção clara de compra! No privado aceita perguntas mais diretas
  if (isGroup && !temIntencaoCompra) {
    return null;
  }

  // 4. EXTRAÇÃO DO MODELO DE IPHONE
  const modeloMatch = textoParaAnalise.match(IPHONE_REGEX);
  if (!modeloMatch) {
    return null;
  }

  const termoNumero = modeloMatch[1].toUpperCase();
  const sufRaw = (modeloMatch[2] || '').toLowerCase().replace(/\s+/g, '');

  let variante: 'PRO_MAX' | 'PRO' | 'PLUS' | 'MINI' | 'BASE_ONLY' | 'QUALQUER' = 'QUALQUER';
  let modeloAlvoFormatado = '';

  if (['pm', 'promax', 'pmax', 'pmx'].includes(sufRaw)) {
    variante = 'PRO_MAX';
    modeloAlvoFormatado = `iPhone ${termoNumero} Pro Max`;
  } else if (['p', 'pro'].includes(sufRaw)) {
    variante = 'PRO';
    modeloAlvoFormatado = `iPhone ${termoNumero} Pro`;
  } else if (['plus', '+', 'pl'].includes(sufRaw)) {
    variante = 'PLUS';
    modeloAlvoFormatado = `iPhone ${termoNumero} Plus`;
  } else if (sufRaw === 'mini') {
    variante = 'MINI';
    modeloAlvoFormatado = `iPhone ${termoNumero} Mini`;
  } else if (!sufRaw) {
    variante = 'BASE_ONLY';
    modeloAlvoFormatado = termoNumero === '16E' ? 'iPhone 16e' : `iPhone ${termoNumero}`;
  }

  // Anti-Flood em Grupos: não responder ao mesmo modelo no mesmo grupo nos últimos 30 segundos
  if (isGroup && remoteJid) {
    const floodKeyModelo = `${remoteJid}:${modeloAlvoFormatado}`;
    const ultimoEnvioModelo = historicoRespostasGrupo.get(floodKeyModelo);
    if (ultimoEnvioModelo && agora - ultimoEnvioModelo < 30000) {
      console.log(`[Anti-Flood Grupo] Ignorado resposta para ${modeloAlvoFormatado} no grupo ${remoteJid} (enviado há menos de 30s)`);
      return null;
    }

    const floodKeyParticipante = `${remoteJid}:${cleanSender}`;
    const ultimoEnvioParticipante = historicoRespostasGrupo.get(floodKeyParticipante);
    if (ultimoEnvioParticipante && agora - ultimoEnvioParticipante < 20000) {
      console.log(`[Anti-Flood Grupo] Ignorado resposta para participante ${cleanSender} no grupo ${remoteJid} (enviado há menos de 20s)`);
      return null;
    }
  }

  // 5. CONSULTA AO BANCO DE DADOS
  const { data: aparelhos } = await supabase
    .from('aparelhos')
    .select('id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, imei, codigo, status, condicao')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .neq('condicao', 'vendido')
    .neq('status', 'vendido');

  if (!aparelhos || aparelhos.length === 0) {
    return null;
  }

  const numLower = termoNumero.toLowerCase();
  const aparelhosDaGeracao = aparelhos.filter((a) => {
    const mod = String(a.modelo || '').toLowerCase();
    return new RegExp(`\\b${numLower}\\b`).test(mod) || mod.includes(`iphone ${numLower}`) || mod.includes(`ip ${numLower}`) || mod.startsWith(numLower);
  });

  let aparelhosEncontrados: any[] = [];
  if (variante === 'PRO_MAX') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('pro max') || mod.includes('promax') || mod.includes('pmax');
    });
  } else if (variante === 'PRO') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return (mod.includes('pro') || mod.includes(' pro ')) && !mod.includes('max') && !mod.includes('promax');
    });
  } else if (variante === 'PLUS') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('plus') || mod.includes('+');
    });
  } else if (variante === 'MINI') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('mini');
    });
  } else if (variante === 'BASE_ONLY') {
    const baseModels = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return !mod.includes('pro') && !mod.includes('max') && !mod.includes('plus') && !mod.includes('mini');
    });
    aparelhosEncontrados = baseModels.length > 0 ? baseModels : aparelhosDaGeracao;
  } else {
    aparelhosEncontrados = aparelhosDaGeracao;
  }

  // 6. FILTRO ESTREITO DE CAPACIDADE (Se o comprador especificou ex: "256gb" ou "128")
  const capMatch = textoParaAnalise.match(/\b(64|128|256|512|1024|1\s*tb|1\s*tera)\s*(?:gb|gigas|g)?\b/i);
  if (capMatch) {
    const capAlvo = capMatch[1].toLowerCase().replace(/\s+/g, '');
    const filtradosPorCap = aparelhosEncontrados.filter((a) => {
      const cap = String(a.capacidade || '').toLowerCase();
      return cap.includes(capAlvo);
    });

    if (filtradosPorCap.length > 0) {
      aparelhosEncontrados = filtradosPorCap;
    } else if (isGroup) {
      // Em grupo: se o lojista pediu 256GB e NÃO temos 256GB, NÃO responde nada para não poluir o grupo!
      return null;
    }
  }

  // 7. CHECAGEM DE ESTOQUE
  if (aparelhosEncontrados.length === 0) {
    // Em grupos: SILÊNCIO TOTAL quando não tem em estoque! Zero spam.
    if (isGroup) {
      return null;
    }
    return `No momento o *${modeloAlvoFormatado}* esgotou por aqui.`;
  }

  // Atualiza cooldown de envio para este modelo e participante no grupo
  if (isGroup && remoteJid) {
    historicoRespostasGrupo.set(`${remoteJid}:${modeloAlvoFormatado}`, agora);
    historicoRespostasGrupo.set(`${remoteJid}:${cleanSender}`, agora);
  }

  // Ordena por modelo normalizado
  aparelhosEncontrados.sort((a, b) => normalizarModelo(a.modelo).localeCompare(normalizarModelo(b.modelo)));

  // Em grupos, limita a exibição a no máximo 6 itens para não sobrecarregar o chat
  const aparelhosExibicao = isGroup ? aparelhosEncontrados.slice(0, 6) : aparelhosEncontrados;

  let ultimoModelo = '';
  const linhasEncontrados: string[] = [];

  aparelhosExibicao.forEach((a) => {
    const modNorm = normalizarModelo(a.modelo);
    if (ultimoModelo && ultimoModelo !== modNorm) {
      linhasEncontrados.push('');
    }
    ultimoModelo = modNorm;

    const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
    const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
    const batVal = a.saude_bateria || (a as any).saudeBateria;
    const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
    const bat = batNum ? `(${batNum}%)` : '';
    const precoValor = a.preco_atacado || (a as any).precoAtacado || a.preco;
    const precoFinal = precoValor ? `- R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';
    const modCap = [modNorm, cap].filter(Boolean).join(' ');
    const extras = [nomeCor, bat].filter(Boolean).join(' ');
    linhasEncontrados.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} ${precoFinal}`.replace(/\s+/g, ' ').trim());
  });

  if (isGroup && aparelhosEncontrados.length > 6) {
    linhasEncontrados.push(`\n_... e mais ${aparelhosEncontrados.length - 6} opções disponíveis no estoque._`);
  }

  return `Tem aqui esses modelos:\n\n${linhasEncontrados.join('\n')}`;
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
    if (key.fromMe || remoteJid.includes('status@broadcast')) {
      return NextResponse.json({ status: 'ok', message: 'Mensagem própria ou broadcast ignorada.' }, { status: 200 });
    }

    const isGroup = remoteJid.endsWith('@g.us');
    const participantJid = String(key.participant || msgData.participant || key.remoteJid || '');
    const participantPhone = participantJid.replace(/@.*$/, '').replace(/\D/g, '');
    const senderPhone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '');
    const pushName = msgData.pushName || msgData.verifiedBizName || (isGroup ? 'Participante' : senderPhone);
    const targetDestination = isGroup ? remoteJid : senderPhone;

    const messageContent = msgData.message || {};

    // ── 3.1. RECONHECIMENTO DE IMAGEM / ETIQUETA COM IA VISION OCR ──
    const hasImage = Boolean(
      messageContent.imageMessage ||
      msgData.imageMessage ||
      msgData.messageType === 'imageMessage' ||
      payload.data?.messageType === 'imageMessage'
    );

    if (hasImage) {
      console.log(`📸 Imagem recebida de ${pushName} (${targetDestination}). Iniciando OCR Vision...`);

      let rawBase64 =
        msgData.base64 ||
        msgData.message?.base64 ||
        payload.data?.base64 ||
        payload.data?.message?.base64 ||
        messageContent.imageMessage?.base64 ||
        '';

      let mimeType = messageContent.imageMessage?.mimetype || 'image/jpeg';

      // Se não veio base64 direto no payload, busca na Evolution API
      if (!rawBase64 && key.id) {
        console.log(`📥 Buscando mídia base64 na Evolution API para a mensagem ${key.id}...`);
        const mediaResult = await buscarMidiaBase64Evolution(instanceName, key.id, msgData);
        if (mediaResult) {
          rawBase64 = mediaResult.base64;
          mimeType = mediaResult.mimetype || mimeType;
        }
      }

      if (rawBase64) {
        // Envia mensagem imediata informando processamento
        await enviarMensagemWhatsApp(instanceName, targetDestination, '🔍 *Analisando foto com IA Vision...* Só um instante! ⏳');

        try {
          const visionData = await processImageVision(rawBase64, mimeType);

          if (visionData) {
            console.log('🤖 Resultado do OCR Vision:', JSON.stringify(visionData));
            const respostaEtiqueta = await processarResultadoVisionEtiqueta(visionData, lojaId, pushName);
            await enviarMensagemWhatsApp(instanceName, targetDestination, respostaEtiqueta);

            if (lojaId) {
              await supabase.from('whatsapp_logs').insert({
                loja_id: lojaId,
                contato: `${pushName} (${isGroup ? 'Grupo' : senderPhone})`,
                mensagem: `[FOTO/OCR] Lidos: ${visionData.modelo || visionData.tipo_documento} (IMEI: ${visionData.imei || '-'})`,
                created_at: new Date().toISOString(),
              });
            }

            return NextResponse.json({ status: 'ok', message: 'Foto processada com sucesso via IA Vision.' }, { status: 200 });
          } else {
            await enviarMensagemWhatsApp(
              instanceName,
              targetDestination,
              '⚠️ Não consegui extrair as informações da foto. Certifique-se de que a etiqueta está focada e com boa iluminação!'
            );
            return NextResponse.json({ status: 'ok', message: 'Falha na leitura da imagem.' }, { status: 200 });
          }
        } catch (visionErr: any) {
          console.error('❌ Erro no processamento de visão OCR:', visionErr);
          await enviarMensagemWhatsApp(
            instanceName,
            targetDestination,
            '⚠️ Ocorreu uma instabilidade momentânea ao ler a foto. Por favor, tente enviar novamente!'
          );
          return NextResponse.json({ error: visionErr.message }, { status: 500 });
        }
      }
    }

    // ── 3.2. EXTRAÇÃO E TRATAMENTO DE TEXTO ──
    const textContent =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.buttonsResponseMessage?.selectedButtonId ||
      messageContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
      '';

    if (!textContent || textContent.trim() === '') {
      return NextResponse.json({ status: 'ok', message: 'Mensagem sem conteúdo textual.' }, { status: 200 });
    }

    console.log(`📩 Mensagem recebida de ${pushName} (${isGroup ? 'Grupo ' + remoteJid : senderPhone}): "${textContent.slice(0, 60)}..."`);

    // 4. Salva log no Supabase (`whatsapp_logs`)
    if (lojaId) {
      await supabase.from('whatsapp_logs').insert({
        loja_id: lojaId,
        contato: `${pushName} (${isGroup ? 'Grupo' : senderPhone})`,
        mensagem: textContent,
        created_at: new Date().toISOString(),
      });
    }

    const lowerText = textContent.toLowerCase().trim();

    // ── 5. COMANDO: !vender [identificador] [valor] [comprador?] ──
    if (lowerText.startsWith('!vender')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        const msgErro = `⚠️ *Formato de venda incompleto!*\nUse: *!vender [IMEI ou ID] [Valor] [Nome do Cliente (opcional)]*\nExemplo: *!vender 356829104829102 2800 Lucas*`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgErro);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const termoBusca = partes[1].trim();
      const valorNum = parseFloat(partes[2].replace(/[^\d.,]/g, '').replace(',', '.'));
      const compradorNome = partes.slice(3).join(' ').trim() || pushName || 'Cliente WhatsApp';

      if (isNaN(valorNum) || valorNum <= 0) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Valor numérico inválido: "${partes[2]}". Digite um valor válido.`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const qApar = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

      const { data: aparelhos } = await qApar
        .or(`imei.eq.${termoBusca},imei.ilike.%${termoBusca}%,codigo.eq.${termoBusca},id.eq.${termoBusca}`)
        .limit(1);

      const aparelho = aparelhos?.[0];

      if (!aparelho) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Não encontrei nenhum aparelho com o código ou IMEI "${termoBusca}". Verifique se o identificador está correto!`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      if (aparelho.status === 'vendido' || aparelho.condicao === 'vendido' || aparelho.ativo === false) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ O aparelho *${aparelho.modelo}* (IMEI: ${aparelho.imei}) já consta como vendido no sistema!`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      // 1. Atualiza o aparelho para vendido
      await supabase.from('aparelhos').update({
        condicao: 'vendido',
        status: 'vendido',
        ativo: false,
        comprador: compradorNome,
        precoVenda: valorNum,
        dataVenda: new Date().toISOString(),
      }).eq('id', aparelho.id);

      // 2. Insere na tabela 'vendas'
      const custoNum = Number(aparelho.custo || aparelho.precoCusto || 0);
      const lucroNum = valorNum - custoNum;
      const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

      await supabase.from('vendas').insert({
        loja_id: lojaId,
        lojaId: lojaId,
        clienteNome: compradorNome,
        vendedor: `WhatsApp (${pushName})`,
        tipoEntrega: 'Varejo',
        valor: valorNum,
        custo: custoNum,
        lucro: lucroNum,
        percentualLucro: parseFloat(margemPercent) || 0,
        dataPagamento: new Date().toISOString(),
        status: 'pago',
        metodo: 'pix',
        valorPago: valorNum,
        saldoDevedor: 0,
        descricao: `Venda via WhatsApp: ${aparelho.marca} ${aparelho.modelo}`,
        garantia: '3 Meses (Garantia Legal)',
        descontoTotal: 0,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelho.id,
            descricao: `${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || 'N/A'}) - IMEI: ${aparelho.imei || termoBusca}`,
            quantidade: 1,
            valorInterno: custoNum,
            valorExibir: valorNum,
            desconto: 0,
            tipoDesconto: 'R$',
            total: valorNum,
            observacao: `Venda balcão via WhatsApp para ${compradorNome}`,
          },
        ],
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: 'pix',
            valor: valorNum,
            parcelas: 1,
          },
        ],
      });

      // 3. Log de auditoria
      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'venda',
          acao: `Venda WhatsApp: ${aparelho.modelo}`,
          detalhes: `Aparelho ${aparelho.modelo} (IMEI ${aparelho.imei}) vendido para ${compradorNome} por R$ ${valorNum.toFixed(2)}`,
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa ao registrar log_sistema:', logErr);
      }

      const respVenda = `🎉 *VENDA REGISTRADA COM SUCESSO!*

📱 *Aparelho:* ${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || 'N/A'})
🔢 *IMEI:* \`${aparelho.imei || termoBusca}\`
👤 *Comprador:* ${compradorNome}
💰 *Valor Final:* R$ ${valorNum.toFixed(2).replace('.', ',')}
📦 *Status:* Baixado do estoque oficial!

Os relatórios de vendas e auditoria da loja já foram atualizados. 🚀`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respVenda);
      return NextResponse.json({ status: 'ok', message: 'Venda registrada via WhatsApp.' }, { status: 200 });
    }

    // ── 6. COMANDO: !cadastrar [modelo] [capacidade] [imei] [preco] ──
    if (lowerText.startsWith('!cadastrar')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        const msgErro = `⚠️ *Formato de cadastro incompleto!*\nUse: *!cadastrar [Modelo] [Capacidade] [IMEI] [Preço]*\nExemplo: *!cadastrar iPhone 13 128GB 356829104829102 2800*`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgErro);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      let precoCad = 0;
      const ultimo = partes[partes.length - 1].replace(/[^\d.,]/g, '').replace(',', '.');
      if (!isNaN(parseFloat(ultimo))) {
        precoCad = parseFloat(ultimo);
        partes.pop();
      }

      let imeiCad = '';
      const penultimo = partes[partes.length - 1].replace(/\D/g, '');
      if (penultimo.length >= 8) {
        imeiCad = penultimo;
        partes.pop();
      }

      let capCad = '128GB';
      const antepenultimo = partes[partes.length - 1];
      if (/^\d+\s*(?:gb|tb)$/i.test(antepenultimo)) {
        capCad = antepenultimo.toUpperCase();
        partes.pop();
      }

      const modeloCad = partes.slice(1).join(' ').trim() || 'iPhone';

      const novoAparelho = {
        loja_id: lojaId,
        marca: modeloCad.toUpperCase().includes('IPHONE') ? 'Apple' : 'Smartphone',
        modelo: modeloCad,
        capacidade: capCad,
        imei: imeiCad || null,
        preco: precoCad > 0 ? precoCad : 0,
        condicao: 'seminovo',
        status: 'disponivel',
        ativo: true,
        dataCadastro: new Date().toISOString(),
        observacoes: `Cadastrado via WhatsApp IA (${pushName})`,
      };

      const { data: inserido, error: errCad } = await supabase.from('aparelhos').insert(novoAparelho).select().single();

      if (errCad) {
        console.error('❌ Erro ao cadastrar aparelho via WhatsApp:', errCad);
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Erro ao cadastrar aparelho: ${errCad.message}`);
        return NextResponse.json({ status: 'error' }, { status: 500 });
      }

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'estoque',
          acao: `Entrada via WhatsApp: ${modeloCad}`,
          detalhes: `Aparelho ${modeloCad} (${capCad}) cadastrado por ${pushName}`,
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa no log_sistema:', logErr);
      }

      const respCad = `✅ *NOVO APARELHO CADASTRADO NO ESTOQUE!*

📱 *Modelo:* ${modeloCad}
💾 *Capacidade:* ${capCad}
🔢 *IMEI:* \`${imeiCad || 'Não informado'}\`
💵 *Preço de Venda:* ${precoCad > 0 ? `R$ ${precoCad.toFixed(2).replace('.', ',')}` : 'A definir'}
📦 *Status:* 🟢 Disponível para venda

ID do Sistema: \`${inserido?.id?.slice(0, 8) || 'Criado'}\` ✨`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respCad);
      return NextResponse.json({ status: 'ok', message: 'Aparelho cadastrado com sucesso.' }, { status: 200 });
    }

    // ── 7. COMANDO: !preco [identificador] [novo_valor] ──
    if (lowerText.startsWith('!preco') || lowerText.startsWith('!preço')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Use: *!preco [IMEI ou Código] [Novo Valor]*\nExemplo: *!preco 356829104829102 2750*`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const ident = partes[1].trim();
      const novoValor = parseFloat(partes[2].replace(/[^\d.,]/g, '').replace(',', '.'));

      if (isNaN(novoValor) || novoValor <= 0) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Valor numérico inválido: "${partes[2]}".`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const qP = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

      const { data: apars } = await qP
        .or(`imei.eq.${ident},imei.ilike.%${ident}%,codigo.eq.${ident},id.eq.${ident}`)
        .limit(1);

      const apar = apars?.[0];

      if (!apar) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Aparelho não encontrado para o identificador "${ident}".`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      await supabase.from('aparelhos').update({ preco: novoValor }).eq('id', apar.id);

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'estoque',
          acao: `Preço alterado: ${apar.modelo}`,
          detalhes: `Preço de ${apar.modelo} alterado de R$ ${apar.preco} para R$ ${novoValor} via WhatsApp`,
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa no log_sistema:', logErr);
      }

      const respPreco = `✅ *PREÇO ATUALIZADO COM SUCESSO!*

📱 *Aparelho:* ${apar.modelo} (${apar.capacidade || ''})
💵 *Novo Preço de Varejo:* R$ ${novoValor.toFixed(2).replace('.', ',')}
🔢 *IMEI:* \`${apar.imei || ident}\``;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respPreco);
      return NextResponse.json({ status: 'ok', message: 'Preço atualizado via WhatsApp.' }, { status: 200 });
    }

    // ── 8. LISTA DE PREÇOS DE FORNECEDOR ──
    const isListaPrecos =
      !isGroup &&
      (textContent.includes('📲') ||
        textContent.includes('📱') ||
        (textContent.split('\n').length > 4 && /iPhone\s*\d+/i.test(textContent)));

    if (isListaPrecos) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const lines = textContent.split('\n');
      const totalProcessados = await processarListaPrecos(lines, pushName, lojaId);

      if (totalProcessados > 0) {
        const respostaLista = `🚀 *Phone Center Auto-Bot*\n\nRecebemos sua lista! Processamos *${totalProcessados} modelos* e atualizamos o estoque da loja automaticamente.\n\nObrigado! ✅`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, respostaLista);
        return NextResponse.json({ status: 'ok', message: `Lista processada: ${totalProcessados} modelos.` }, { status: 200 });
      }
    }

    // ── 9. COMANDO: !plano e !assinatura ──
    if (lowerText.startsWith('!plano') || lowerText.startsWith('!assinatura') || lowerText === 'plano' || lowerText === 'assinatura') {
      const resolvedLojaId = lojaId || (await resolverLojaId(instanceName));
      if (!resolvedLojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ Nenhuma loja encontrada vinculada a esta sessão do WhatsApp.');
        return NextResponse.json({ status: 'error', message: 'Loja não encontrada' }, { status: 200 });
      }

      const { data: loja } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', resolvedLojaId)
        .maybeSingle();

      if (!loja) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ Informações da loja não localizadas.');
        return NextResponse.json({ status: 'error', message: 'Loja não encontrada' }, { status: 200 });
      }

      // 1. Calcular dias restantes e status
      let diasRestantes = 0;
      let dataVencimentoFmt = 'Não definida';
      let isVencido = false;

      if (loja.data_vencimento) {
        const parts = String(loja.data_vencimento).split('T')[0].split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const venc = new Date(year, month, day, 23, 59, 59, 999);
          const diffTime = venc.getTime() - Date.now();
          diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          dataVencimentoFmt = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
          isVencido = diasRestantes <= 0;
        }
      }

      const valorMensalBase = Number(loja.valor_mensalidade || 99.90);
      const valorDiaria = valorMensalBase / 30;

      // 2. Se for apenas consulta (!plano ou !assinatura sem intenção explícita de pagar)
      const querPagar = lowerText.includes('pagar') || lowerText.includes('renovar') || lowerText.includes('pix');
      if (!querPagar) {
        let label1Mes = `R$ ${valorMensalBase.toFixed(2).replace('.', ',')} (30 dias)`;
        if (diasRestantes > 0 && diasRestantes < 30 && (loja.plano_status === 'ativo' || !loja.plano_status)) {
          const diasFaltantes = 30 - diasRestantes;
          const valorParcial = Math.max(1.00, Number((diasFaltantes * valorDiaria).toFixed(2)));
          label1Mes = `R$ ${valorParcial.toFixed(2).replace('.', ',')} (Proporcional: ${diasFaltantes} dias p/ completar 30 dias)`;
        }

        const v3Meses = (valorMensalBase * 3).toFixed(2).replace('.', ',');
        const v6Meses = (valorMensalBase * 6).toFixed(2).replace('.', ',');
        const v1Ano = (valorMensalBase * 12).toFixed(2).replace('.', ',');

        const statusTexto = isVencido 
          ? `🔴 *Vencido* (Vencido há ${Math.abs(diasRestantes)} dias)` 
          : `🟢 *Ativo* (Restam ${diasRestantes} dias)`;

        const msgMenuPlano = `📋 *ASSINATURA - ${loja.nome || 'SISTEMA'}*\n\n` +
          `• *Status*: ${statusTexto}\n` +
          `• *Vencimento*: ${dataVencimentoFmt}\n` +
          `• *Mensalidade Base*: R$ ${valorMensalBase.toFixed(2).replace('.', ',')}/mês\n\n` +
          `💡 *Deseja renovar ou adiantar sua assinatura?*\n` +
          `Envie um dos comandos abaixo para gerar o PIX imediato:\n\n` +
          `👉 *!plano pagar*\n` +
          `_${label1Mes}_\n\n` +
          `👉 *!plano pagar 3 meses*\n` +
          `_3 Meses (+90 dias): R$ ${v3Meses}_\n\n` +
          `👉 *!plano pagar 6 meses*\n` +
          `_6 Meses (+180 dias): R$ ${v6Meses}_\n\n` +
          `👉 *!plano pagar 1 ano*\n` +
          `_1 Ano (+365 dias): R$ ${v1Ano}_\n\n` +
          `_⚡ O PIX gerado possui validade de 5 minutos com Copia e Cola e imagem do QR Code._`;

        await enviarMensagemWhatsApp(instanceName, targetDestination, msgMenuPlano);
        return NextResponse.json({ status: 'ok', message: 'Menu de planos enviado.' }, { status: 200 });
      }

      // 3. Se solicitou pagamento (!plano pagar ...)
      let diasAdicionar = 30;
      let valorFinal = valorMensalBase;
      let labelPeriodo = '1 Mês';

      if (lowerText.includes('1 ano') || lowerText.includes('12 meses') || lowerText.includes('ano') || lowerText.includes('anual')) {
        diasAdicionar = 365;
        valorFinal = Number((valorMensalBase * 12).toFixed(2));
        labelPeriodo = '1 Ano (+365 dias)';
      } else if (lowerText.includes('6 meses') || lowerText.includes('semestral')) {
        diasAdicionar = 180;
        valorFinal = Number((valorMensalBase * 6).toFixed(2));
        labelPeriodo = '6 Meses (+180 dias)';
      } else if (lowerText.includes('3 meses') || lowerText.includes('trimestral')) {
        diasAdicionar = 90;
        valorFinal = Number((valorMensalBase * 3).toFixed(2));
        labelPeriodo = '3 Meses (+90 dias)';
      } else {
        // 1 Mês (aplica proporcionalidade se estiver ativo com dias restantes < 30)
        if (diasRestantes > 0 && diasRestantes < 30 && (loja.plano_status === 'ativo' || !loja.plano_status)) {
          const diasFaltantes = 30 - diasRestantes;
          valorFinal = Math.max(1.00, Number((diasFaltantes * valorDiaria).toFixed(2)));
          diasAdicionar = diasFaltantes;
          labelPeriodo = `Renovação Proporcional (${diasFaltantes} dias)`;
        } else {
          valorFinal = valorMensalBase;
          diasAdicionar = 30;
          labelPeriodo = '1 Mês (+30 dias)';
        }
      }

      // Buscar Access Token Mercado Pago da plataforma (conta central do dono da plataforma)
      const tokenMercadoPago = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

      if (!tokenMercadoPago) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ O Mercado Pago ainda não está configurado no sistema. Contate o suporte.');
        return NextResponse.json({ status: 'error', message: 'Token Mercado Pago não configurado' }, { status: 200 });
      }

      // Gerar PIX no Mercado Pago com expiração em 5 minutos
      const payerEmail = (loja.email && loja.email.includes('@')) ? loja.email.trim() : 'financeiro@painelcelular.com.br';
      const payerName = (loja.nome || pushName || 'Cliente').trim().slice(0, 30);
      const expiraEm5Min = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      try {
        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${loja.id}-${Date.now()}`,
          },
          body: JSON.stringify({
            transaction_amount: Number(valorFinal.toFixed(2)),
            description: `Assinatura ${labelPeriodo} - ${(loja.nome || 'Loja').slice(0, 30)}`,
            payment_method_id: 'pix',
            date_of_expiration: expiraEm5Min,
            payer: {
              email: payerEmail,
              first_name: payerName,
            },
            external_reference: loja.id,
          }),
        });

        const mpData = await mpResponse.json().catch(() => ({}));

        if (!mpResponse.ok || !mpData.point_of_interaction?.transaction_data) {
          const erroMp = mpData.message || mpData.cause?.[0]?.description || 'Erro ao comunicar com Mercado Pago';
          await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Falha ao gerar PIX no Mercado Pago: ${erroMp}`);
          return NextResponse.json({ status: 'error', message: erroMp }, { status: 200 });
        }

        const txData = mpData.point_of_interaction.transaction_data;
        const paymentId = String(mpData.id);
        const qrCode = txData.qr_code;
        const qrCodeBase64 = txData.qr_code_base64;

        // Registrar no histórico de pagamentos com rastreamento completo
        await supabase.from('historico_pagamentos_planos').insert({
          loja_id: loja.id,
          valor: valorFinal,
          status: 'pendente',
          mp_payment_id: paymentId,
          qr_code: qrCode,
          qr_code_base64: qrCodeBase64,
          observacao: `PIX WhatsApp | Periodo: ${labelPeriodo} | Dias: ${diasAdicionar} | Destino: ${targetDestination} | Instancia: ${instanceName}`,
        });

        // 1. Enviar mensagem de texto com instruções e Copia e Cola
        const msgTextoPix = `💳 *PIX DE ASSINATURA GERADO!* 💳\n\n` +
          `📌 *Plano*: ${labelPeriodo}\n` +
          `💰 *Valor*: R$ ${valorFinal.toFixed(2).replace('.', ',')}\n` +
          `⏳ *Validade*: 5 minutos\n\n` +
          `👇 *PIX Copia e Cola (toque para copiar):*`;

        await enviarMensagemWhatsApp(instanceName, targetDestination, msgTextoPix);
        await enviarMensagemWhatsApp(instanceName, targetDestination, qrCode);

        // 2. Enviar QR Code visual em imagem
        const qrMedia = qrCodeBase64
          ? `data:image/png;base64,${qrCodeBase64}`
          : `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrCode)}`;

        await enviarImagemWhatsApp(
          instanceName,
          targetDestination,
          qrMedia,
          `📱 *QR Code PIX*\nEscaneie no app do seu banco para pagar R$ ${valorFinal.toFixed(2).replace('.', ',')}.\nValidade: 5 minutos.`
        );

        // 3. Monitoramento em background do ciclo de vida de 5 minutos
        after(async () => {
          await monitorarCicloVidaPix({
            paymentId,
            lojaId: loja.id,
            diasAdicionar,
            valorFinal,
            instanceName,
            targetDestination,
            tokenMercadoPago,
          });
        });

        return NextResponse.json({ status: 'ok', message: 'PIX gerado e enviado com sucesso.' }, { status: 200 });
      } catch (mpErr: any) {
        console.error('Erro na requisição ao Mercado Pago:', mpErr);
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Falha ao conectar ao Mercado Pago: ${mpErr?.message || 'Erro de rede'}`);
        return NextResponse.json({ status: 'error', message: mpErr?.message }, { status: 200 });
      }
    }

    // ── 10. COMANDO: !estoque e !estoque completo ──
    if (lowerText.startsWith('!estoque') || lowerText === 'estoque' || lowerText === 'cardapio' || lowerText === 'tabela') {
      const resolvedLojaId = lojaId || (await resolverLojaId(instanceName));
      if (!resolvedLojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }
      const isCompleto = lowerText.includes('completo') || lowerText.includes('atacado') || lowerText.includes('detalhe');

      const { data: loja } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', resolvedLojaId)
        .maybeSingle();

      const isLucas = await verificarSeLojaLucasImports(resolvedLojaId, instanceName);

      // Em grupos: se NÃO for a Lucas Imports, apenas o próprio cliente/dono da loja pode disparar o comando !estoque
      if (isGroup && !isLucas) {
        const lojaTelefone = (loja?.telefone || '').replace(/\D/g, '');

        const isDono = lojaTelefone && participantPhone && (lojaTelefone.endsWith(participantPhone.slice(-8)) || participantPhone.endsWith(lojaTelefone.slice(-8)));

        if (!isDono && lojaTelefone && lojaTelefone !== 'Não informado') {
          console.log(`[Segurança Multi-Tenant] Comando !estoque em grupo ignorado: ${participantPhone} não é o dono da loja ${loja?.nome}.`);
          return NextResponse.json({ status: 'ok', message: 'Comando em grupo restrito ao dono da loja.' }, { status: 200 });
        }
      }

      // Consulta estritamente os aparelhos DESTA LOJA (zero fallbacks para outras lojas!)
      const { data: aparelhos } = await supabase
        .from('aparelhos')
        .select('id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, imei, codigo, status, condicao')
        .eq('loja_id', resolvedLojaId)
        .eq('ativo', true)
        .neq('status', 'vendido')
        .neq('condicao', 'vendido');

      if (!aparelhos || aparelhos.length === 0) {
        const nomeLoja = (loja?.nome || 'PHONE CENTER').trim();
        await enviarMensagemWhatsApp(instanceName, targetDestination, `📋 *ESTOQUE - ${nomeLoja}*\n\nNenhum aparelho disponível em estoque no momento.`);
        return NextResponse.json({ status: 'ok', message: 'Estoque vazio.' }, { status: 200 });
      }

      // Ordena por modelo normalizado
      aparelhos.sort((a, b) => normalizarModelo(a.modelo).localeCompare(normalizarModelo(b.modelo)));

      let ultimoModelo = '';
      const linhasEstoque: string[] = [];

      aparelhos.forEach((a) => {
        const modNorm = normalizarModelo(a.modelo);
        if (ultimoModelo && ultimoModelo !== modNorm) {
          linhasEstoque.push('');
        }
        ultimoModelo = modNorm;

        const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
        const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
        const batVal = a.saude_bateria || (a as any).saudeBateria;
        const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
        const bat = batNum ? `(${batNum}%)` : '';
        const modCap = [modNorm, cap].filter(Boolean).join(' ');
        const extras = [nomeCor, bat].filter(Boolean).join(' ');

        if (isCompleto) {
          const cod = a.codigo || (a.imei ? `...${String(a.imei).slice(-4)}` : `#${String(a.id).slice(0, 4)}`);
          const precoAtacadoVal = a.preco_atacado || (a as any).precoAtacado || a.preco;
          const atacadoFmt = precoAtacadoVal ? `R$ ${Number(precoAtacadoVal).toFixed(2).replace('.', ',')}` : 'Consulte';
          linhasEstoque.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} | Cód: ${cod} | Atacado: ${atacadoFmt}`.replace(/\s+/g, ' ').trim());
        } else {
          linhasEstoque.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''}`.replace(/\s+/g, ' ').trim());
        }
      });

      const nomeExibicao = (loja?.nome || 'PHONE CENTER').trim().toUpperCase();
      const cabecalho = isCompleto
        ? `📋 *ESTOQUE COMPLETO (ATACADO) - ${nomeExibicao}*\nTotal: *${aparelhos.length} aparelhos* em estoque\n\n`
        : `📋 *ESTOQUE DISPONÍVEL - ${nomeExibicao}*\nTotal: *${aparelhos.length} aparelhos* em estoque\n\n`;

      const rodape = isCompleto
        ? `\n\n💡 _Para vender um aparelho envie:_ *!vender [CÓDIGO/IMEI] [VALOR]*`
        : `\n\n💡 _Para ver códigos e preços de atacado envie:_ *!estoque completo*`;

      const mensagemEstoque = cabecalho + linhasEstoque.join('\n') + rodape;
      await enviarMensagemWhatsApp(instanceName, targetDestination, mensagemEstoque);
      return NextResponse.json({ status: 'ok', message: `Estoque enviado (${aparelhos.length} itens).` }, { status: 200 });
    }

    // ── 11. COMANDOS BÁSICOS (!ajuda, !menu) ──
    if (lowerText.startsWith('!ajuda') || lowerText.startsWith('!menu')) {
      const menuAjuda = `📱 *PHONE CENTER BOT - INTELIGÊNCIA ARTIFICIAL*

📸 *Reconhecimento Visual de Etiquetas (OCR):*
• Envie uma foto da etiqueta/caixa do aparelho! Eu reconheço modelo, capacidade, IMEI, bateria e verifico o estoque na hora.

💳 *Assinatura do Sistema:*
• *!plano* - Consulta status da assinatura, vencimento e opções de renovação
• *!plano pagar* - Gera o PIX da mensalidade (1 mês proporcional)
• *!plano pagar [3 meses | 6 meses | 1 ano]* - Gera o PIX para períodos estendidos

⚡ *Comandos Operacionais de Estoque:*
• *!estoque* - Consulta todos os aparelhos disponíveis (Modelo, Cor, Bateria)
• *!estoque completo* - Exibe aparelhos com códigos e preços de atacado
• *!vender [IMEI/Cód] [Valor] [Nome]* - Registra venda e baixa do estoque
• *!cadastrar [Modelo] [Capacidade] [IMEI] [Preço]* - Entrada em novo aparelho
• *!preco [IMEI/Cód] [Novo Valor]* - Atualiza preço no sistema

💬 *Atendimento Inteligente:*
• Pergunte qualquer coisa em grupos ou privado (ex: *"tem 15pm?"*, *"tem iphone 11?"*) e eu respondo na hora!`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, menuAjuda);
      return NextResponse.json({ status: 'ok', message: 'Menu de ajuda enviado.' }, { status: 200 });
    }

    // ── 12. CONSULTA NATURAL DE ESTOQUE (EXCLUSIVO LUCAS IMPORTS) ──
    const respostaNatural = await responderConsultaEstoqueNatural(
      textContent,
      pushName,
      lojaId,
      instanceName,
      isGroup,
      participantPhone || senderPhone,
      remoteJid
    );
    if (respostaNatural) {
      await enviarMensagemWhatsApp(instanceName, targetDestination, respostaNatural);
      return NextResponse.json({ status: 'ok', message: 'Consulta de estoque respondida naturalmente.' }, { status: 200 });
    }

    // ── 13. COMANDOS ESTRUTURADOS GEMINI PLAN ──
    const geminiPlan = parseGeminiPlan(textContent);
    if (geminiPlan) {
      const textResposta = buildWhatsAppText(geminiPlan.action, geminiPlan.params, senderPhone);
      await enviarMensagemWhatsApp(instanceName, targetDestination, textResposta);
      return NextResponse.json({ status: 'ok', message: 'Comando IA executado.' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ok', message: 'Webhook processado com sucesso.' }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Erro crítico no Webhook Evolution API:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}