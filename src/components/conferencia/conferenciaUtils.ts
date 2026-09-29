import { ItemEscaneado, RascunhoConferencia } from './types';

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

export function gerarTextoWhatsAppFaltantes(
  nomeLoja: string,
  totalEstoque: number,
  totalEncontrados: number,
  faltantes: any[]
): string {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const horaHoje = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let txt = `📦 *CONFERÊNCIA DE ESTOQUE - ${nomeLoja.toUpperCase()}*\n`;
  txt += `📅 Data: ${dataHoje} às ${horaHoje}\n`;
  txt += `📊 Resumo: ${totalEncontrados} de ${totalEstoque} encontrados (${faltantes.length} faltantes)\n\n`;

  if (faltantes.length === 0) {
    txt += `✅ *ESTOQUE 100% CONFERIDO! NENHUM FALTANTE!*\n`;
    return txt;
  }

  txt += `⚠️ *APARELHOS FALTANTES (${faltantes.length}):*\n`;

  // Agrupa faltantes por modelo
  const map: Record<string, any[]> = {};
  faltantes.forEach((f) => {
    const mod = f.modelo || 'Outros';
    if (!map[mod]) map[mod] = [];
    map[mod].push(f);
  });

  Object.entries(map).forEach(([modelo, itens]) => {
    txt += `\n🔹 *${modelo}* (${itens.length} un):\n`;
    itens.forEach((it) => {
      const imei = it.imei ? ` · IMEI final: ...${String(it.imei).slice(-4)}` : '';
      const cap = it.capacidade ? ` · ${it.capacidade}` : '';
      const cor = it.cor ? ` · ${it.cor}` : '';
      txt += `  - ${it.modelo}${cap}${cor}${imei}\n`;
    });
  });

  txt += `\n_Relatório gerado pelo Painel Phone Center_`;
  return txt;
}
