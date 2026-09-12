/**
 * Linha do tempo de um registro a partir de public.auditoria
 * (supabase/migrations/20260913_dados_auditoria.sql): o que mudou, quem, de
 * onde e quando, pronto para a visão "Auditoria" da tela de Logs.
 */

export const TABELAS_AUDITADAS = ['aparelhos', 'vendas', 'clientes', 'ordens_servico', 'lojistas_devedores'] as const;
export type TabelaAuditada = (typeof TABELAS_AUDITADAS)[number];

export const ROTULO_TABELA: Record<string, string> = {
  aparelhos: 'Aparelho',
  vendas: 'Venda',
  clientes: 'Cliente',
  ordens_servico: 'Ordem de serviço',
  lojistas_devedores: 'Lojista (fiado)',
};

export const ROTULO_OPERACAO: Record<string, string> = {
  INSERT: 'Criado',
  UPDATE: 'Alterado',
  DELETE: 'Apagado',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMEI = /^\d{14,16}$/;

/** Campos que mudam sozinhos ou não interessam na comparação. */
const CAMPOS_OCULTOS = new Set(['updated_at']);

export type TipoBusca = 'imei' | 'registro' | 'texto' | 'vazia';

export interface BuscaAuditoria {
  tipo: TipoBusca;
  valor: string;
}

/** Classifica o que a pessoa digitou: IMEI, id de registro ou texto (nome/cliente). */
export function classificarBusca(termo: string | null | undefined): BuscaAuditoria {
  const valor = (termo || '').trim();
  if (!valor) return { tipo: 'vazia', valor: '' };
  const soDigitos = valor.replace(/[\s.-]/g, '');
  if (IMEI.test(soDigitos)) return { tipo: 'imei', valor: soDigitos };
  if (UUID.test(valor)) return { tipo: 'registro', valor: valor.toLowerCase() };
  return { tipo: 'texto', valor: valor.slice(0, 80) };
}

function escaparIlike(texto: string): string {
  return `%${texto.replace(/[,()"'\\%_]/g, ' ').replace(/\s+/g, ' ').trim()}%`;
}

/**
 * Filtro `.or()` do PostgREST para a busca. IMEI procura no antes e no depois
 * (aparelho apagado continua achável) e no IMEI da OS; texto procura em nome,
 * cliente, modelo e e-mail de quem mexeu.
 */
export function filtroBuscaAuditoria(busca: BuscaAuditoria): string | null {
  switch (busca.tipo) {
    case 'imei':
      return [`depois->>imei.eq.${busca.valor}`, `antes->>imei.eq.${busca.valor}`, `depois->>numeroSerie.eq.${busca.valor}`].join(',');
    case 'registro':
      return `registro_id.eq.${busca.valor}`;
    case 'texto': {
      const padrao = escaparIlike(busca.valor);
      if (padrao === '%%') return null;
      return ['depois->>nome', 'antes->>nome', 'depois->>clienteNome', 'antes->>clienteNome', 'depois->>modelo', 'usuario_email']
        .map((c) => `${c}.ilike.${padrao}`)
        .join(',');
    }
    default:
      return null;
  }
}

export interface LinhaAuditoria {
  id: number | string;
  loja_id: string | null;
  tabela: string;
  registro_id: string | null;
  operacao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  campos_alterados: string[] | null;
  usuario_id: string | null;
  usuario_email: string | null;
  origem: string | null;
  lote_id: string | null;
  criado_em: string;
}

export interface MudancaCampo {
  campo: string;
  antes: string;
  depois: string;
}

export interface EventoAuditoria {
  id: string;
  tabela: string;
  tabelaRotulo: string;
  registroId: string | null;
  operacao: string;
  operacaoRotulo: string;
  titulo: string;
  mudancas: MudancaCampo[];
  quem: string;
  origem: string;
  loteId: string | null;
  quando: string;
  lojaId: string | null;
}

/** Valor curto e legível para a tabela de antes → depois. */
export function formatarValorAuditoria(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (typeof valor === 'number') return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace('.', ',');
  if (typeof valor === 'string') {
    const data = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor) ? new Date(valor) : null;
    if (data && !Number.isNaN(data.getTime())) return data.toLocaleString('pt-BR');
    return valor.length > 120 ? `${valor.slice(0, 117)}...` : valor;
  }
  if (Array.isArray(valor)) return valor.length === 0 ? '(vazio)' : `${valor.length} item(ns)`;
  const texto = JSON.stringify(valor);
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
}

function primeiroTexto(objeto: Record<string, unknown> | null, chaves: string[]): string {
  if (!objeto) return '';
  for (const chave of chaves) {
    const v = objeto[chave];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** Descrição curta do registro: "iPhone 13 128GB · IMEI 3580...", "Venda R$ 4.400,00 — Maria". */
export function tituloDoRegistro(tabela: string, linha: Record<string, unknown> | null): string {
  if (!linha) return ROTULO_TABELA[tabela] || tabela;
  switch (tabela) {
    case 'aparelhos': {
      const nome = ['marca', 'modelo', 'capacidade', 'cor'].map((c) => primeiroTexto(linha, [c])).filter(Boolean).join(' ');
      const imei = primeiroTexto(linha, ['imei']);
      return [nome || 'Aparelho', imei ? `IMEI ${imei}` : ''].filter(Boolean).join(' · ');
    }
    case 'vendas': {
      const valor = typeof linha.valor === 'number' ? linha.valor : Number(linha.valor);
      const valorTexto = Number.isFinite(valor) ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
      const cliente = primeiroTexto(linha, ['clienteNome']);
      return ['Venda', valorTexto, cliente ? `— ${cliente}` : ''].filter(Boolean).join(' ');
    }
    case 'clientes':
      return `Cliente ${primeiroTexto(linha, ['nome'])}`.trim();
    case 'ordens_servico': {
      const numero = primeiroTexto(linha, ['numeroOS']);
      const cliente = primeiroTexto(linha, ['clienteNome']);
      return ['OS', numero ? `#${numero}` : '', cliente ? `— ${cliente}` : ''].filter(Boolean).join(' ');
    }
    case 'lojistas_devedores':
      return `Lojista ${primeiroTexto(linha, ['nome'])}`.trim();
    default:
      return ROTULO_TABELA[tabela] || tabela;
  }
}

/** Lista antes → depois só dos campos que mudaram (INSERT mostra os preenchidos, DELETE os que existiam). */
export function listarMudancas(linha: Pick<LinhaAuditoria, 'operacao' | 'antes' | 'depois' | 'campos_alterados'>): MudancaCampo[] {
  const antes = linha.antes || {};
  const depois = linha.depois || {};
  let campos: string[];
  if (linha.operacao === 'UPDATE') {
    campos = linha.campos_alterados?.length
      ? linha.campos_alterados
      : Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]));
  } else {
    const origem = linha.operacao === 'DELETE' ? antes : depois;
    campos = Object.keys(origem).filter((c) => origem[c] !== null && origem[c] !== undefined && origem[c] !== '');
  }
  return campos
    .filter((c) => !CAMPOS_OCULTOS.has(c))
    .sort()
    .map((campo) => ({ campo, antes: formatarValorAuditoria(antes[campo]), depois: formatarValorAuditoria(depois[campo]) }));
}

const ORIGENS_CONHECIDAS: Record<string, string> = {
  web: 'Painel (navegador)',
  servidor: 'Servidor',
  bot: 'Bot do WhatsApp',
  pdv: 'PDV',
  importacao: 'Importação',
  migracao_numeracao_os: 'Migração (numeração de OS)',
};

export function rotuloOrigem(origem: string | null | undefined): string {
  const o = (origem || '').trim();
  if (!o) return 'Não informada';
  return ORIGENS_CONHECIDAS[o.toLowerCase()] || o;
}

export function montarEvento(linha: LinhaAuditoria): EventoAuditoria {
  const referencia = linha.operacao === 'DELETE' ? linha.antes : linha.depois;
  const origem = (linha.origem || '').toLowerCase();
  return {
    id: String(linha.id),
    tabela: linha.tabela,
    tabelaRotulo: ROTULO_TABELA[linha.tabela] || linha.tabela,
    registroId: linha.registro_id,
    operacao: linha.operacao,
    operacaoRotulo: ROTULO_OPERACAO[linha.operacao] || linha.operacao,
    titulo: tituloDoRegistro(linha.tabela, referencia),
    mudancas: listarMudancas(linha),
    quem: linha.usuario_email || (origem === 'servidor' || origem === 'bot' ? 'Sistema' : 'Não identificado'),
    origem: rotuloOrigem(linha.origem),
    loteId: linha.lote_id,
    quando: linha.criado_em,
    lojaId: linha.loja_id,
  };
}

/** Eventos mais recentes primeiro, com desempate estável pelo id. */
export function montarLinhaDoTempo(linhas: LinhaAuditoria[]): EventoAuditoria[] {
  return [...linhas]
    .sort((a, b) => {
      const dif = new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
      return dif !== 0 ? dif : Number(b.id) - Number(a.id);
    })
    .map(montarEvento);
}
