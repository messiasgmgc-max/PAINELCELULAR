import { Venda } from '@/lib/db/types';

export const POS_MODAL_CLOSE_MS = 220;
export const SALE_SUCCESS_MS = 1350;
export const SALE_EMOJIS = ['🎉', '🥳', '💰', '✨', '🚀', '🔥'];

export const createPagamentoItem = (overrides: Partial<import('../types').PosPagamentoItem> = {}): import('../types').PosPagamentoItem => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  metodo: 'dinheiro',
  valor: 0,
  parcelas: 1,
  ...overrides,
});

export const createInitialPosPagamento = (): import('../types').PosPagamentoState => ({
  metodo: 'dinheiro',
  parcelas: 1,
  detalhes: '',
  valorPago: 0,
  status: 'pago',
  garantia: '90 dias',
  descontoGlobal: 0,
  tipoDescontoGlobal: 'R$',
  pagamentos: [createPagamentoItem()],
});

export const playSaleSuccessSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [
      { freq: 523.25, time: 0, duration: 0.12 }, // C5
      { freq: 659.25, time: 0.1, duration: 0.12 }, // E5
      { freq: 783.99, time: 0.2, duration: 0.15 }, // G5
      { freq: 1046.50, time: 0.32, duration: 0.35 }, // C6
    ];

    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + duration);
    });
  } catch (err) {
    console.log('Audio playback prevented or unsupported:', err);
  }
};

export const formatarDataSegura = (dataIso?: string | null) => {
  if (!dataIso) return { data: '-', hora: '' };
  try {
    const date = new Date(dataIso);
    if (isNaN(date.getTime())) return { data: '-', hora: '' };
    return {
      data: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      hora: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { data: '-', hora: '' };
  }
};

export const formatarMoeda = (valor: number) => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
