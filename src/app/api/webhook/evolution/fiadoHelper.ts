// Helper para consolidação exata de fiado da loja (lojistas_devedores + vendas em aberto)

export interface DevedorConsolidado {
  nome: string;
  saldo: number;
  telefone?: string;
  whatsapp?: string;
  origem: 'cadastro' | 'venda_fiado' | 'ambos';
}

export interface ResultadoFiadoLoja {
  totalFiadoEmAberto: number;
  devedores: DevedorConsolidado[];
  detalhesDevedoresFormatado: string;
}

export function consolidarFiadoLoja(
  devedoresCadastrados: Array<{
    nome?: string | null;
    saldo_devedor?: number | null;
    telefone?: string | null;
    whatsapp?: string | null;
  }> | null | undefined,
  vendasPendentes: Array<{
    clienteNome?: string | null;
    valor?: number | null;
    valorPago?: number | null;
    saldoDevedor?: number | null;
    metodo?: string | null;
    status?: string | null;
    tipoEntrega?: string | null;
    descricao?: string | null;
  }> | null | undefined
): ResultadoFiadoLoja {
  const mapa = new Map<string, DevedorConsolidado>();

  // 1. Processa devedores cadastrados formalmente
  (devedoresCadastrados || []).forEach((d) => {
    const nomeLimpo = (d.nome || '').trim();
    const saldo = Number(d.saldo_devedor || 0);
    if (!nomeLimpo) return;

    const chave = nomeLimpo.toLowerCase();
    mapa.set(chave, {
      nome: nomeLimpo,
      saldo: Math.max(0, saldo),
      telefone: d.telefone || undefined,
      whatsapp: d.whatsapp || undefined,
      origem: 'cadastro',
    });
  });

  // 2. Processa vendas atacado / fiado / pendentes do banco
  (vendasPendentes || []).forEach((v) => {
    const tipoEntregaLower = String(v.tipoEntrega || '').toLowerCase();
    const descLower = String(v.descricao || '').toLowerCase();
    
    // Ignora vendas explicitamente marcadas apenas como varejo sem atacado
    const isVarejo = tipoEntregaLower.includes('varejo') || (descLower.includes('varejo') && !descLower.includes('atacado'));
    if (isVarejo) return;

    const isFiado = v.metodo === 'fiado';
    const isPendente = v.status === 'pendente' || v.status === 'parcial';
    if (!isFiado && !isPendente) return;

    const total = Number(v.valor || 0);
    const pago = Number(v.valorPago || 0);

    let devedor = 0;
    if (v.saldoDevedor !== undefined && v.saldoDevedor !== null && Number(v.saldoDevedor) > 0) {
      devedor = Number(v.saldoDevedor);
    } else {
      devedor = Math.max(0, total - pago);
      if (devedor <= 0 && isFiado && v.status !== 'pago') devedor = total;
      if (isFiado && pago === 0) devedor = total;
    }

    if (devedor > 0.01) {
      const nomeCliente = (v.clienteNome || 'Lojista / Revenda').trim();
      const chave = nomeCliente.toLowerCase();

      if (mapa.has(chave)) {
        const existente = mapa.get(chave)!;
        existente.saldo += devedor;
        existente.origem = 'ambos';
      } else {
        mapa.set(chave, {
          nome: nomeCliente,
          saldo: devedor,
          origem: 'venda_fiado',
        });
      }
    }
  });

  // 3. Filtra apenas quem tem saldo > 0.01 e ordena do maior devedor para o menor
  const devedores = Array.from(mapa.values())
    .filter((d) => d.saldo > 0.01)
    .sort((a, b) => b.saldo - a.saldo);

  const totalFiadoEmAberto = devedores.reduce((acc, d) => acc + d.saldo, 0);

  const detalhesDevedoresFormatado = devedores.length > 0
    ? devedores
        .slice(0, 10)
        .map((d) => `• *${d.nome}:* R$ ${d.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join('\n')
    : 'Nenhum lojista com débitos em aberto no momento.';

  return {
    totalFiadoEmAberto,
    devedores,
    detalhesDevedoresFormatado,
  };
}

export async function buscarFiadoConsolidadoLoja(
  supabase: any,
  lojaId: string
): Promise<ResultadoFiadoLoja> {
  if (!lojaId) {
    return {
      totalFiadoEmAberto: 0,
      devedores: [],
      detalhesDevedoresFormatado: 'Nenhum lojista com débitos.',
    };
  }

  // Busca devedores cadastrados
  const { data: devedoresCadastrados } = await supabase
    .from('lojistas_devedores')
    .select('nome, saldo_devedor, telefone, whatsapp')
    .eq('loja_id', lojaId)
    .eq('ativo', true);

  // Busca vendas fiado/pendente
  const { data: vendasPendentes } = await supabase
    .from('vendas')
    .select('clienteNome, valor, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao')
    .eq('loja_id', lojaId)
    .or('metodo.eq.fiado,status.eq.pendente,status.eq.parcial');

  return consolidarFiadoLoja(devedoresCadastrados, vendasPendentes);
}
