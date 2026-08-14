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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chave da API Groq (GROQ_API_KEY) não configurada no servidor.' },
        { status: 500 }
      );
    }

    const systemPrompt = `Você é um assistente especialista em extrair dados de vendas de celulares e eletrônicos para um sistema ERP de gestão de lojas de celulares.
Sua missão é analisar o texto digitado em português pelo usuário e retornar ESTRITAMENTE um objeto JSON válido (sem qualquer markdown, sem texto extra, sem \`\`\`json).

Estrutura JSON obrigatória:
{
  "cliente": {
    "nome": string ou null,
    "cpf": string ou null,
    "telefone": string ou null,
    "email": string ou null
  },
  "aparelho": {
    "marca": string ou null (ex: Apple, Samsung, Xiaomi, Motorola),
    "modelo": string ou null (ex: iPhone 13 Pro, Galaxy S23, Redmi Note 12),
    "capacidade": string ou null (ex: 128GB, 256GB, 512GB, 64GB),
    "cor": string ou null (ex: Grafite, Preto, Azul, Dourado, Branco),
    "imei": string ou null (apenas números ou texto do IMEI/Série se informado),
    "preco": number ou null (valor unitário do aparelho em R$),
    "custo": number ou null (valor de custo em R$ se informado)
  },
  "vendedor": string ou null (nome do funcionário/vendedor),
  "formaPagamento": string ou null (deve ser um de: "pix", "dinheiro", "cartao_credito", "cartao_debito", "parcelado"),
  "valorTotal": number ou null (valor total final da venda em R$),
  "observacoes": string ou null,
  "camposFaltantes": string[] (array contendo as chaves dos campos essenciais que NÃO foram informados no texto ou estão em branco)
}

Regras para os camposFaltantes:
- Um celular exige obrigatoriamente: "modelo", "capacidade", "imei", "valorTotal" e "formaPagamento".
- Se algum desses 5 campos cruciais não puder ser identificado com clareza no texto, adicione a chave correspondente ao array "camposFaltantes". Exemplo: ["imei", "capacidade"].
- Se todos estiverem preenchidos no texto, "camposFaltantes" deve ser um array vazio [].
- Retorne APENAS o JSON puro.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto.trim() }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erro na resposta do Groq API:', errText);
      return NextResponse.json(
        { error: 'Falha na comunicação com o serviço de IA do Groq.' },
        { status: 502 }
      );
    }

    const groqData = await groqResponse.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'Resposta vazia do serviço de IA.' },
        { status: 502 }
      );
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(content);
    } catch (e) {
      console.error('Erro ao fazer parse do JSON do Groq:', content);
      return NextResponse.json(
        { error: 'Erro no formato retornado pela IA.' },
        { status: 500 }
      );
    }

    // Pós-processamento e sanitização dos camposFaltantes
    const camposFaltantes: string[] = Array.isArray(parsedJson.camposFaltantes) ? parsedJson.camposFaltantes : [];
    
    // Verificação de segurança adicional para campos cruciais
    if (!parsedJson.aparelho?.modelo && !camposFaltantes.includes('modelo')) {
      camposFaltantes.push('modelo');
    }
    if (!parsedJson.aparelho?.capacidade && !camposFaltantes.includes('capacidade')) {
      camposFaltantes.push('capacidade');
    }
    if (!parsedJson.aparelho?.imei && !camposFaltantes.includes('imei')) {
      camposFaltantes.push('imei');
    }
    if ((parsedJson.valorTotal === null || parsedJson.valorTotal === undefined || parsedJson.valorTotal <= 0) && !camposFaltantes.includes('valorTotal')) {
      camposFaltantes.push('valorTotal');
    }
    if (!parsedJson.formaPagamento && !camposFaltantes.includes('formaPagamento')) {
      camposFaltantes.push('formaPagamento');
    }

    parsedJson.camposFaltantes = Array.from(new Set(camposFaltantes));

    return NextResponse.json({
      ok: true,
      data: parsedJson
    });

  } catch (error: any) {
    console.error('Erro ao processar venda por IA:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar texto por IA.' },
      { status: 500 }
    );
  }
}
