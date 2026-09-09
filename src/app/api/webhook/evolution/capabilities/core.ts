import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RecursoPlano,
  TipoPlano,
  obterPlanoPorTipo,
  obterPlanoMinimoParaRecurso,
  verificarPermissaoRecursoPlano,
  PLANOS_SISTEMA,
} from '@/lib/planos-config';

export type PapelUsuario = 'owner' | 'staff' | 'motoboy' | 'nenhum';

/** Um parâmetro que a IA deve extrair da mensagem do lojista. */
export interface ParametroCapability {
  nome: string;
  descricao: string;
  obrigatorio?: boolean;
}

/** Contexto de execução entregue a cada capacidade. */
export interface ContextoCapability {
  supabase: SupabaseClient;
  lojaId: string;
  nomeLoja: string;
  plano: TipoPlano;
  papel: PapelUsuario;
  telefone: string;
  pushName: string;
  isGroup: boolean;
  /**
   * Delegates para funcionalidades que continuam vivendo no route.ts (consulta
   * de estoque multi-loja e checagem de IMEI), evitando duplicar a lógica.
   */
  delegates?: {
    listarEstoque?: (termo: string) => Promise<string | null>;
    consultarImei?: (imei: string) => Promise<string>;
  };
}

export type ParametrosCapability = Record<string, unknown>;

/**
 * Uma função do sistema que o bot sabe entender e executar.
 *
 * O registro é a fonte única da verdade para três coisas que antes viviam
 * dessincronizadas: o prompt da IA, o gate de plano/permissão na execução e o
 * menu do !ajuda. Adicionar uma capacidade aqui a habilita nos três lugares.
 */
export interface Capability {
  action: string;
  titulo: string;
  descricao: string;
  /** Recurso do plano exigido. A IA nem chega a conhecer ações fora do plano. */
  recurso: RecursoPlano;
  /** Papéis autorizados a executar. */
  papeis: PapelUsuario[];
  /** true quando a ação grava/movimenta dados. */
  escrita: boolean;
  parametros: ParametroCapability[];
  exemplos: string[];
  /** Atalho !comando equivalente, quando existir. */
  atalho?: string;
  executar: (ctx: ContextoCapability, params: ParametrosCapability) => Promise<string>;
}

// ── Utilidades de leitura de parâmetros ───────────────────────────────────

export function texto(params: ParametrosCapability, ...chaves: string[]): string {
  for (const chave of chaves) {
    const valor = params[chave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      return String(valor).trim();
    }
  }
  return '';
}

export function numero(params: ParametrosCapability, ...chaves: string[]): number {
  for (const chave of chaves) {
    const bruto = params[chave];
    if (bruto === undefined || bruto === null || bruto === '') continue;
    // Aceita "2.500,00", "2500.00" e "R$ 2500"
    const limpo = String(bruto)
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.');
    const n = Number(limpo);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function moeda(valor: number): string {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

export function dataBr(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

/** Descreve um aparelho a partir de qualquer subconjunto de colunas presentes. */
export function descreverAparelho(ap: Record<string, unknown>): string {
  const partes = [ap.marca, ap.modelo, ap.capacidade, ap.cor]
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean);
  return partes.join(' ') || 'Aparelho';
}

// ── Resultado da tentativa de execução ────────────────────────────────────

export type ResultadoExecucao =
  | { ok: true; resposta: string }
  | { ok: false; motivo: 'plano'; resposta: string; recurso: RecursoPlano; planoMinimo: TipoPlano }
  | { ok: false; motivo: 'permissao' | 'desconhecida' | 'erro'; resposta: string };

const registro = new Map<string, Capability>();

export function registrarCapability(cap: Capability): void {
  registro.set(cap.action, cap);
}

export function registrarCapabilities(caps: Capability[]): void {
  caps.forEach(registrarCapability);
}

export function obterCapability(action: string): Capability | undefined {
  return registro.get(action);
}

export function todasCapabilities(): Capability[] {
  return [...registro.values()];
}

/**
 * Capacidades que este lojista realmente pode usar agora, dado o plano dele e o
 * papel de quem está falando. É esta lista que alimenta o prompt da IA — então
 * a IA não propõe ações que o plano não cobre.
 */
export function capabilitiesDisponiveis(plano: TipoPlano, papel: PapelUsuario): Capability[] {
  return todasCapabilities().filter(
    (cap) => verificarPermissaoRecursoPlano(plano, cap.recurso) && cap.papeis.includes(papel)
  );
}

/** Capacidades bloqueadas apenas por causa do plano (viram argumento de upsell). */
export function capabilitiesBloqueadasPorPlano(plano: TipoPlano, papel: PapelUsuario): Capability[] {
  return todasCapabilities().filter(
    (cap) => !verificarPermissaoRecursoPlano(plano, cap.recurso) && cap.papeis.includes(papel)
  );
}

function mensagemUpgrade(cap: Capability): string {
  const planoMinimo = obterPlanoMinimoParaRecurso(cap.recurso);
  const nomePlano = PLANOS_SISTEMA[planoMinimo].nome;
  const valor = PLANOS_SISTEMA[planoMinimo].precos.mensal.valorMensal;
  return (
    `🔒 *${cap.titulo}* faz parte do plano *${nomePlano}*.\n\n` +
    `Seu plano atual não inclui esse recurso. O ${nomePlano} sai por ${moeda(valor)}/mês ` +
    `e libera esta e outras funções.\n\n` +
    `Digite *!plano* para ver os detalhes e assinar.`
  );
}

/**
 * Executa uma capacidade aplicando, nesta ordem: existência, gate de plano,
 * gate de papel e execução. Erros do executor não derrubam o webhook.
 */
export async function executarCapability(
  action: string,
  ctx: ContextoCapability,
  params: ParametrosCapability
): Promise<ResultadoExecucao> {
  const cap = registro.get(action);
  if (!cap) {
    return { ok: false, motivo: 'desconhecida', resposta: '' };
  }

  if (!verificarPermissaoRecursoPlano(ctx.plano, cap.recurso)) {
    return {
      ok: false,
      motivo: 'plano',
      resposta: mensagemUpgrade(cap),
      recurso: cap.recurso,
      planoMinimo: obterPlanoMinimoParaRecurso(cap.recurso),
    };
  }

  if (!cap.papeis.includes(ctx.papel)) {
    return {
      ok: false,
      motivo: 'permissao',
      resposta:
        `⚠️ *Acesso restrito:* a ação *${cap.titulo}* é liberada apenas para ` +
        `${cap.papeis.filter((p) => p !== 'nenhum').join(' / ')} da loja.`,
    };
  }

  try {
    const resposta = await cap.executar(ctx, params);
    return { ok: true, resposta };
  } catch (err) {
    console.error(`[Capability:${action}] Falha na execução:`, err);
    return {
      ok: false,
      motivo: 'erro',
      resposta: `⚠️ Não consegui concluir *${cap.titulo}* agora. Tente novamente em instantes.`,
    };
  }
}

// ── Geração do prompt da IA a partir do registro ──────────────────────────

/**
 * Monta a seção de ações do system prompt do Gemini contendo apenas o que o
 * plano do lojista libera. Antes essa lista era um texto fixo que precisava ser
 * editado à mão sempre que uma ação era criada — e que oferecia ao lojista
 * ações que ele não podia executar.
 */
export function montarSecaoAcoesPrompt(caps: Capability[]): string {
  if (caps.length === 0) return 'Nenhuma ação operacional disponível para este plano.';

  const linhas = caps.map((cap) => {
    const params = cap.parametros
      .map((p) => (p.obrigatorio ? `${p.nome}*` : p.nome))
      .join(', ');
    return `- "${cap.action}": ${cap.descricao} (params: ${params || 'nenhum'}).`;
  });

  const exemplos = caps
    .filter((cap) => cap.exemplos.length > 0)
    .flatMap((cap) => cap.exemplos.map((ex) => `- ${cap.action}: ${ex}`));

  return (
    `AÇÕES DISPONÍVEIS (parâmetros com * são obrigatórios):\n${linhas.join('\n')}\n\n` +
    `EXEMPLOS:\n${exemplos.join('\n')}`
  );
}

const TITULO_RECURSO: Partial<Record<RecursoPlano, string>> = {
  estoque: '📦 Estoque',
  vendas: '💰 Vendas & Financeiro',
  os: '🔧 Serviços, Peças e Agenda',
  fiado_devedores: '💳 Fiado & Cobrança',
  consulta_imei: '🔎 Consulta de IMEI',
  broadcast_grupos: '📢 Disparos em Grupo',
  escuta_multiloja: '🌐 Rede Multi-Loja',
};

/** Menu do !ajuda montado a partir do que o plano do lojista libera. */
export function montarMenuAjuda(plano: TipoPlano, papel: PapelUsuario): string {
  const disponiveis = capabilitiesDisponiveis(plano, papel);
  const bloqueadas = capabilitiesBloqueadasPorPlano(plano, papel);
  const nomePlano = obterPlanoPorTipo(plano).nome;

  const porRecurso = new Map<RecursoPlano, Capability[]>();
  disponiveis.forEach((cap) => {
    const lista = porRecurso.get(cap.recurso) || [];
    lista.push(cap);
    porRecurso.set(cap.recurso, lista);
  });

  const secoes = [...porRecurso.entries()].map(([recurso, caps]) => {
    const itens = caps
      .map((cap) => `• ${cap.titulo}${cap.atalho ? ` — *${cap.atalho}*` : ''}`)
      .join('\n');
    return `*${TITULO_RECURSO[recurso] || recurso}*\n${itens}`;
  });

  let texto =
    `🤖 *Copiloto Phone Center* — plano *${nomePlano}*\n\n` +
    `Fale comigo em linguagem natural ("vendi o 13 pro pro Lucas por 2500") ` +
    `ou use os atalhos abaixo.\n\n` +
    secoes.join('\n\n');

  if (bloqueadas.length > 0) {
    const nomes = [...new Set(bloqueadas.map((c) => c.titulo))].slice(0, 8).join(', ');
    texto += `\n\n🔒 *Disponível em planos superiores:* ${nomes}.\nDigite *!plano* para liberar.`;
  }

  return texto;
}
