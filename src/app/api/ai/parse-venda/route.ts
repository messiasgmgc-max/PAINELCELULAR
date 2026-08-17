import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { texto } = await request.json();

    if (!texto || typeof texto !== 'string' || !texto.trim()) {
      return NextResponse.json(
        { error: 'Por favor, informe o texto da venda.' },
        { status: 400 }
      );
    }

    const trimmedText = texto.trim();
    const apiKey = process.env.GROQ_API_KEY;
    let parsedJson: any = null;

    // 1. TENTA PROCESSAR VIA IA GROQ SE A CHAVE ESTIVER CONFIGURADA
    if (apiKey) {
      const systemPrompt = `Você é um assistente especialista em extrair dados de formulários e vendas de celulares/eletrônicos para um sistema ERP.
Sua missão é analisar o texto digitado pelo usuário e retornar ESTRITAMENTE um objeto JSON válido (sem qualquer markdown, sem texto extra, sem \`\`\`json).

Estrutura JSON obrigatória:
{
  "cliente": {
    "nome": string ou null (ex: Nome completo do cliente),
    "cpf": string ou null (ex: 01358726698),
    "dataNascimento": string ou null (ex: 04/04/1982),
    "telefone": string ou null (ex: 31994848695),
    "email": string ou null (ex: thiagoamorimc10@yahoo.com.br - PROCURE POR E-mail OU email NO TEXTO!)
  },
  "aparelho": {
    "codigo": string ou null (opcional: Código/ID do aparelho se informado ex: COD: 8665041, COD 8665041, ID: 8665041 ou #8665041),
    "marca": string ou null (ex: Apple, Samsung, Xiaomi, Motorola),
    "modelo": string ou null (ex: iPhone 13 Pro, Galaxy S23, Redmi Note 12),
    "capacidade": string ou null (ex: 128GB, 256GB, 512GB, 64GB),
    "cor": string ou null (ex: Grafite, Preto, Azul, Dourado, Branco),
    "condicao": string ou null (deve ser "novo" se for lacrado/novo ou "seminovo" se usado/seminovo),
    "imei": string ou null (opcional: IMEI/Nº de Série se informado),
    "preco": number ou null (valor unitário do aparelho em R$),
    "custo": number ou null (valor de custo em R$ se informado)
  },
  "vendedor": string ou null (nome do funcionário/vendedor),
  "formaPagamento": string ou null (deve ser um de: "pix", "dinheiro", "cartao_credito", "cartao_debito", "parcelado"),
  "valorTotal": number ou null (valor total final da venda em R$),
  "dataVenda": string ou null (formato YYYY-MM-DD se informado no texto),
  "observacoes": string ou null,
  "camposFaltantes": string[] (array contendo as chaves dos campos essenciais que NÃO foram informados no texto ou estão em branco)
}

Regras para os camposFaltantes:
- Um celular exige obrigatoriamente: "modelo", "capacidade", "valorTotal", "formaPagamento" e "dataVenda" (O IMEI, CPF e Data de Nascimento são OPCIONAIS, NÃO coloque imei, cpf ou dataNascimento em camposFaltantes).
- Se algum desses 5 campos cruciais não puder ser identificado com clareza no texto, adicione a chave correspondente ao array "camposFaltantes". Exemplo: ["dataVenda"].
- Se todos estiverem preenchidos no texto, "camposFaltantes" deve ser um array vazio [].
- Retorne APENAS o JSON puro.`;

      const candidateModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-70b-8192',
        'mixtral-8x7b-32768'
      ];

      for (const model of candidateModels) {
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            const content = groqData.choices?.[0]?.message?.content;
            if (content) {
              parsedJson = JSON.parse(content);
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
      console.log('Executando parser nativo local de fallback...');
      parsedJson = {
        cliente: {},
        aparelho: {},
        vendedor: null,
        formaPagamento: null,
        valorTotal: null,
        dataVenda: null,
        observacoes: null,
        camposFaltantes: []
      };
    }

    if (!parsedJson.cliente) parsedJson.cliente = {};
    if (!parsedJson.aparelho) parsedJson.aparelho = {};

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

    // 6. Forma de Pagamento Regex
    if (!parsedJson.formaPagamento) {
      if (/\(X\s*\)\s*Pix|Pix/i.test(trimmedText)) parsedJson.formaPagamento = 'pix';
      else if (/\(X\s*\)\s*Cartão de crédito|Cartão de crédito|Cartao de credito/i.test(trimmedText)) parsedJson.formaPagamento = 'cartao_credito';
      else if (/\(X\s*\)\s*Cartão de débito|Cartão de débito|Cartao de debito/i.test(trimmedText)) parsedJson.formaPagamento = 'cartao_debito';
      else if (/\(X\s*\)\s*Dinheiro|Dinheiro/i.test(trimmedText)) parsedJson.formaPagamento = 'dinheiro';
    }

    // 7. Valor Total Regex
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

    // 8. Condição Regex (novo vs seminovo)
    if (!parsedJson.aparelho.condicao) {
      if (/lacrado|novo|caixa fechada/i.test(trimmedText)) {
        parsedJson.aparelho.condicao = 'novo';
      } else {
        parsedJson.aparelho.condicao = 'seminovo';
      }
    }

    // 9. Código / ID do Aparelho Regex
    if (!parsedJson.aparelho.codigo) {
      const codMatch = trimmedText.match(/(?:COD|CÓD|CODIGO|CÓDIGO|ID|ID APARELHO):\s*#?([0-9A-Za-z]{6,12})/i) ||
                       trimmedText.match(/(?:COD|CÓD)\s+([0-9A-Za-z]{6,12})/i) ||
                       trimmedText.match(/#([0-9]{6,10})/);
      if (codMatch) {
        parsedJson.aparelho.codigo = codMatch[1].trim();
      }
    }

    // 10. Modelo & Capacidade Regex Fallback se a IA não tiver lido
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

    // 11. Data Venda Regex (ex: YYYY-MM-DD ou DD/MM/YYYY)
    if (!parsedJson.dataVenda) {
      const dateMatch = trimmedText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || trimmedText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (dateMatch) {
        if (dateMatch[1].includes('/')) {
          const [d, m, y] = dateMatch[1].split('/');
          parsedJson.dataVenda = `${y}-${m}-${d}`;
        } else {
          parsedJson.dataVenda = dateMatch[1];
        }
      } else {
        parsedJson.dataVenda = new Date().toISOString().split('T')[0];
      }
    }

    // Pós-processamento e sanitização dos camposFaltantes (IMEI, CPF e DataNascimento são OPCIONAIS)
    const camposFaltantes: string[] = (Array.isArray(parsedJson.camposFaltantes) ? parsedJson.camposFaltantes : [])
      .filter((c: string) => c !== 'imei' && c !== 'cpf' && c !== 'dataNascimento' && c !== 'data_nascimento');
    
    // Verificação de segurança para campos cruciais
    if (!parsedJson.aparelho?.modelo && !camposFaltantes.includes('modelo')) {
      camposFaltantes.push('modelo');
    }
    if (!parsedJson.aparelho?.capacidade && !camposFaltantes.includes('capacidade')) {
      camposFaltantes.push('capacidade');
    }
    if ((parsedJson.valorTotal === null || parsedJson.valorTotal === undefined || parsedJson.valorTotal <= 0) && !camposFaltantes.includes('valorTotal')) {
      camposFaltantes.push('valorTotal');
    }
    if (!parsedJson.formaPagamento && !camposFaltantes.includes('formaPagamento')) {
      camposFaltantes.push('formaPagamento');
    }
    if (!parsedJson.dataVenda && !camposFaltantes.includes('dataVenda')) {
      camposFaltantes.push('dataVenda');
    }

    parsedJson.camposFaltantes = Array.from(new Set(camposFaltantes));

    return NextResponse.json({
      ok: true,
      data: parsedJson
    });

  } catch (error: any) {
    console.error('Erro ao processar venda:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar texto.' },
      { status: 500 }
    );
  }
}
