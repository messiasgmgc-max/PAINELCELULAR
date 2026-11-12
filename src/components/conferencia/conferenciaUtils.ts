import { AcaoFaltante, ItemEscaneado, RascunhoConferencia } from './types';
import { sortModelosCronologico, normalizarNomeModelo } from '@/lib/utils';
import { bateriaParaLista } from '@/lib/estoque/listaWhatsapp';

export function getRascunhoKey(lojaId: string | null | undefined, usuarioId: string | null | undefined): string {
  const lId = lojaId || 'default_loja';
  const uId = usuarioId || 'default_user';
  return `phonecenter_conferencia_draft_${lId}_${uId}`;
}

export function salvarRascunho(
  lojaId: string | null | undefined,
  usuarioId: string | null | undefined,
  escaneados: ItemEscaneado[],
  totalEstoque: number
) {
  if (typeof window === 'undefined') return;
  try {
    const key = getRascunhoKey(lojaId, usuarioId);
    const data: RascunhoConferencia = {
      lojaId: lojaId || '',
      usuarioId: usuarioId || '',
      dataAtualizacao: new Date().toISOString(),
      escaneados,
      totalEstoqueSnapshot: totalEstoque,
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {}
}

export function carregarRascunho(
  lojaId: string | null | undefined,
  usuarioId: string | null | undefined
): RascunhoConferencia | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getRascunhoKey(lojaId, usuarioId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function limparRascunho(lojaId: string | null | undefined, usuarioId: string | null | undefined) {
  if (typeof window === 'undefined') return;
  try {
    const key = getRascunhoKey(lojaId, usuarioId);
    localStorage.removeItem(key);
  } catch (e) {}
}

export function playBeepFeedback(somAtivado: boolean) {
  if (!somAtivado || typeof window === 'undefined') return;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {}
}

export function triggerHaptic(tipo: 'sucesso' | 'aviso' | 'erro' = 'sucesso') {
  if (typeof window === 'undefined' || !navigator.vibrate) return;
  try {
    if (tipo === 'sucesso') {
      navigator.vibrate(60);
    } else if (tipo === 'aviso') {
      navigator.vibrate([40, 40, 40]);
    } else {
      navigator.vibrate([80, 50, 80]);
    }
  } catch (e) {}
}

export function exportarResumoCSV(
  confirmados: any[],
  faltantes: any[],
  sobrando: ItemEscaneado[]
) {
  const linhas: string[] = ['Tipo;Modelo;Capacidade;Cor;IMEI;ID;Status'];

  confirmados.forEach((a) => {
    linhas.push(`ENCONTRADO;${a.modelo || ''};${a.capacidade || ''};${a.cor || ''};${a.imei || ''};${a.id || ''};No Estoque`);
  });

  faltantes.forEach((a) => {
    linhas.push(`FALTANTE;${a.modelo || ''};${a.capacidade || ''};${a.cor || ''};${a.imei || ''};${a.id || ''};Não Localizado`);
  });

  sobrando.forEach((s) => {
    linhas.push(`SOBRANDO;Não cadastrado;-;-;${s.codigoLido};-;Fora do Estoque`);
  });

  const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `conferencia_estoque_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const SEGMENTO_TECNICO_CONFERENCIA = /^(ID|IMEI|Bateria|Saúde|Saude|BAIXA_ESTOQUE)\s*:/i;

export function observacaoParaConferencia(observacoes: unknown): string {
  if (typeof observacoes !== 'string' || !observacoes.trim()) return '';

  const semTagsManut = observacoes.replace(/\[MANUTENCAO:[^\]]*\]/gi, '');
  const partes = semTagsManut
    .split(/[\n|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const limpas: string[] = [];
  for (const bruto of partes) {
    if (SEGMENTO_TECNICO_CONFERENCIA.test(bruto)) continue;
    if (/^\d{1,3}\s*%(\s*bat[a-z]*)?$/i.test(bruto)) continue;
    const semRotulo = bruto.replace(/^(obs|observa[cç][aã]o|observa[cç][oõ]es)\s*:\s*/i, '').trim();
    if (semRotulo) limpas.push(semRotulo);
  }

  return limpas.join(' · ');
}

const SECOES_SAIDA: Array<{
  acao: AcaoFaltante;
  titulo: string;
  resumoLabel: string;
}> = [
  { acao: 'vendido', titulo: '🛒 *VENDIDOS - VAREJO*', resumoLabel: 'Venda Varejo' },
  { acao: 'atacado', titulo: '📦 *VENDIDOS - ATACADO*', resumoLabel: 'Atacado' },
  { acao: 'manutencao', titulo: '🛠️ *ENCAMINHADOS PARA MANUTENÇÃO*', resumoLabel: 'Manutenção' },
  { acao: 'remover', titulo: '❌ *BAIXA (EXTRAVIO / PERDA)*', resumoLabel: 'Baixa/Extravio' },
  { acao: 'manter', titulo: '🔄 *MANTIDOS NO ESTOQUE / PENDENTES*', resumoLabel: 'Mantidos/Pendentes' },
];

function formatarLinhaItemConferencia(it: any): string {
  const modelo = normalizarNomeModelo(it.modelo) || it.modelo || 'Aparelho';
  const cap = it.capacidade ? ` · ${it.capacidade}` : '';
  const cor = it.cor ? ` · ${it.cor}` : '';
  const bateria = bateriaParaLista(it);
  const batTxt = bateria ? ` · 🔋 ${bateria}` : '';
  const imei = it.imei
    ? ` · IMEI ...${String(it.imei).slice(-4)}`
    : it.codigo
      ? ` · Cód ${it.codigo}`
      : '';
  const obs = observacaoParaConferencia(it.observacoes);
  const obsTxt = obs ? `\n    📝 _Obs: ${obs}_` : '';
  return `  • *${modelo}*${cap}${cor}${batTxt}${imei}${obsTxt}\n`;
}

export function gerarTextoWhatsAppFaltantes(
  nomeLoja: string,
  totalEstoque: number,
  totalEncontrados: number,
  faltantes: any[],
  acoesFaltantes?: Record<string, AcaoFaltante>
): string {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const horaHoje = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let txt = `📦 *CONFERÊNCIA DE ESTOQUE - ${nomeLoja.toUpperCase()}*\n`;
  txt += `📅 Data: ${dataHoje} às ${horaHoje}\n`;
  txt += `📊 Resumo: ${totalEncontrados} de ${totalEstoque} encontrados (${faltantes.length} faltantes)\n`;

  if (faltantes.length === 0) {
    txt += `\n✅ *ESTOQUE 100% CONFERIDO! NENHUM FALTANTE!*\n`;
    txt += `\n_Relatório gerado pelo Painel Phone Center_`;
    return txt;
  }

  const porAcao: Record<AcaoFaltante, any[]> = {
    vendido: [],
    atacado: [],
    manutencao: [],
    remover: [],
    manter: [],
  };

  for (const f of faltantes) {
    const acao = acoesFaltantes?.[f.id] || 'manter';
    (porAcao[acao] || porAcao.manter).push(f);
  }

  const resumoTipos = SECOES_SAIDA
    .filter((s) => porAcao[s.acao].length > 0)
    .map((s) => `${porAcao[s.acao].length} ${s.resumoLabel}`);

  if (resumoTipos.length > 0) {
    txt += `📋 Saídas: ${resumoTipos.join(' · ')}\n`;
  }

  for (const secao of SECOES_SAIDA) {
    const itens = porAcao[secao.acao];
    if (itens.length === 0) continue;

    const ordenados = [...itens].sort((a, b) =>
      sortModelosCronologico(
        normalizarNomeModelo(a.modelo) || a.modelo || '',
        normalizarNomeModelo(b.modelo) || b.modelo || '',
        'antigo_para_novo'
      )
    );

    txt += `\n${secao.titulo} (${itens.length}):\n`;
    for (const it of ordenados) {
      txt += formatarLinhaItemConferencia(it);
    }
  }

  txt += `\n_Relatório gerado pelo Painel Phone Center_`;
  return txt;
}
