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
import { inferirMarcaPorModelo } from '@/lib/marcaUtils';
import { sanitizarECompletarVendaParsed } from '@/lib/vendas/parseVendaTexto';

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
    "marca": string ou null (identifique a marca real: Xiaomi para Poco/Redmi/Mi; Samsung para Galaxy; Motorola para Moto/Edge; Apple para iPhone/iPad),
    "modelo": string ou null (ex: iPhone 17 Pro Max, Poco X8 Pro, Galaxy S23 - APARELHO QUE O CLIENTE ESTÁ COMPRANDO/LEVANDO),
    "capacidade": string ou null (ex: 128GB, 256GB, 512GB, 64GB),
    "cor": string ou null (ex: Grafite, Preto, Azul, Dourado, Branco),
    "condicao": string ou null (deve ser "novo" se for lacrado/novo ou "seminovo" se usado/seminovo),
    "imei": string ou null (opcional: IMEI/Nº de Série do aparelho VENDIDO se informado),
    "preco": number ou null (valor unitário do aparelho vendido em R$),
    "custo": number ou null (valor de custo em R$ se informado)
  },
  "isUpgrade": boolean (true SE houver "(X) Upgrade" ou se o cliente deu um aparelho de entrada/troca para abater o valor, senão false),
  "tradeIn": {
    "marca": string ou null (ex: Apple, Samsung),
    "modelo": string ou null (ex: iPhone 16, iPhone 11 - APARELHO QUE O CLIENTE ENTREGOU NA TROCA),
    "capacidade": string ou null (ex: 64GB, 128GB),
    "cor": string ou null (ex: Preto, Branco),
    "imei": string ou null (IMEI do aparelho entregue na troca se informado),
    "bateria": number ou null (saúde da bateria em % se informada, ex: 85),
    "valor": number (valor de avaliação/entrada que o aparelho do cliente abateu em R$, ex: 1500),
    "condicao": "seminovo",
    "observacoes": string ou null
  } ou null,
  "vendedor": string ou null (nome do funcionário/vendedor),
  "formaPagamento": string ou null (forma de pagamento principal da volta/restante: "pix", "dinheiro", "cartao_credito", "cartao_debito", "parcelado"),
  "pagamentos": Array<{ "metodo": string, "valor": number, "parcelas"?: number }> ou null (SE o texto informar pagamentos divididos em 2 ou mais formas, ex: 3000 no pix e 4500 no cartão em 10x),
  "valorTotal": number ou null (valor total do aparelho que está sendo vendido em R$, antes do abatimento da troca),
  "valorEntradaTroca": number ou null (valor abatido pelo aparelho entregue na troca em R$, ou null se não houver troca),
  "valorVolta": number ou null (valor líquido da volta/restante pago pelo cliente em R$, calculado como valorTotal - valorEntradaTroca),
  "dataVenda": string ou null (formato YYYY-MM-DD da data em que a VENDA foi efetuada),
  "observacoes": string ou null,
  "camposFaltantes": string[] (array contendo as chaves dos campos essenciais que NÃO foram informados no texto ou estão em branco)
}

REGRAS CRÍTICAS DE CONTEXTO PARA UPGRADE / TROCA (TRADE-IN):
1. DIFERENCIAÇÃO ENTRE APARELHO VENDIDO E APARELHO DE ENTRADA:
   - "aparelho": É o aparelho que a loja está VENDENDO para o cliente (ex: "Comprou iPhone 14 Pro", "Levou iPhone 15 128GB", "Modelo: 17 pro Max 256gb azul lacrado").
   - "tradeIn": É o aparelho USADO que o cliente DEU DE ENTRADA / TROCA para abater o preço (ex: "(X) Upgrade - Modelo: iPhone 16", "Pegou iPhone 11 na troca", "Deu iPhone XR de entrada").
2. FORMULÁRIOS COM CHECKBOXES (X) OU [X]:
   - Se o texto contiver "(X) Upgrade - Modelo: [Nome]" ou "[X] Upgrade - Modelo: [Nome]", isso INDICA OBRIGATORIAMENTE que:
     - "isUpgrade": true
     - "tradeIn.modelo": "[Nome]" (ex: iPhone 16)
     - "tradeIn.marca": "Apple" (ou a marca respectiva)
     - A outra linha "Modelo: [Nome]" no formulário (ex: "Modelo: 17 pro Max 256gb azul lacrado imei 350015753668064") é o APARELHO VENDIDO!
   - Se no formulário "(X) Cartão de crédito" estiver marcado e houver "Valor total: 4.776,77", esse valor é a VOLTA paga no cartão de crédito! Defina "formaPagamento": "cartao_credito", "valorVolta": 4776.77 e "valorTotal": 4776.77.
3. MATEMÁTICA DA VOLTA / RESTANTE:
   - Se o aparelho vendido custa R$ 4.500 e o cliente deu um aparelho de entrada avaliado em R$ 1.500:
     - "valorTotal": 4500
     - "valorEntradaTroca": 1500
     - "valorVolta": 3000 (a volta/diferença a ser paga)
     - "isUpgrade": true
   - Se o texto disser apenas a volta e o valor da troca:
     - "valorTotal": soma ou valor da volta informado
     - "valorVolta": valor líquido restante
     - "isUpgrade": true
4. PROIBIÇÃO ABSOLUTA DE INVENTAR UPGRADE:
   - Se o texto for uma venda normal simples sem troca de aparelho (ex: "( ) Upgrade", ou sem qualquer menção a troca), DEIXE "isUpgrade": false, "tradeIn": null, "valorEntradaTroca": null.

REGRAS CRÍTICAS DE DIFERENCIAÇÃO ENTRE DATA DE NASCIMENTO E DATA DA VENDA:
1. "cliente.dataNascimento": Data em que o cliente nasceu (ex: "Data de nascimento: 22011999" -> 22/01/1999, "Nasc: 15/05/1990", "aniversário").
2. "dataVenda": Data em que a venda/negociação do aparelho ocorreu (transação na loja, ano atual como 2024, 2025, 2026).
3. PROIBIÇÃO ABSOLUTA: NUNCA coloque a data de nascimento do cliente em "dataVenda"! Se o campo "Data da compra:" estiver vazio, deixe "dataVenda": null.

Regras para os camposFaltantes:
- Um celular exige obrigatoriamente: "modelo", "capacidade", "valorTotal", "formaPagamento" e "dataVenda" (O IMEI, CPF e Data de Nascimento são OPCIONAIS, NÃO coloque imei, cpf ou dataNascimento em camposFaltantes).
- Se a dataVenda não puder ser identificada com clareza no texto (lembrando que a data de nascimento NÃO é data de venda), adicione a chave correspondente ao array "camposFaltantes". Exemplo: ["dataVenda"].
- Se todos estiverem preenchidos no texto, "camposFaltantes" deve ser um array vazio [].
- Retorne APENAS o JSON puro.`;

      const candidateModels = [
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
        'groq/compound',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
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

    // 2. PARSER NATIVO LOCAL DE FALLBACK SE A IA FALHAR OU NÃO TIVER CHAVE, E SANITIZAÇÃO COMPLETA
    parsedJson = sanitizarECompletarVendaParsed(parsedJson, trimmedText);

    // 3. FOTOS: completam o aparelho antes da validação final
    let fotosResultado: ResultadoFotosVenda | null = null;
    if (fotos.length) {
      fotosResultado = mesclarFotosNaVenda(parsedJson, await leiturasFotos);
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
