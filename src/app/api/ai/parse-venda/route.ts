import { NextRequest, NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { processImageVision } from '@/lib/image-vision-ocr';
import {
  MAX_FOTOS_VENDA,
  PROMPT_FOTO_VENDA,
  camposFaltantesDaVenda,
  mesclarFotosNaVenda,
  normalizarLeituraFoto,
  type LeituraFotoVenda,
  type ResultadoFotosVenda,
} from '@/lib/vendas/fotoVenda';

// Texto e até 3 fotos passam por IA; com fallback de modelos a resposta pode demorar.
export const maxDuration = 60;

/** ~6 MB por foto em base64. O painel reduz antes de enviar; isto só barra abuso. */
const LIMITE_CARACTERES_FOTO = 8_000_000;

async function lerFoto(dataUrl: string): Promise<LeituraFotoVenda | null> {
  try {
    const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    const bruto = await processImageVision(dataUrl, mime, PROMPT_FOTO_VENDA);
    return bruto ? normalizarLeituraFoto(bruto) : null;
  } catch (erro) {
    console.warn('Falha ao ler foto da venda:', erro);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const acesso = await exigirAcesso(request);
  if (!acesso.ok) return acesso.resposta;

  try {
    const { texto, imagens } = await request.json();

    const trimmedText = typeof texto === 'string' ? texto.trim() : '';
    const fotos: string[] = Array.isArray(imagens)
      ? imagens.filter((imagem: unknown): imagem is string => typeof imagem === 'string' && imagem.length > 0)
      : [];

    if (!trimmedText && fotos.length === 0) {
      return NextResponse.json(
        { error: 'Cole o texto da venda ou envie uma foto do aparelho.' },
        { status: 400 }
      );
    }
    if (fotos.length > MAX_FOTOS_VENDA) {
      return NextResponse.json({ error: `Envie até ${MAX_FOTOS_VENDA} fotos por venda.` }, { status: 400 });
    }
    if (fotos.some((foto) => foto.length > LIMITE_CARACTERES_FOTO)) {
      return NextResponse.json({ error: 'Foto grande demais. Tire outra ou envie um print.' }, { status: 413 });
    }

    // As fotos são lidas enquanto a IA lê o texto.
    const leiturasFotos = Promise.all(fotos.map(lerFoto));

    const apiKey = process.env.GROQ_API_KEY;
    let parsedJson: any = null;

    // 1. TENTA PROCESSAR VIA IA GROQ SE A CHAVE ESTIVER CONFIGURADA
    if (apiKey && trimmedText) {
      const systemPrompt = `Você é um assistente especialista em extrair dados de formulários e vendas de celulares/eletrônicos para um sistema ERP.
Sua missão é analisar o texto digitado pelo usuário e retornar ESTRITAMENTE um objeto JSON válido (sem qualquer markdown, sem texto extra, sem \`\`\`json).

Estrutura JSON obrigatória:
{
  "cliente": {
    "nome": string ou null (ex: Nome completo do cliente),
    "cpf": string ou null (ex: 01358726698),
    "dataNascimento": string ou null (ex: 04/04/1982 ou 1982-04-04),
    "telefone": string ou null (ex: 31994848695),
    "email": string ou null (ex: thiagoamorimc10@yahoo.com.br - PROCURE POR E-mail OU email NO TEXTO!)
  },
  "aparelho": {
    "codigo": string ou null (opcional: Código/ID do aparelho se informado ex: COD: 8665041, COD 8665041, ID: 8665041 ou #8665041),
    "marca": string ou null (ex: Apple, Samsung, Xiaomi, Motorola),
    "modelo": string ou null (ex: iPhone 13 Pro, Galaxy S23, Redmi Note 12 - APARELHO QUE O CLIENTE ESTÁ COMPRANDO/LEVANDO),
    "capacidade": string ou null (ex: 128GB, 256GB, 512GB, 64GB),
    "cor": string ou null (ex: Grafite, Preto, Azul, Dourado, Branco),
    "condicao": string ou null (deve ser "novo" se for lacrado/novo ou "seminovo" se usado/seminovo),
    "imei": string ou null (opcional: IMEI/Nº de Série do aparelho VENDIDO se informado),
    "preco": number ou null (valor unitário do aparelho vendido em R$),
    "custo": number ou null (valor de custo em R$ se informado)
  },
  "isUpgrade": boolean (true SE o cliente deu um aparelho usado/antigo como base de troca/entrada para abater o valor, senão false),
  "tradeIn": {
    "marca": string ou null (ex: Apple, Samsung),
    "modelo": string ou null (ex: iPhone 11, iPhone 12 Pro - APARELHO QUE O CLIENTE ENTREGOU NA TROCA),
    "capacidade": string ou null (ex: 64GB, 128GB),
    "cor": string ou null (ex: Preto, Branco),
    "imei": string ou null (IMEI do aparelho entregue na troca se informado),
    "bateria": number ou null (saúde da bateria em % se informada, ex: 85),
    "valor": number (valor de avaliação/entrada que o aparelho do cliente abateu em R$, ex: 1500),
    "condicao": "seminovo",
    "observacoes": string ou null
  } ou null,
  "vendedor": string ou null (nome do funcionário/vendedor),
  "formaPagamento": string ou null (forma de pagamento da VOLTA/RESTANTE pago pelo cliente: "pix", "dinheiro", "cartao_credito", "cartao_debito", "parcelado"),
  "valorTotal": number ou null (valor total do aparelho que está sendo vendido em R$, antes do abatimento da troca),
  "valorEntradaTroca": number ou null (valor abatido pelo aparelho entregue na troca em R$, ou null se não houver troca),
  "valorVolta": number ou null (valor líquido da volta/restante pago pelo cliente em R$, calculado como valorTotal - valorEntradaTroca),
  "dataVenda": string ou null (formato YYYY-MM-DD da data em que a VENDA foi efetuada),
  "observacoes": string ou null,
  "camposFaltantes": string[] (array contendo as chaves dos campos essenciais que NÃO foram informados no texto ou estão em branco)
}

REGRAS CRÍTICAS DE CONTEXTO PARA UPGRADE / TROCA (TRADE-IN):
1. DIFERENCIAÇÃO ENTRE APARELHO VENDIDO E APARELHO DE ENTRADA:
   - "aparelho": É o aparelho que a loja está VENDENDO para o cliente (ex: "Comprou iPhone 14 Pro", "Levou iPhone 15 128GB", "Venda: iPhone 13").
   - "tradeIn": É o aparelho USADO que o cliente DEU DE ENTRADA / TROCA para abater o preço (ex: "Pegou iPhone 11 na troca por 1500", "Deu iPhone XR de entrada", "Troca: iPhone 12 64GB por R$ 1800").
2. MATEMÁTICA DA VOLTA / RESTANTE:
   - Se o aparelho vendido custa R$ 4.500 e o cliente deu um aparelho de entrada avaliado em R$ 1.500:
     - "valorTotal": 4500
     - "valorEntradaTroca": 1500
     - "valorVolta": 3000 (a volta/diferença a ser paga)
     - "isUpgrade": true
   - Se o texto disser apenas a volta e o valor da troca (ex: "Troca entrou iPhone 11 por 1200 e volta de 2000 no pix pelo iPhone 13"):
     - "valorTotal": 3200 (1200 + 2000)
     - "valorEntradaTroca": 1200
     - "valorVolta": 2000
     - "isUpgrade": true
3. PROIBIÇÃO ABSOLUTA DE INVENTAR UPGRADE:
   - Se o texto for uma venda normal simples sem troca de aparelho (ex: "Venda iPhone 13 128GB por 3000 no pix"), DEIXE "isUpgrade": false, "tradeIn": null, "valorEntradaTroca": null, "valorVolta": 3000. NUNCA invente aparelho de troca quando não foi informado.

REGRAS CRÍTICAS DE DIFERENCIAÇÃO ENTRE DATA DE NASCIMENTO E DATA DA VENDA:
1. "cliente.dataNascimento": Data em que o cliente nasceu (ex: "Data de nascimento: 04/04/1982", "Nasc: 15/05/1990", "aniversário", ou qualquer data com ano anterior a 2020).
2. "dataVenda": Data em que a venda/negociação do aparelho ocorreu (transação na loja, geralmente ano corrente como 2024, 2025, 2026).
3. PROIBIÇÃO ABSOLUTA: NUNCA coloque a data de nascimento do cliente em "dataVenda"! Se o cliente forneceu a data de nascimento e NÃO há outra data de venda explícita no texto, deixe "dataVenda": null. NUNCA misture essas duas informações.

Regras para os camposFaltantes:
- Um celular exige obrigatoriamente: "modelo", "capacidade", "valorTotal", "formaPagamento" e "dataVenda" (O IMEI, CPF e Data de Nascimento são OPCIONAIS, NÃO coloque imei, cpf ou dataNascimento em camposFaltantes).
- Se a dataVenda não puder ser identificada com clareza no texto (lembrando que a data de nascimento NÃO é data de venda), adicione a chave correspondente ao array "camposFaltantes". Exemplo: ["dataVenda"].
- Se todos estiverem preenchidos no texto, "camposFaltantes" deve ser um array vazio [].
- Retorne APENAS o JSON puro.`;

      const candidateModels = [
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'groq/compound',
        'groq/compound-mini',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768'
      ];

      for (const model of candidateModels) {
        try {
          let groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: trimmedText }
              ],
              temperature: 0.1,
              response_format: { type: 'json_object' }
            }),
          });

          if (!groqResponse.ok && groqResponse.status === 400) {
            groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: trimmedText }
                ],
                temperature: 0.1
              }),
            });
          }

          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            const content = groqData.choices?.[0]?.message?.content;
            if (content) {
              const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
              parsedJson = JSON.parse(cleaned);
              break;
            }
          } else {
            console.warn(`Groq API modelo ${model} retornou status ${groqResponse.status}`);
          }
        } catch (mErr) {
          console.warn(`Erro ao chamar modelo ${model} do Groq:`, mErr);
        }
      }
    }

    // 2. PARSER NATIVO LOCAL DE FALLBACK SE A IA FALHAR OU NÃO TIVER CHAVE
    if (!parsedJson) {
      if (trimmedText) console.log('Executando parser nativo local de fallback...');
      parsedJson = {
        cliente: {},
        aparelho: {},
        isUpgrade: false,
        tradeIn: null,
        vendedor: null,
        formaPagamento: null,
        valorTotal: null,
        valorEntradaTroca: null,
        valorVolta: null,
        dataVenda: null,
        observacoes: null,
        camposFaltantes: []
      };
    }

    if (!parsedJson.cliente) parsedJson.cliente = {};
    if (!parsedJson.aparelho) parsedJson.aparelho = {};

    // 3. FOTOS: completam o aparelho antes dos palpites de regex, que só olham o texto.
    let fotosResultado: ResultadoFotosVenda | null = null;
    if (fotos.length) {
      fotosResultado = mesclarFotosNaVenda(parsedJson, await leiturasFotos);
    }

    // --- FALLBACKS ROBUSTOS DE REGEX LOCAL ---
    // 1. E-mail Regex
    if (!parsedJson.cliente.email || parsedJson.cliente.email === 'sem@email.com') {
      const emailMatch = trimmedText.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
      if (emailMatch) {
        parsedJson.cliente.email = emailMatch[0].trim();
      }
    }

    // 2. Nome Cliente Regex
    if (!parsedJson.cliente.nome) {
      const nameMatch = trimmedText.match(/(?:Nome|Nome completo|Cliente):\s*([^\n\r•]+)/i);
      if (nameMatch) {
        parsedJson.cliente.nome = nameMatch[1].trim();
      }
    }

    // 3. CPF Regex
    if (!parsedJson.cliente.cpf) {
      const cpfMatch = trimmedText.match(/(?:CPF):\s*([0-9.-]+)/i);
      if (cpfMatch) {
        parsedJson.cliente.cpf = cpfMatch[1].trim();
      }
    }

    // 4. Data de Nascimento Regex
    if (!parsedJson.cliente.dataNascimento && !parsedJson.cliente.data_nascimento) {
      const nascMatch = trimmedText.match(/(?:Data de nascimento|Nascimento|Dt Nasc):\s*([0-9/.-]+)/i);
      if (nascMatch) {
        parsedJson.cliente.dataNascimento = nascMatch[1].trim();
      }
    }

    // 5. Telefone Regex
    if (!parsedJson.cliente.telefone) {
      const telMatch = trimmedText.match(/(?:Telefone|WhatsApp|Tel|Celular):\s*([0-9\s()-]+)/i);
      if (telMatch) {
        parsedJson.cliente.telefone = telMatch[1].trim();
      }
    }

    // 6. Detecção de Upgrade / Troca (Trade-In) via Regex
    const ehTextoUpgrade = /trade[- ]?in|upgrade|base de troca|na troca|deu na troca|pegou na troca|aparelho de entrada|entrada de um/i.test(trimmedText);
    if (ehTextoUpgrade && (!parsedJson.tradeIn || !parsedJson.isUpgrade)) {
      const trocaMatch = trimmedText.match(/(?:Trade[- ]?in|Upgrade|Troca|Aparelho na troca|Aparelho de entrada|Entrada de troca|Entrada):\s*([^\n\r]+)/i);
      let modeloTroca = '';
      let valorTroca = 0;
      let capTroca = '';

      if (trocaMatch) {
        const linhaTroca = trocaMatch[1];
        const valMatch = linhaTroca.match(/R?\$?\s*([0-9.,]+)/i);
        if (valMatch) {
          valorTroca = parseFloat(valMatch[1].replace(/\./g, '').replace(',', '.'));
        }
        const modTrocaMatch = linhaTroca.match(/(?:iPhone|Galaxy|Redmi|Poco|Xiaomi|Motorola)\s+[A-Za-z0-9\s]+/i);
        if (modTrocaMatch) {
          modeloTroca = modTrocaMatch[0].trim();
        }
        const capTrocaMatch = linhaTroca.match(/\b(\d+GB|\d+TB)\b/i);
        if (capTrocaMatch) {
          capTroca = capTrocaMatch[1].toUpperCase();
        }
      }

      if (modeloTroca || valorTroca > 0) {
        parsedJson.isUpgrade = true;
        parsedJson.tradeIn = {
          marca: /iphone|apple/i.test(modeloTroca) ? 'Apple' : 'Outro',
          modelo: modeloTroca || 'Aparelho na Troca',
          capacidade: capTroca || '128GB',
          cor: '',
          imei: null,
          bateria: null,
          valor: valorTroca || 0,
          condicao: 'seminovo',
          observacoes: 'Recebido como troca (upgrade) no pedido'
        };
        parsedJson.valorEntradaTroca = valorTroca || 0;
      }
    }

    // Detecção de Volta / Restante via Regex
    const voltaMatch = trimmedText.match(/(?:Volta|Restante|Diferen[cç]a|Saldo a pagar):\s*R?\$?\s*([0-9.,]+)/i);
    if (voltaMatch) {
      const valVolta = parseFloat(voltaMatch[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(valVolta) && valVolta > 0) {
        parsedJson.valorVolta = valVolta;
      }
    }

    // 7. Forma de Pagamento Regex
    if (!parsedJson.formaPagamento) {
      if (/\(X\s*\)\s*Pix|Pix/i.test(trimmedText)) parsedJson.formaPagamento = 'pix';
      else if (/\(X\s*\)\s*Cartão de crédito|Cartão de crédito|Cartao de credito/i.test(trimmedText)) parsedJson.formaPagamento = 'cartao_credito';
      else if (/\(X\s*\)\s*Cartão de débito|Cartão de débito|Cartao de debito/i.test(trimmedText)) parsedJson.formaPagamento = 'cartao_debito';
      else if (/\(X\s*\)\s*Dinheiro|Dinheiro/i.test(trimmedText)) parsedJson.formaPagamento = 'dinheiro';
    }

    // 8. Valor Total Regex
    if (!parsedJson.valorTotal || parsedJson.valorTotal <= 0) {
      const valorMatch = trimmedText.match(/(?:Valor total|Total|Valor):\s*R\$\s*([0-9.,]+)/i) ||
                         trimmedText.match(/R\$\s*([0-9.,]+)/i);
      if (valorMatch) {
        const clean = valorMatch[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(clean);
        if (!isNaN(val) && val > 0) {
          parsedJson.valorTotal = val;
        }
      }
    }

    // Harmonização da Matemática de Upgrade:
    if (parsedJson.isUpgrade && parsedJson.tradeIn?.valor > 0) {
      const vTotal = Number(parsedJson.valorTotal || 0);
      const vEntrada = Number(parsedJson.tradeIn.valor || parsedJson.valorEntradaTroca || 0);
      if (vTotal > 0 && vEntrada > 0) {
        if (!parsedJson.valorVolta || parsedJson.valorVolta <= 0) {
          parsedJson.valorVolta = Math.max(0, vTotal - vEntrada);
        }
      } else if (parsedJson.valorVolta && parsedJson.valorVolta > 0 && vEntrada > 0 && (!vTotal || vTotal <= 0)) {
        parsedJson.valorTotal = vEntrada + parsedJson.valorVolta;
      }
    } else if (!parsedJson.isUpgrade) {
      parsedJson.valorVolta = parsedJson.valorTotal;
    }

    // 9. Condição Regex (novo vs seminovo)
    if (!parsedJson.aparelho.condicao) {
      if (/lacrado|novo|caixa fechada/i.test(trimmedText)) {
        parsedJson.aparelho.condicao = 'novo';
      } else {
        parsedJson.aparelho.condicao = 'seminovo';
      }
    }

    // 10. Código / ID do Aparelho Regex
    if (!parsedJson.aparelho.codigo) {
      const codMatch = trimmedText.match(/(?:COD|CÓD|CODIGO|CÓDIGO|ID|ID APARELHO):\s*#?([0-9A-Za-z]{6,12})/i) ||
                       trimmedText.match(/(?:COD|CÓD)\s+([0-9A-Za-z]{6,12})/i) ||
                       trimmedText.match(/#([0-9]{6,10})/);
      if (codMatch) {
        parsedJson.aparelho.codigo = codMatch[1].trim();
      }
    }

    // 11. Modelo & Capacidade Regex Fallback se a IA não tiver lido
    if (!parsedJson.aparelho.modelo) {
      const modMatch = trimmedText.match(/(?:iPhone|Galaxy|Redmi|Poco|Xiaomi|Motorola|MacBook|PS5|PS4|Xbox|Switch)\s+[A-Za-z0-9\s]+/i) ||
                       trimmedText.match(/(?:Modelo|Aparelho):\s*([^\n\r]+)/i);
      if (modMatch) {
        parsedJson.aparelho.modelo = modMatch[0].trim();
      }
    }

    if (!parsedJson.aparelho.capacidade) {
      const romMatch = trimmedText.match(/\b(\d+GB|\d+TB)\b/i);
      if (romMatch) {
        parsedJson.aparelho.capacidade = romMatch[1].toUpperCase();
      }
    }

    // Sanitização pós-IA: Garante que a IA não atribuiu a data de nascimento à data de venda
    const nascNormalizada = (parsedJson.cliente?.dataNascimento || parsedJson.cliente?.data_nascimento || '').replace(/\D/g, '');
    if (parsedJson.dataVenda) {
      const dataVendaLimpa = String(parsedJson.dataVenda).replace(/\D/g, '');
      let anoVenda = 0;
      if (parsedJson.dataVenda.includes('-')) {
        anoVenda = parseInt(parsedJson.dataVenda.split('-')[0], 10);
      } else if (parsedJson.dataVenda.includes('/')) {
        anoVenda = parseInt(parsedJson.dataVenda.split('/')[2], 10);
      }
      if ((nascNormalizada && dataVendaLimpa === nascNormalizada) || (anoVenda > 0 && anoVenda < 2020)) {
        console.warn(`[Parse-Venda] IA atribuiu nascimento ou ano antigo (${parsedJson.dataVenda}) à data da venda. Corrigindo.`);
        parsedJson.dataVenda = null;
      }
    }

    // 11. Data Venda Regex (ex: YYYY-MM-DD ou DD/MM/YYYY)
    if (!parsedJson.dataVenda) {
      // 11.1 Busca rótulo explícito de data de venda (Data da venda, Em, Venda realizada em, etc.)
      const rotuloVendaMatch = trimmedText.match(/(?:Data da Venda|Data Venda|Data do Pedido|Venda realizada em|Data:\s*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
      if (rotuloVendaMatch) {
        const rawDate = rotuloVendaMatch[1];
        if (rawDate.includes('/')) {
          const [d, m, y] = rawDate.split('/');
          parsedJson.dataVenda = `${y}-${m}-${d}`;
        } else {
          parsedJson.dataVenda = rawDate;
        }
      } else {
        // 11.2 Varre as datas do texto, DESCONSIDERANDO explicitamente a data de nascimento do cliente
        const todasDatas = [...trimmedText.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b|\b(\d{4}-\d{2}-\d{2})\b/g)];
        let dataValidaVenda: string | null = null;
        for (const match of todasDatas) {
          const raw = match[1] || match[2];
          const rawLimpa = raw.replace(/\D/g, '');
          if (nascNormalizada && rawLimpa === nascNormalizada) {
            continue; // É a data de nascimento do cliente!
          }
          let ano = 0;
          if (raw.includes('/')) {
            ano = parseInt(raw.split('/')[2], 10);
          } else {
            ano = parseInt(raw.split('-')[0], 10);
          }
          if (ano < 2020) {
            continue; // Ano típico de data de nascimento de cliente
          }
          if (raw.includes('/')) {
            const [d, m, y] = raw.split('/');
            dataValidaVenda = `${y}-${m}-${d}`;
          } else {
            dataValidaVenda = raw;
          }
          break;
        }

        if (dataValidaVenda) {
          parsedJson.dataVenda = dataValidaVenda;
        } else {
          parsedJson.dataVenda = new Date().toISOString().split('T')[0];
        }
      }
    }

    // Campos faltantes conferidos nos dados finais (texto + foto + regex). IMEI, CPF e nascimento são opcionais.
    parsedJson.camposFaltantes = camposFaltantesDaVenda(parsedJson);

    return NextResponse.json({
      ok: true,
      data: parsedJson,
      fotos: fotosResultado,
    });

  } catch (error: any) {
    console.error('Erro ao processar venda:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar texto.' },
      { status: 500 }
    );
  }
}
