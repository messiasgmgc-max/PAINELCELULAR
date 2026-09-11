/**
 * Páginas públicas do upgrade: /avaliar (cliente simula o valor do aparelho) e
 * /coleta (motoboy registra a vistoria na casa do cliente). Nenhuma das duas tem login.
 *
 * Antes elas liam e gravavam direto nas tabelas com a chave anon, e as políticas
 * "USING (true)" deixavam qualquer pessoa ler e alterar avaliações, vistorias e
 * motoboys (com chave Pix) de todas as lojas. Agora passam por
 * /api/publico/upgrade/[lojaId], que grava só estes campos, com status fixo.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITE_FOTOS = 8;
const LIMITE_FOTO = 1_500_000; // caracteres do data URL (a página já reduz para JPEG)
const LIMITE_ASSINATURA = 700_000;
const LIMITE_JSON = 20_000;

/** Motoboy na página de coleta: sem telefone nem chave Pix. */
export const CAMPOS_MOTOBOY_COLETA = ['id', 'nome', 'veiculo', 'placa'] as const;

/** Propostas que o motoboy pode puxar para a vistoria. */
export const CAMPOS_PROPOSTA_COLETA = [
  'id',
  'protocolo',
  'cliente_nome',
  'cliente_telefone',
  'modelo',
  'capacidade',
  'cor',
  'bateria_saude',
  'condicao_geral',
  'detalhes_condicao',
  'valor_avaliado',
  'valor_aprovado',
  'status',
  'aparelho_interesse',
  'created_at',
] as const;

export const STATUS_PROPOSTA_ABERTA = ['pendente', 'em_negociacao', 'aprovado'] as const;

type Registro = Record<string, unknown>;
export type Resultado = { ok: true; registro: Registro } | { ok: false; erro: string };

export function idValido(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

function texto(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function numero(valor: unknown, min: number, max: number): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

function json(valor: unknown): unknown {
  if (valor === null || typeof valor !== 'object') return null;
  try {
    return JSON.stringify(valor).length <= LIMITE_JSON ? valor : null;
  } catch {
    return null;
  }
}

function imagem(valor: unknown, limite: number): string | null {
  return typeof valor === 'string' && valor.startsWith('data:image/') && valor.length <= limite ? valor : null;
}

function comoObjeto(dados: unknown): Registro | null {
  return dados && typeof dados === 'object' && !Array.isArray(dados) ? (dados as Registro) : null;
}

/** Simulação enviada pelo cliente em /avaliar. Entra sempre como pendente. */
export function montarAvaliacaoPublica(lojaId: string, dados: unknown, agora: Date = new Date()): Resultado {
  const d = comoObjeto(dados);
  if (!d) return { ok: false, erro: 'Dados da avaliação ausentes.' };

  const clienteNome = texto(d.cliente_nome, 120);
  const modelo = texto(d.modelo, 80);
  if (!clienteNome) return { ok: false, erro: 'Informe seu nome.' };
  if (!modelo) return { ok: false, erro: 'Informe o modelo do aparelho.' };

  // Valor calculado no navegador: é só uma estimativa que a loja revisa.
  const valorAvaliado = numero(d.valor_avaliado, 0, 100_000);

  return {
    ok: true,
    registro: {
      loja_id: lojaId,
      protocolo: texto(d.protocolo, 40) || null,
      cliente_nome: clienteNome,
      cliente_telefone: texto(d.cliente_telefone, 30) || null,
      cliente_cidade: texto(d.cliente_cidade, 80) || null,
      modelo,
      capacidade: texto(d.capacidade, 20) || null,
      cor: texto(d.cor, 40) || null,
      bateria_saude: numero(d.bateria_saude, 0, 100),
      condicao_geral: texto(d.condicao_geral, 40) || null,
      detalhes_condicao: json(d.detalhes_condicao),
      valor_base: numero(d.valor_base, 0, 100_000),
      descontos_aplicados: json(d.descontos_aplicados),
      valor_avaliado: valorAvaliado,
      valor_aprovado: valorAvaliado,
      status: 'pendente',
      aparelho_interesse: texto(d.aparelho_interesse, 120) || null,
      origem: 'web_publico',
      observacoes: texto(d.observacoes, 500) || null,
      created_at: agora.toISOString(),
    },
  };
}

/** Vistoria registrada pelo motoboy em /coleta. */
export function montarVistoriaPublica(lojaId: string, dados: unknown, agora: Date = new Date()): Resultado {
  const d = comoObjeto(dados);
  if (!d) return { ok: false, erro: 'Dados da coleta ausentes.' };

  const clienteNome = texto(d.cliente_nome, 120);
  const modelo = texto(d.modelo, 80);
  if (!clienteNome) return { ok: false, erro: 'Informe o nome do cliente.' };
  if (!modelo) return { ok: false, erro: 'Informe o modelo do aparelho.' };

  const fotosEnviadas = Array.isArray(d.fotos) ? d.fotos : [];
  if (fotosEnviadas.length > LIMITE_FOTOS) return { ok: false, erro: `Envie no máximo ${LIMITE_FOTOS} fotos.` };
  const fotos = fotosEnviadas.map((foto) => imagem(foto, LIMITE_FOTO));
  if (fotos.some((foto) => foto === null)) return { ok: false, erro: 'Uma das fotos é inválida ou grande demais.' };

  const assinatura = d.assinatura_cliente ? imagem(d.assinatura_cliente, LIMITE_ASSINATURA) : null;
  if (d.assinatura_cliente && !assinatura) return { ok: false, erro: 'Assinatura inválida.' };

  return {
    ok: true,
    registro: {
      loja_id: lojaId,
      avaliacao_id: idValido(d.avaliacao_id) ? d.avaliacao_id : null,
      protocolo: texto(d.protocolo, 40) || null,
      motoboy_id: idValido(d.motoboy_id) ? d.motoboy_id : null,
      motoboy_nome: texto(d.motoboy_nome, 80) || null,
      cliente_nome: clienteNome,
      cliente_telefone: texto(d.cliente_telefone, 30) || null,
      endereco_coleta: texto(d.endereco_coleta, 200) || null,
      modelo,
      capacidade: texto(d.capacidade, 20) || null,
      cor: texto(d.cor, 40) || null,
      imei: texto(d.imei, 20).replace(/\D/g, '') || null,
      bateria_saude: numero(d.bateria_saude, 0, 100),
      condicao_geral: texto(d.condicao_geral, 40) || null,
      detalhes_checklist: json(d.detalhes_checklist),
      valor_avaliado: numero(d.valor_avaliado, 0, 100_000),
      valor_acordado: numero(d.valor_acordado, 0, 100_000),
      fotos,
      observacoes_motoboy: texto(d.observacoes_motoboy, 1000) || null,
      status_coleta: 'coletado',
      assinatura_cliente: assinatura,
      created_at: agora.toISOString(),
    },
  };
}
