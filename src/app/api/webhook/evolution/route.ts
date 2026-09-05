import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildWhatsAppText, parseGeminiPlan } from './commandExecutor';
import { processImageVision, VisionEtiquetaResult } from '../../../../lib/image-vision-ocr';

// Instancia cliente do Supabase com Service Role Key para bypass de RLS no backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações do Evolution API
const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449';
const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'lucasimports';

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

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return loja?.id || null;
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
    let qImei = supabase.from('aparelhos').select('*');
    if (lojaId) qImei = qImei.eq('loja_id', lojaId);

    const { data: porImei } = await qImei.or(`imei.eq.${imei},imei.ilike.%${imei}%`).limit(1);
    if (porImei && porImei.length > 0) {
      aparelhoEncontrado = porImei[0];
    }
  }

  // Busca 2: Por Código da Etiqueta / Código Único
  if (!aparelhoEncontrado && codigoEtiqueta) {
    let qCod = supabase.from('aparelhos').select('*');
    if (lojaId) qCod = qCod.eq('loja_id', lojaId);

    const { data: porCod } = await qCod.or(`codigo.eq.${codigoEtiqueta},codigoUnico.eq.${codigoEtiqueta},id.eq.${codigoEtiqueta}`).limit(1);
    if (porCod && porCod.length > 0) {
      aparelhoEncontrado = porCod[0];
    }
  }

  // Busca 3: Por Modelo + Capacidade (se houver correspondência única em estoque)
  if (!aparelhoEncontrado && modeloLido) {
    let qMod = supabase.from('aparelhos').select('*').ilike('modelo', `%${modeloLido}%`);
    if (lojaId) qMod = qMod.eq('loja_id', lojaId);
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
      let qVenda = supabase.from('vendas').select('*');
      if (lojaId) qVenda = qVenda.eq('loja_id', lojaId);

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

// ── AUXILIAR: Resposta Natural de Estoque / iPhone para Grupos e Privado ──
async function responderConsultaEstoqueNatural(
  texto: string,
  pushName: string,
  lojaId: string | null
): Promise<string | null> {
  const textoLimpo = texto.toLowerCase().trim();

  const termosPergunta = [
    'tem', 'alguem tem', 'alguém tem', 'vcs tem', 'voces tem', 'vocês tem', 'ta tendo', 'tá tendo',
    'disponivel', 'disponível', 'estoque', 'qual valor', 'quanto ta', 'quanto tá', 'quanto custa',
    'preco', 'preço', 'procurando', 'procuro', 'preciso de', 'tem ai', 'tem aí', 'vende'
  ];

  const mencaoIphone = /iphone|\bip\s*\d|\b1[1-7]\s*(?:pro|promax|pro max|mini|plus)?\b|\bxr\b|\bxs\b|\bse\b/i.test(textoLimpo);
  const temPergunta = termosPergunta.some((termo) => textoLimpo.includes(termo));

  if (!mencaoIphone && !temPergunta) {
    return null;
  }

  const modeloMatch = textoLimpo.match(/(?:iphone\s*)?(1[1-7]|[78x]|xr|xs|se)(?:\s*(pro\s*max|promax|pro|mini|plus))?/i);
  let modeloAlvo = '';
  let termoNumero = '';
  if (modeloMatch) {
    termoNumero = modeloMatch[1].toUpperCase();
    const suf = modeloMatch[2] ? modeloMatch[2].toUpperCase().replace(/\s+/g, ' ') : '';
    modeloAlvo = `iPhone ${termoNumero}${suf ? ' ' + suf : ''}`.trim();
  }

  let query = supabase
    .from('aparelhos')
    .select('*')
    .eq('ativo', true)
    .neq('condicao', 'vendido')
    .neq('status', 'vendido');

  if (lojaId) {
    query = query.eq('loja_id', lojaId);
  }

  let { data: aparelhos, error } = await query;
  if ((error || !aparelhos || aparelhos.length === 0) && lojaId) {
    const { data: fallbackAparelhos } = await supabase
      .from('aparelhos')
      .select('*')
      .eq('ativo', true)
      .neq('condicao', 'vendido')
      .neq('status', 'vendido');
    if (fallbackAparelhos && fallbackAparelhos.length > 0) {
      aparelhos = fallbackAparelhos;
    }
  }

  if (!aparelhos || aparelhos.length === 0) {
    return null;
  }

  let aparelhosEncontrados: any[] = [];
  if (termoNumero) {
    aparelhosEncontrados = aparelhos.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      const matchNum = new RegExp(`\\b${termoNumero.toLowerCase()}\\b`).test(mod) || mod.includes(termoNumero.toLowerCase());
      if (modeloAlvo.includes('PRO MAX') || modeloAlvo.includes('PROMAX')) {
        return matchNum && (mod.includes('pro max') || mod.includes('promax'));
      }
      if (modeloAlvo.includes('PRO')) {
        return matchNum && mod.includes('pro') && !mod.includes('max');
      }
      if (modeloAlvo.includes('MINI')) {
        return matchNum && mod.includes('mini');
      }
      if (modeloAlvo.includes('PLUS')) {
        return matchNum && mod.includes('plus');
      }
      return matchNum;
    });
  } else if (mencaoIphone) {
    aparelhosEncontrados = aparelhos.filter((a) => String(a.modelo || '').toLowerCase().includes('iphone'));
  }

  if (aparelhosEncontrados.length > 0) {
    const itensTexto = aparelhosEncontrados.slice(0, 10).map((a) => {
      const precoValor = a.precoAtacado || a.preco_atacado || a.preco;
      const precoFinal = precoValor ? ` - R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';
      const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
      const cor = a.cor && a.cor !== 'N/A' ? `${a.cor}` : '';
      const batVal = a.saude_bateria || a.saudeBateria;
      const bat = batVal ? `(🔋 ${String(batVal).replace(/\D/g, '')}%)` : '';
      const extras = [cap, cor].filter(Boolean).join(' ');
      return `📱 ${a.modelo} ${extras}${precoFinal} ${bat}`.replace(/\s+/g, ' ').trim();
    }).join('\n');

    return `Tem aqui esses modelos:\n\n${itensTexto}`;
  }

  if (modeloAlvo) {
    const outrasOpcoes = aparelhos.slice(0, 5).map((a) => {
      const precoValor = a.precoAtacado || a.preco_atacado || a.preco;
      const precoFinal = precoValor ? ` - R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';
      const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
      const cor = a.cor && a.cor !== 'N/A' ? `${a.cor}` : '';
      const extras = [cap, cor].filter(Boolean).join(' ');
      return `• ${a.modelo} ${extras}${precoFinal}`.replace(/\s+/g, ' ').trim();
    }).join('\n');

    return `No momento o *${modeloAlvo}* esgotou. Temos esses modelos disponíveis:\n\n${outrasOpcoes}`;
  }

  return null;
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

      let qApar = supabase.from('aparelhos').select('*');
      if (lojaId) qApar = qApar.eq('loja_id', lojaId);

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
        loja_id: lojaId || null,
        lojaId: lojaId || null,
        clienteNome: compradorNome,
        vendedor: `WhatsApp (${pushName})`,
        tipoEntrega: 'Varejo',
        valor: valorNum,
        custo: custoNum,
        lucro: lucroNum,
        percentualLucro: parseFloat(margemPercent),
        status: 'pago',
        metodo: 'pix',
        dataPagamento: new Date().toISOString(),
        descricao: `Venda via WhatsApp OCR - ${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || ''} ${aparelho.cor || ''})`,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelho.id,
            descricao: `${aparelho.marca} ${aparelho.modelo} - ${aparelho.capacidade || ''} (IMEI: ${aparelho.imei || termoBusca})`,
            quantidade: 1,
            valorInterno: custoNum,
            valorExibir: valorNum,
            desconto: 0,
            total: valorNum,
          },
        ],
      });

      // 3. Log de auditoria
      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId || null,
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
        loja_id: lojaId || null,
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
          loja_id: lojaId || null,
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

      let qP = supabase.from('aparelhos').select('*');
      if (lojaId) qP = qP.eq('loja_id', lojaId);

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
          loja_id: lojaId || null,
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

    if (isListaPrecos && lojaId) {
      const lines = textContent.split('\n');
      const totalProcessados = await processarListaPrecos(lines, pushName, lojaId);

      if (totalProcessados > 0) {
        const respostaLista = `🚀 *Phone Center Auto-Bot*\n\nRecebemos sua lista! Processamos *${totalProcessados} modelos* e atualizamos o estoque da loja automaticamente.\n\nObrigado! ✅`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, respostaLista);
        return NextResponse.json({ status: 'ok', message: `Lista processada: ${totalProcessados} modelos.` }, { status: 200 });
      }
    }

    // ── 9. CONSULTA NATURAL DE ESTOQUE (GRUPOS E PRIVADO) ──
    const respostaNatural = await responderConsultaEstoqueNatural(textContent, pushName, lojaId);
    if (respostaNatural) {
      await enviarMensagemWhatsApp(instanceName, targetDestination, respostaNatural);
      return NextResponse.json({ status: 'ok', message: 'Consulta de estoque respondida naturalmente.' }, { status: 200 });
    }

    // ── 10. COMANDOS BÁSICOS (!estoque, !ajuda, !menu) ──
    if (lowerText.startsWith('!estoque') || lowerText === 'estoque' || lowerText === 'cardapio' || lowerText === 'tabela') {
      if (lojaId) {
        const { data: aparelhos } = await supabase
          .from('aparelhos')
          .select('marca, modelo, capacidade, cor, preco, condicao')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .neq('status', 'vendido')
          .neq('condicao', 'vendido')
          .limit(10);

        if (aparelhos && aparelhos.length > 0) {
          let respostaEstoque = `📱 *ESTOQUE DISPONÍVEL - PHONE CENTER*\n\n`;
          aparelhos.forEach((a) => {
            const precoFmt = a.preco ? `R$ ${Number(a.preco).toFixed(2).replace('.', ',')}` : 'Consulte';
            respostaEstoque += `• *${a.marca} ${a.modelo}* (${a.capacidade || 'N/A'}) - ${a.cor || 'Padrão'} - ${precoFmt}\n`;
          });
          respostaEstoque += `\nPara mais detalhes ou compras, fale com nossa equipe! 💬`;
          await enviarMensagemWhatsApp(instanceName, targetDestination, respostaEstoque);
          return NextResponse.json({ status: 'ok', message: 'Consulta de estoque respondida.' }, { status: 200 });
        }
      }
    }

    if (lowerText.startsWith('!ajuda') || lowerText.startsWith('!menu')) {
      const menuAjuda = `📱 *PHONE CENTER BOT - INTELIGÊNCIA ARTIFICIAL*

📸 *Reconhecimento Visual de Etiquetas (OCR):*
• Envie uma foto da etiqueta/caixa do aparelho! Eu reconheço o modelo, capacidade, IMEI, bateria e verifico o estoque na hora.

⚡ *Comandos Operacionais Rápidos:*
• *!estoque* - Consulta aparelhos disponíveis
• *!vender [IMEI/ID] [Valor] [Nome]* - Registra venda e baixa do estoque
• *!cadastrar [Modelo] [Capacidade] [IMEI] [Preço]* - Dá entrada em novo aparelho
• *!preco [IMEI/ID] [Novo Valor]* - Atualiza preço no sistema

💬 *Atendimento Inteligente:*
• Pergunte qualquer coisa sobre aparelhos (ex: *"tem iphone 13?"*) e eu respondo na hora!`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, menuAjuda);
      return NextResponse.json({ status: 'ok', message: 'Menu de ajuda enviado.' }, { status: 200 });
    }

    // ── 11. COMANDOS ESTRUTURADOS GEMINI PLAN ──
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