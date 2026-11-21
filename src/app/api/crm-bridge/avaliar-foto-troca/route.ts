import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';
import { processImageVision } from '@/lib/image-vision-ocr';
import {
  calcularAvaliacaoUpgrade,
  MODELOS_UPGRADE_DISPONIVEIS,
  RespostaCondicaoUpgrade,
} from '@/lib/upgradeEngine';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const PROMPT_AVALIACAO_TROCA = `Você é um avaliador especialista de iPhones seminovos para loja de troca/upgrade.
Analise a imagem enviada (pode ser foto da frente/traseira do iPhone, caixa, ou print da tela de Saúde da Bateria/Sobre).
Retorne ESTRITAMENTE um JSON válido com estas chaves exatas:
{
  "modelo": "Nome exato do modelo (ex: iPhone 13, iPhone 14 Pro Max, iPhone 15) ou null se não identificável",
  "capacidade": "64GB, 128GB, 256GB, 512GB ou 1TB (ou 128GB se não visível)",
  "bateriaPercentual": 86,
  "estadoTela": "original_impecavel | riscos_leves | trocada_compativel | trincada_quebrada",
  "estadoCarcaca": "impecavel | marcas_leves | amassados_arranhaos | trincada_quebrada",
  "faceIdFunciona": true,
  "temCaixaAcessorios": false,
  "observacoesIa": "Resumo curto do que você observou na foto/print em português"
}`;

function casarModeloUpgrade(modeloBruto?: unknown): string | null {
  const txt = String(modeloBruto || '').trim().toLowerCase();
  if (!txt) return null;
  const ordenados = [...MODELOS_UPGRADE_DISPONIVEIS].sort((a, b) => b.length - a.length);
  return ordenados.find((m) => txt.includes(m.toLowerCase())) || null;
}

/**
 * POST /api/crm-bridge/avaliar-foto-troca
 * Usa Groq/Gemini Vision para avaliar foto ou print da bateria do iPhone usado na troca
 * e já preenche a simulação pelo motor upgradeEngine!
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const imageBase64 = String(body.imageBase64 || '').trim();
    const mimeType = String(body.mimeType || 'image/jpeg').trim();

    if (!imageBase64) {
      return crmBridgeJson(
        { ok: false, error: 'Envie imageBase64 para análise da troca.' },
        400,
        req
      );
    }

    const raw = (await processImageVision(
      imageBase64,
      mimeType,
      PROMPT_AVALIACAO_TROCA
    )) as Record<string, unknown> | null;

    if (!raw) {
      return crmBridgeJson(
        {
          ok: false,
          error:
            'IA de visão indisponível ou não conseguiu ler a imagem (verifique GROQ_API_KEY / GEMINI_API_KEY).',
        },
        502,
        req
      );
    }

    const modeloCasado = casarModeloUpgrade(raw.modelo) || 'iPhone 13';
    const capacidade = ['64GB', '128GB', '256GB', '512GB', '1TB'].includes(
      String(raw.capacidade || '').toUpperCase()
    )
      ? String(raw.capacidade).toUpperCase()
      : '128GB';

    const batRaw = Number(raw.bateriaPercentual ?? raw.saude_bateria ?? 86);
    const bateriaPercentual =
      Number.isFinite(batRaw) && batRaw >= 50 && batRaw <= 100 ? Math.round(batRaw) : 86;

    const telasValidas = [
      'original_impecavel',
      'riscos_leves',
      'trocada_compativel',
      'trincada_quebrada',
    ];
    const carcacasValidas = [
      'impecavel',
      'marcas_leves',
      'amassados_arranhaos',
      'trincada_quebrada',
    ];

    const condicoes: RespostaCondicaoUpgrade = {
      bateriaPercentual,
      estadoTela: (telasValidas.includes(String(raw.estadoTela))
        ? raw.estadoTela
        : 'original_impecavel') as RespostaCondicaoUpgrade['estadoTela'],
      estadoCarcaca: (carcacasValidas.includes(String(raw.estadoCarcaca))
        ? raw.estadoCarcaca
        : 'impecavel') as RespostaCondicaoUpgrade['estadoCarcaca'],
      faceIdFunciona: raw.faceIdFunciona !== false,
      camerasFuncionam: true,
      temCaixaAcessorios: Boolean(raw.temCaixaAcessorios),
      conectorCarregadorOk: true,
    };

    const avaliacao = calcularAvaliacaoUpgrade(modeloCasado, capacidade, condicoes);

    return crmBridgeJson(
      {
        ok: true,
        identificado: Boolean(casarModeloUpgrade(raw.modelo)),
        modelo: modeloCasado,
        capacidade,
        condicoes,
        observacoesIa: String(
          raw.observacoesIa || raw.raw_text_summary || 'Análise concluída com sucesso.'
        ),
        avaliacao,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao analisar foto da troca.' },
      500,
      req
    );
  }
}
