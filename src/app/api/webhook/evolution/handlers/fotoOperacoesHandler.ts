import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisionEtiquetaResult } from '@/lib/image-vision-ocr';
import { normalizarResultadoVision } from '@/lib/image-vision-ocr';
import { estaNoEstoque } from '@/lib/estoque/ciclo';
import { gerarLoteId, registrarEntradaEstoque } from '@/lib/estoque/movimentacoes';
import { notificarEntradaGrupoEntradas } from '@/lib/whatsapp/notificarEntradaEstoque';
import { obterDataAtualBrasiliaIso } from '@/lib/vendas/parseVendaTexto';
import { extrairDataEntradaEstoque } from '../entradaInteligente';
import {
  avaliarEstoqueVendaAtacadoComFoto,
  type AparelhoEstoqueConsulta,
  type FotoRecenteCache,
  type VendaAtacadoDetectada,
} from '../notinhaAutomatica';

const MAX_IDADE_PENDENTE_MS = 60 * 60 * 1000; // 60 minutos

export interface DadosVendaAtacadoPendente {
  id: string;
  lojaId: string;
  vendaAtacado: VendaAtacadoDetectada;
  fotos: FotoRecenteCache[];
  usuarioNome: string;
  motivoEstoque: string;
  criadoEm: number;
  messageId?: string;
  mensagensVinculadas?: string[];
}

export interface DadosEntradaFotoPendente {
  id: string;
  lojaId: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  imei: string | null;
  bateria: number | null;
  observacoes: string | null;
  dataEntrada: string | null;
  condicao: 'novo' | 'seminovo' | 'usado';
  custo: number;
  preco: number;
  usuarioNome: string;
  criadoEm: number;
  messageId?: string;
}

function inferirMarca(modelo: string): string {
  const m = String(modelo || '').toLowerCase();
  if (/(iphone|ipad|macbook|apple|watch|airpods?)/.test(m)) return 'Apple';
  if (/(galaxy|samsung)/.test(m)) return 'Samsung';
  if (/(xiaomi|redmi|poco)/.test(m)) return 'Xiaomi';
  if (/(motorola|moto\b|edge\b)/.test(m)) return 'Motorola';
  if (/realme/.test(m)) return 'Realme';
  if (/(ps5|ps4|playstation)/.test(m)) return 'Sony';
  return 'Apple';
}

function extrairValorNumericoRotulado(texto: string, rotulo: 'custo' | 'preco'): number {
  const regex =
    rotulo === 'custo'
      ? /\bcusto\s*[:=-]?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i
      : /\b(?:pre[cç]o|valor|venda)\s*[:=-]?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;
  const m = texto.match(regex);
  if (!m) return 0;
  let limpo = m[1];
  if (limpo.includes('.') && limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes(',')) {
    limpo = limpo.replace(',', '.');
  } else if (/^\d{1,3}\.\d{3}$/.test(limpo)) {
    limpo = limpo.replace(/\./g, '');
  }
  const n = parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Extrai um IMEI (final de 4-6 dígitos ou completo de 14-15 dígitos) de uma mensagem curta
 * enviada para vincular/corrigir uma venda de atacado pendente ou entrada por foto.
 */
export function extrairImeiCorrecaoRapida(texto: string, aceitarNumeroSolto: boolean = false): string | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpo = texto.trim();

  const matchRotulado = limpo.match(
    /^(?:o\s+)?(?:final\s+(?:do\s+)?)?(?:imei|ime|serial|s[eé]rie)\s*(?:[eé]|certo|correto|novo|:|=|da\s+etiqueta)?\s*#?(\d{4,6}|\d{14,16})\s*$/i
  );
  if (matchRotulado) {
    return matchRotulado[1];
  }

  if (aceitarNumeroSolto) {
    const matchSolto = limpo.match(/^#?(\d{4,6}|\d{14,16})$/);
    if (matchSolto) {
      return matchSolto[1];
    }
  }

  return null;
}

/**
 * Detecta se a legenda de uma foto pede cadastro direto no estoque (ex: "entrada", "cadastrar", "entrou", "estoque").
 */
export function ehLegendaEntradaFotoDireta(caption: string): boolean {
  const limpo = String(caption || '').trim();
  if (!limpo) return false;
  return /^(?:!?(?:entrada|cadastrar|cadastra|entrou|estoque|novo\s+estoque|dar\s+entrada|coloca(?:r)?\s+no\s+estoque))\b/i.test(
    limpo
  );
}

// ── VENDA ATACADO PENDENTE (OPÇÃO A) ──

export function formatarMensagemAtacadoPendente(dados: DadosVendaAtacadoPendente): string {
  const valorFmt =
    dados.vendaAtacado.valor > 0
      ? `R$ ${Number(dados.vendaAtacado.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'R$ 0,00 (não informado)';

  const linhasAparelhos = dados.fotos.map((f) => {
    const desc = [f.modelo || 'Aparelho', f.capacidade, f.cor].filter(Boolean).join(' ').trim();
    const imeiTxt = f.imei ? `\`${f.imei}\`` : '⚠️ Não identificado na foto';
    const batTxt = f.bateria ? ` (${String(f.bateria).replace(/%/g, '')}%)` : '';
    return `📱 *Aparelho:* ${desc}${batTxt}\n🔢 *IMEI:* ${imeiTxt}`;
  });

  return (
    `⏳ *VENDA ATACADO PENDENTE DE CONFIRMAÇÃO*\n\n` +
    `👤 *Cliente:* ${dados.vendaAtacado.clienteNome}\n` +
    `${linhasAparelhos.join('\n')}\n` +
    `💰 *Valor:* ${valorFmt}\n` +
    `📦 *Estoque:* ${dados.motivoEstoque}\n\n` +
    `💡 *Envie o final do IMEI* (ex: \`imei 7887\`) para localizar no estoque, dar baixa e registrar!\n` +
    `✅ Ou responda *confirmar* / reaja com ✅ para lançar mesmo sem vínculo de estoque.\n` +
    `❌ Responda *cancelar* / reaja com ❌ para descartar.`
  );
}

export async function salvarVendaAtacadoPendente(
  supabase: SupabaseClient,
  lojaId: string,
  jids: string[],
  messageId: string,
  dados: DadosVendaAtacadoPendente
): Promise<void> {
  const agora = Date.now();
  dados.messageId = messageId;
  dados.criadoEm = dados.criadoEm || agora;
  const msgIds = Array.from(new Set([...(dados.mensagensVinculadas || []), messageId].filter(Boolean)));
  dados.mensagensVinculadas = msgIds;

  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  const chaves = new Set<string>();
  for (const jid of jidsLimpos) {
    for (const idMsg of msgIds) {
      chaves.add(`atacado_pendente:${jid}:${idMsg}`);
    }
    chaves.add(`atacado_pendente:${jid}:ultima`);
  }

  try {
    const payload = {
      loja_id: lojaId,
      tipo: 'confirmacao' as const,
      action: 'confirmar_venda_atacado',
      params: dados as any,
      resumo: `Atacado pendente ${dados.vendaAtacado.clienteNome}`,
      criado_em: new Date(agora).toISOString(),
    };
    await Promise.all(
      Array.from(chaves).map((chave) =>
        supabase.from('whatsapp_acoes_pendentes').upsert({ ...payload, chave }, { onConflict: 'chave' })
      )
    );
  } catch (err) {
    console.warn('[Atacado Pendente] Erro ao salvar:', err);
  }
}

export async function buscarVendaAtacadoPendente(
  supabase: SupabaseClient,
  jids: string[],
  quotedStanzaId?: string | null
): Promise<DadosVendaAtacadoPendente | null> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  if (jidsLimpos.length === 0) return null;

  const chaves = quotedStanzaId
    ? jidsLimpos.map((j) => `atacado_pendente:${j}:${quotedStanzaId}`)
    : jidsLimpos.map((j) => `atacado_pendente:${j}:ultima`);

  try {
    const { data } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params, criado_em')
      .in('chave', chaves)
      .eq('tipo', 'confirmacao')
      .order('criado_em', { ascending: false })
      .limit(5);

    const agora = Date.now();
    for (const row of (data || []) as Array<{ params?: DadosVendaAtacadoPendente; criado_em?: string }>) {
      if (!row?.params?.id) continue;
      const criado = row.criado_em ? new Date(row.criado_em).getTime() : row.params.criadoEm || 0;
      if (agora - criado > MAX_IDADE_PENDENTE_MS) continue;
      return row.params;
    }
  } catch (err) {
    console.warn('[Atacado Pendente] Erro ao buscar:', err);
  }

  return null;
}

export async function limparVendaAtacadoPendente(
  supabase: SupabaseClient,
  dados: DadosVendaAtacadoPendente,
  jids: string[]
): Promise<void> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  const msgIds = Array.from(new Set([dados.messageId, ...(dados.mensagensVinculadas || [])].filter(Boolean) as string[]));
  const chaves = new Set<string>();
  for (const jid of jidsLimpos) {
    chaves.add(`atacado_pendente:${jid}:ultima`);
    for (const m of msgIds) {
      chaves.add(`atacado_pendente:${jid}:${m}`);
    }
  }
  try {
    if (chaves.size > 0) {
      await supabase.from('whatsapp_acoes_pendentes').delete().in('chave', Array.from(chaves));
    }
  } catch (err) {
    console.warn('[Atacado Pendente] Erro ao limpar:', err);
  }
}

export function aplicarImeiEmAtacadoPendente(
  dados: DadosVendaAtacadoPendente,
  novoImei: string,
  estoque: AparelhoEstoqueConsulta[]
): {
  dadosAtualizados: DadosVendaAtacadoPendente;
  avaliacao: ReturnType<typeof avaliarEstoqueVendaAtacadoComFoto>;
} {
  const avaliacaoAntes = avaliarEstoqueVendaAtacadoComFoto(dados.fotos, estoque);
  const idxSemMatch = avaliacaoAntes.itens.findIndex((it) => it.cruzamento.status !== 'confirmado');
  const idxAlvo = idxSemMatch >= 0 ? idxSemMatch : 0;

  const fotosAtualizadas = dados.fotos.map((f, idx) =>
    idx === idxAlvo ? { ...f, imei: novoImei } : { ...f }
  );
  const avaliacao = avaliarEstoqueVendaAtacadoComFoto(fotosAtualizadas, estoque);
  const motivo = avaliacao.itens
    .map((it) => it.cruzamento.mensagem)
    .filter(Boolean)
    .join(' | ');

  return {
    dadosAtualizados: {
      ...dados,
      fotos: fotosAtualizadas,
      motivoEstoque: motivo || dados.motivoEstoque,
    },
    avaliacao,
  };
}

// ── CADASTRO NO ESTOQUE PELA FOTO + ETIQUETA ──

export function construirDadosEntradaDeVision(
  visionBruto: VisionEtiquetaResult,
  lojaId: string,
  captionText: string = '',
  usuarioNome: string = 'Equipe'
): DadosEntradaFotoPendente | null {
  const vision = normalizarResultadoVision(visionBruto);
  const modelo = vision.modelo ? String(vision.modelo).trim() : '';
  if (!modelo) return null;

  const capacidade = vision.capacidade || '128GB';
  const cor = vision.cor || 'Padrão';
  const imeiCaption = captionText
    ? captionText.match(/\b(?:imei|final)\s*[:=-]?\s*#?(\d{4,6}|\d{14,16})\b/i)?.[1] || null
    : null;
  const imei = vision.imei || imeiCaption || null;

  const batNum =
    typeof vision.saude_bateria === 'number'
      ? vision.saude_bateria
      : vision.saude_bateria
        ? parseInt(String(vision.saude_bateria).replace(/\D/g, ''), 10)
        : null;
  const bateria = batNum && batNum > 0 && batNum <= 100 ? batNum : null;

  const obsVision = vision.observacoes ? String(vision.observacoes).trim() : null;
  const obsCaption = captionText
    ? captionText.match(/\bobs(?:erva[cç][aã]o)?\s*[:=-]\s*([^\n|]+)/i)?.[1]?.trim() || null
    : null;
  const observacoes = [obsVision, obsCaption].filter(Boolean).join(' | ') || null;

  const hojeIso = obterDataAtualBrasiliaIso();
  const dataEntrada =
    (vision.data_entrada ? extrairDataEntradaEstoque(`entrada ${vision.data_entrada}`, hojeIso) : null) ||
    (captionText ? extrairDataEntradaEstoque(captionText, hojeIso) : null) ||
    null;

  const condVision = String(vision.condicao || '').toLowerCase();
  const condicao: 'novo' | 'seminovo' | 'usado' =
    condVision === 'novo' ? 'novo' : condVision === 'usado' ? 'usado' : 'seminovo';

  const custo = extrairValorNumericoRotulado(captionText, 'custo');
  const preco = extrairValorNumericoRotulado(captionText, 'preco') || Number(vision.preco || 0);

  return {
    id: `entrada-foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    lojaId,
    marca: inferirMarca(modelo),
    modelo,
    capacidade,
    cor,
    imei,
    bateria,
    observacoes,
    dataEntrada,
    condicao,
    custo,
    preco,
    usuarioNome,
    criadoEm: Date.now(),
  };
}

export function formatarResumoDadosEntradaFoto(dados: DadosEntradaFotoPendente): string {
  const linhas = [
    `📱 *Modelo:* ${dados.modelo}`,
    `💾 *Capacidade:* ${dados.capacidade}`,
    `🔋 *Bateria:* ${dados.bateria ? `${dados.bateria}%` : 'Não informada'}`,
    `🔢 *IMEI:* ${dados.imei ? `\`${dados.imei}\`` : 'Não identificado'}`,
    `🎨 *Cor:* ${dados.cor}`,
    `📝 *Observação:* ${dados.observacoes || 'Nenhuma'}`,
  ];
  if (dados.dataEntrada) {
    const [a, m, d] = dados.dataEntrada.split('-');
    linhas.push(`📅 *Data de entrada:* ${d && m && a ? `${d}/${m}/${a}` : dados.dataEntrada}`);
  }
  if (dados.custo > 0) {
    linhas.push(
      `💵 *Custo:* R$ ${dados.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
  }
  if (dados.preco > 0) {
    linhas.push(
      `🏷️ *Preço:* R$ ${dados.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
  }
  return linhas.join('\n');
}

export async function salvarEntradaFotoPendente(
  supabase: SupabaseClient,
  lojaId: string,
  jids: string[],
  messageId: string,
  dados: DadosEntradaFotoPendente
): Promise<void> {
  const agora = Date.now();
  dados.messageId = messageId;
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  const chaves = new Set<string>();
  for (const jid of jidsLimpos) {
    chaves.add(`entrada_foto:${jid}:${messageId}`);
    chaves.add(`entrada_foto:${jid}:ultima`);
  }

  try {
    const payload = {
      loja_id: lojaId,
      tipo: 'confirmacao' as const,
      action: 'cadastrar_aparelho_foto',
      params: dados as any,
      resumo: `Cadastro foto ${dados.modelo} (${dados.imei || 'sem IMEI'})`,
      criado_em: new Date(agora).toISOString(),
    };
    await Promise.all(
      Array.from(chaves).map((chave) =>
        supabase.from('whatsapp_acoes_pendentes').upsert({ ...payload, chave }, { onConflict: 'chave' })
      )
    );
  } catch (err) {
    console.warn('[Entrada Foto] Erro ao salvar pendente:', err);
  }
}

export async function buscarEntradaFotoPendente(
  supabase: SupabaseClient,
  jids: string[],
  quotedStanzaId?: string | null
): Promise<DadosEntradaFotoPendente | null> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  if (jidsLimpos.length === 0) return null;

  const chaves = quotedStanzaId
    ? jidsLimpos.map((j) => `entrada_foto:${j}:${quotedStanzaId}`)
    : jidsLimpos.map((j) => `entrada_foto:${j}:ultima`);

  try {
    const { data } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params, criado_em')
      .in('chave', chaves)
      .eq('tipo', 'confirmacao')
      .order('criado_em', { ascending: false })
      .limit(5);

    const agora = Date.now();
    for (const row of (data || []) as Array<{ params?: DadosEntradaFotoPendente; criado_em?: string }>) {
      if (!row?.params?.id) continue;
      const criado = row.criado_em ? new Date(row.criado_em).getTime() : row.params.criadoEm || 0;
      if (agora - criado > MAX_IDADE_PENDENTE_MS) continue;
      return row.params;
    }
  } catch (err) {
    console.warn('[Entrada Foto] Erro ao buscar pendente:', err);
  }

  return null;
}

export async function limparEntradaFotoPendente(
  supabase: SupabaseClient,
  dados: DadosEntradaFotoPendente,
  jids: string[]
): Promise<void> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  const chaves = new Set<string>();
  for (const jid of jidsLimpos) {
    chaves.add(`entrada_foto:${jid}:ultima`);
    if (dados.messageId) chaves.add(`entrada_foto:${jid}:${dados.messageId}`);
  }
  try {
    if (chaves.size > 0) {
      await supabase.from('whatsapp_acoes_pendentes').delete().in('chave', Array.from(chaves));
    }
  } catch (err) {
    console.warn('[Entrada Foto] Erro ao limpar pendente:', err);
  }
}

export async function executarEntradaEstoquePorFoto(
  supabase: SupabaseClient,
  lojaId: string,
  dados: DadosEntradaFotoPendente,
  opcoes?: { origemIsGroup?: boolean; origemRemoteJid?: string | null }
): Promise<{ sucesso: boolean; duplicado?: boolean; notificadoGrupoEntradas?: boolean; mensagem: string }> {
  // Evita duplicar caso o IMEI já exista ativo no estoque da loja
  if (dados.imei && dados.imei.length >= 4) {
    const ultimos4 = dados.imei.slice(-4);
    const filtro =
      dados.imei.length > 4
        ? `imei.eq.${dados.imei},imei.ilike.%${dados.imei}%,imei.eq.${ultimos4},imei.ilike.%${ultimos4}`
        : `imei.eq.${dados.imei},imei.ilike.%${dados.imei}%`;
    const { data: existentes } = await supabase
      .from('aparelhos')
      .select('id, modelo, capacidade, cor, imei, status, ativo, condicao')
      .eq('loja_id', lojaId)
      .or(filtro)
      .limit(5);

    const ativoDup = (existentes || []).find((a: any) => estaNoEstoque(a));
    if (ativoDup) {
      return {
        sucesso: false,
        duplicado: true,
        mensagem:
          `⚠️ *Este aparelho já está cadastrado no estoque!*\n\n` +
          `📱 ${ativoDup.modelo} ${ativoDup.capacidade || ''} ${ativoDup.cor || ''}\n` +
          `🔢 IMEI: \`${ativoDup.imei || dados.imei}\``,
      };
    }
  }

  const codigoGerado = `AP-${Math.floor(100000 + Math.random() * 900000)}`;
  const partesObs: string[] = [];
  if (dados.observacoes) partesObs.push(`Obs: (${dados.observacoes})`);
  if (dados.bateria) partesObs.push(`Bateria: ${dados.bateria}%`);
  if (dados.imei) partesObs.push(`IMEI: ${dados.imei}`);

  const dataCadastroIso = dados.dataEntrada
    ? `${dados.dataEntrada}T15:00:00.000Z`
    : new Date().toISOString();

  const registro: Record<string, any> = {
    loja_id: lojaId,
    marca: dados.marca,
    modelo: dados.modelo,
    capacidade: dados.capacidade,
    cor: dados.cor,
    imei: dados.imei || null,
    codigo: codigoGerado,
    saude_bateria: dados.bateria ? `${dados.bateria}%` : null,
    condicao: dados.condicao,
    status: 'disponivel',
    ativo: true,
    custo: dados.custo || 0,
    preco: dados.preco || 0,
    observacoes: partesObs.length > 0 ? partesObs.join(' | ') : null,
    dataCadastro: dataCadastroIso,
  };

  // estoque-guard: auditado
  const { data: inserido, error } = await supabase
    .from('aparelhos')
    .insert(registro)
    .select('id, loja_id, ativo, status, condicao, data_saida, motivo_saida')
    .single();

  if (error) {
    return {
      sucesso: false,
      mensagem: `❌ Não consegui cadastrar o aparelho no estoque: ${error.message}`,
    };
  }

  const loteId = gerarLoteId();
  const entrada = await registrarEntradaEstoque(supabase, {
    aparelhos: inserido ? [inserido] : [],
    origem: 'bot_whatsapp',
    loteId,
    lojaId,
    usuarioNome: dados.usuarioNome,
    observacao: 'Cadastro por foto da etiqueta via WhatsApp',
  });
  if (!entrada.auditoriaRegistrada) {
    console.warn('[Estoque] Aparelho cadastrado por foto sem auditoria completa:', entrada.erroAuditoria);
  }

  const notificacaoGrupo = await notificarEntradaGrupoEntradas({
    supabase,
    lojaId,
    itens: [
      {
        marca: dados.marca,
        modelo: dados.modelo,
        capacidade: dados.capacidade,
        cor: dados.cor,
        imei: dados.imei,
        codigo: codigoGerado,
        bateria: dados.bateria,
        observacoes: dados.observacoes,
        custo: dados.custo,
        preco: dados.preco,
        condicao: dados.condicao,
      },
    ],
    usuarioNome: dados.usuarioNome,
    dataEntrada: dados.dataEntrada,
    origemIsGroup: opcoes?.origemIsGroup,
    origemRemoteJid: opcoes?.origemRemoteJid,
    origemLabel: 'PV • Foto',
  });

  const rodapeGrupo = notificacaoGrupo.enviado
    ? '\n📢 _Entrada também registrada no grupo de entradas._'
    : '';

  return {
    sucesso: true,
    notificadoGrupoEntradas: notificacaoGrupo.enviado,
    mensagem:
      `✅ *Aparelho cadastrado no estoque pela foto!*\n\n` +
      `${formatarResumoDadosEntradaFoto(dados)}\n` +
      `🏷️ *Código:* \`${codigoGerado}\`${rodapeGrupo}`,
  };
}
