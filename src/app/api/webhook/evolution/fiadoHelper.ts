// Helper consolidado para gestão e extrato de fiado da loja (vendas + baixas de aparelhos + lojistas_devedores)
import { sanitizarTextoWhatsApp } from '@/lib/whatsappFormatting';

export interface ItemExtrato {
  descricao: string;
  modelo?: string;
  cor?: string;
  capacidade?: string;
  imei?: string;
  aparelhoId?: string;
  valor: number;
}

export interface PedidoExtrato {
  id: string;
  descricao: string;
  data: string;
  valorTotal: number;
  valorPago: number;
  saldoDevedor: number;
  itens: ItemExtrato[];
  origem: 'vendas' | 'aparelhos_baixa';
}

export interface ExtratoLojista {
  lojistaNome: string;
  telefone?: string;
  pedidos: PedidoExtrato[];
  totalComprado: number;
  totalPago: number;
  saldoDevedor: number;
  totalAparelhos: number;
  textoFormatado: string;
}

export interface DevedorConsolidado {
  nome: string;
  saldo: number;
  totalAparelhos: number;
  telefone?: string;
  whatsapp?: string;
  pedidos: PedidoExtrato[];
}

export interface ResultadoFiadoLoja {
  totalFiadoEmAberto: number;
  devedores: DevedorConsolidado[];
  detalhesDevedoresFormatado: string;
}

function parseMonetaryValue(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  let clean = raw.toString().replace(/[^\d.,]/g, '').trim();
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  return parseFloat(clean) || 0;
}

export function consolidarFiadoCompleto(
  devedoresCadastrados: any[] | null | undefined,
  vendasBanco: any[] | null | undefined,
  aparelhos: any[] | null | undefined,
  nomeLoja: string = 'Lucas Imports',
  chavePix: string = ''
): ResultadoFiadoLoja {
  const mapaDevedores = new Map<string, {
    nome: string;
    telefone?: string;
    whatsapp?: string;
    pedidos: PedidoExtrato[];
  }>();

  const aparelhosJaEmVendas = new Set<string>();
  const imeisJaEmVendas = new Set<string>();

  // 1. Mapeia de antemão todos os aparelhos e IMEIs que já constam em vendas do banco
  // Isso impede que baixas avulsas de estoque antigas reabram débitos de aparelhos já quitados em vendas
  (vendasBanco || []).forEach((v) => {
    if (v.itens && Array.isArray(v.itens)) {
      v.itens.forEach((it: any) => {
        if (it.aparelhoId) aparelhosJaEmVendas.add(String(it.aparelhoId));
        if (it.id) aparelhosJaEmVendas.add(String(it.id));
        let imei = it.imei ? String(it.imei).trim() : '';
        if (!imei && it.descricao) {
          const mId = it.descricao.match(/(?:IMEI\/ID|ID|IMEI):\s*([A-Za-z0-9]+)/i);
          if (mId) imei = mId[1];
        }
        if (imei) imeisJaEmVendas.add(imei.toLowerCase());
      });
    }
  });

  // 2. Inicializa com devedores cadastrados
  (devedoresCadastrados || []).forEach((d) => {
    const nomeLimpo = (d.nome || '').trim();
    if (!nomeLimpo) return;
    const chave = nomeLimpo.toLowerCase();
    mapaDevedores.set(chave, {
      nome: nomeLimpo,
      telefone: d.telefone || undefined,
      whatsapp: d.whatsapp || undefined,
      pedidos: [],
    });
  });

  // 3. Processa vendas da tabela vendas
  (vendasBanco || []).forEach((v) => {
    const tipoEntregaLower = String(v.tipoEntrega || '').toLowerCase();
    const descLower = String(v.descricao || '').toLowerCase();
    const isVarejo = tipoEntregaLower.includes('varejo') || (descLower.includes('varejo') && !descLower.includes('atacado'));
    if (isVarejo) return;

    const isFiado = v.metodo === 'fiado';
    const isPendente = v.status === 'pendente' || v.status === 'parcial';
    if (!isFiado && !isPendente) return;

    const clienteNome = (v.clienteNome || 'Lojista / Revenda').trim();
    const chave = clienteNome.toLowerCase();
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
      if (!mapaDevedores.has(chave)) {
        mapaDevedores.set(chave, {
          nome: clienteNome,
          pedidos: [],
        });
      }

      const itensFmt: ItemExtrato[] = [];
      if (v.itens && Array.isArray(v.itens) && v.itens.length > 0) {
        v.itens.forEach((it: any) => {
          let imei = it.imei ? String(it.imei).trim() : '';
          if (!imei && it.descricao) {
            const mId = it.descricao.match(/(?:IMEI\/ID|ID|IMEI):\s*([A-Za-z0-9]+)/i);
            if (mId) imei = mId[1];
          }

          itensFmt.push({
            descricao: it.descricao || it.modelo || 'Aparelho',
            modelo: it.modelo,
            cor: it.cor,
            capacidade: it.capacidade,
            imei: imei || undefined,
            aparelhoId: it.aparelhoId || it.id,
            valor: Number(it.total || it.valorExibir || v.valor || 0),
          });
        });
      } else {
        itensFmt.push({
          descricao: v.descricao || 'Aparelho',
          valor: devedor,
        });
      }

      mapaDevedores.get(chave)!.pedidos.push({
        id: v.id,
        descricao: v.descricao || 'Venda ATACADO',
        data: v.dataPagamento || v.data || v.dataVencimento || new Date().toISOString(),
        valorTotal: total,
        valorPago: pago,
        saldoDevedor: devedor,
        itens: itensFmt,
        origem: 'vendas',
      });
    }
  });

  // 3. Processa aparelhos vendidos em atacado a fiado via baixa de estoque
  (aparelhos || []).forEach((a) => {
    const obs = String(a.observacoes || '');
    if (!obs.includes('BAIXA_ESTOQUE')) return;

    const matchBaixa = obs.match(/BAIXA_ESTOQUE:([^:]+(?::\d{2}(?::\d{2})?(?:\.\d+)?(?:Z)?)?):([\s\S]*)$/i)
      || obs.match(/BAIXA_ESTOQUE:([^:]+):([\s\S]*)$/i);
    if (!matchBaixa) return;

    const textoDetalhe = matchBaixa[2] || '';
    const matchTipo = textoDetalhe.match(/Venda (ATACADO|VAREJO)/i);
    const matchComp = textoDetalhe.match(/(?:Comprador:\s*([^|\n]+)|para\s+([^|\n]+?)\s+por\s+R\$)/i);
    const matchVal = textoDetalhe.match(/(?:Valor:\s*R\$|por\s*R\$)\s*([\d.,]+)/i);
    const matchPgto = textoDetalhe.match(/Pgto:\s*([^|\n]+)/i);

    const ehAtacado = (matchTipo && matchTipo[1].toUpperCase() === 'ATACADO') || obs.toUpperCase().includes('ATACADO');
    if (!ehAtacado) return;

    const metodoPgto = matchPgto ? matchPgto[1].trim().toLowerCase() : '';
    if (!metodoPgto.includes('fiado') || metodoPgto.includes('quitado')) return;

    const comprador = (matchComp ? (matchComp[1] || matchComp[2] || '') : '').trim();
    if (!comprador || comprador === 'Não Informado' || comprador === 'Lojista / Revenda') return;
    const chave = comprador.toLowerCase();

    let imeiLimpo = (a.imei || '').trim();
    if (!imeiLimpo) {
      const matchImei = obs.match(/IMEI:\s*([A-Za-z0-9]+)/i);
      if (matchImei) imeiLimpo = matchImei[1];
    }

    // Se já estiver nas vendas do banco pelo ID ou pelo IMEI, não duplica!
    if (a.id && aparelhosJaEmVendas.has(String(a.id))) return;
    if (imeiLimpo && imeisJaEmVendas.has(imeiLimpo.toLowerCase())) return;

    let valorVenda = 0;
    if (matchVal) {
      valorVenda = parseMonetaryValue(matchVal[1]);
    } else {
      valorVenda = Number(a.precoAtacado || a.preco || 0);
    }

    if (!mapaDevedores.has(chave)) {
      mapaDevedores.set(chave, {
        nome: comprador,
        pedidos: [],
      });
    }

    const itemAparelho: ItemExtrato = {
      descricao: `${a.marca || 'Apple'} ${a.modelo}`,
      modelo: a.modelo,
      cor: a.cor,
      capacidade: a.capacidade,
      imei: imeiLimpo || undefined,
      aparelhoId: a.id,
      valor: valorVenda,
    };

    mapaDevedores.get(chave)!.pedidos.push({
      id: a.id,
      descricao: `${a.marca || 'Apple'} ${a.modelo} (${[a.capacidade, a.cor].filter(Boolean).join(' ')})`,
      data: matchBaixa[1] || a.dataCadastro || new Date().toISOString(),
      valorTotal: valorVenda,
      valorPago: 0,
      saldoDevedor: valorVenda,
      itens: [itemAparelho],
      origem: 'aparelhos_baixa',
    });
  });

  // 4. Consolida saldo e monta lista final
  const devedores: DevedorConsolidado[] = [];

  mapaDevedores.forEach((entry, chave) => {
    let saldoCalculado = entry.pedidos.reduce((acc, p) => acc + p.saldoDevedor, 0);

    let totalAps = 0;
    entry.pedidos.forEach((p) => {
      totalAps += Math.max(1, p.itens.length);
    });

    const devCadastrado = (devedoresCadastrados || []).find(
      (d) => (d.nome || '').trim().toLowerCase() === chave
    );
    const saldoFinal = saldoCalculado > 0 ? saldoCalculado : Number(devCadastrado?.saldo_devedor || 0);

    if (saldoFinal > 0.01) {
      devedores.push({
        nome: entry.nome,
        telefone: entry.telefone,
        whatsapp: entry.whatsapp,
        saldo: saldoFinal,
        totalAparelhos: totalAps,
        pedidos: entry.pedidos,
      });
    }
  });

  // Ordena por maior saldo devedor
  devedores.sort((a, b) => b.saldo - a.saldo);

  const totalFiadoEmAberto = devedores.reduce((acc, d) => acc + d.saldo, 0);

  const detalhesDevedoresFormatado = devedores.length > 0
    ? devedores.map((d) => {
        const pedDet = d.pedidos
          .map((p) => {
            const itensTxt = p.itens
              .map((it) => `    - ${it.descricao}: R$ ${Number(it.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
              .join('\n');
            return `  • Pedido ${p.id.toString().slice(0, 8)} (${p.descricao}): R$ ${Number(p.saldoDevedor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n${itensTxt}`;
          })
          .join('\n');
        return `• ${d.nome}: R$ ${d.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${d.totalAparelhos} aparelhos em aberto)\n${pedDet}`;
      }).join('\n\n')
    : 'Nenhum lojista devedor no momento';

  return {
    totalFiadoEmAberto,
    devedores,
    detalhesDevedoresFormatado,
  };
}

export const consolidarFiadoLoja = consolidarFiadoCompleto;

export function formatarTextoExtrato(
  lojista: DevedorConsolidado,
  nomeLoja: string = 'Lucas Imports',
  chavePix: string = ''
): string {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const saldoFmt = lojista.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lojaLimpa = (nomeLoja || 'Lucas Imports').trim().replace(/^\*+|\*+$/g, '');
  const lojistaLimpo = (lojista.nome || 'Parceiro').trim().replace(/^\*+|\*+$/g, '');

  let msg = `📋 *Extrato - ${lojaLimpa}*\n`;
  msg += `👤 Lojista: *${lojistaLimpo}* (${dataHoje})\n\n`;

  if (lojista.pedidos.length === 0) {
    msg += `📦 Débito em aberto: R$ ${saldoFmt}\n\n`;
  } else {
    const itensExtrato: { desc: string; imei?: string; valor: number }[] = [];

    lojista.pedidos.forEach((p) => {
      if (p.itens && p.itens.length > 0) {
        p.itens.forEach((it) => {
          let desc = (it.descricao || it.modelo || 'Aparelho').trim().replace(/^Apple\s+/i, '');
          const corCap = [it.capacidade, it.cor].filter(Boolean).join(' ');
          if (corCap && !desc.includes(it.capacidade || '')) {
            desc += ` ${corCap}`;
          }

          let imeiCurto = '';
          if (it.imei) {
            const rawIm = String(it.imei).trim();
            imeiCurto = rawIm.length > 6 ? rawIm.slice(-6) : rawIm;
          }

          itensExtrato.push({
            desc,
            imei: imeiCurto || undefined,
            valor: Number(it.valor || p.saldoDevedor || 0),
          });
        });
      } else {
        itensExtrato.push({
          desc: p.descricao.trim().replace(/^Apple\s+/i, ''),
          valor: p.saldoDevedor,
        });
      }
    });

    msg += `📦 *Aparelhos em aberto (${itensExtrato.length} un):*\n`;
    itensExtrato.forEach((it) => {
      const imeiTxt = it.imei ? ` (${it.imei})` : '';
      const valTxt = it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      msg += `• ${it.desc}${imeiTxt}: R$ ${valTxt}\n`;
    });
    msg += `\n`;
  }

  msg += `💰 *Total a acertar: R$ ${saldoFmt}*\n`;

  const pix = chavePix.trim().replace(/^\*+|\*+$/g, '');
  if (pix) {
    msg += `🔑 *PIX:* ${pix}\n`;
  }

  return sanitizarTextoWhatsApp(msg);
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

  // 1. Busca dados da loja (nome e pix)
  const { data: loja } = await supabase
    .from('lojas')
    .select('nome, chave_pix, chave_pix_cobranca, config_atacado')
    .eq('id', lojaId)
    .maybeSingle();

  const nomeLoja = loja?.nome || 'Lucas Imports';
  const chavePix = (loja?.config_atacado as any)?.chave_pix || loja?.chave_pix || loja?.chave_pix_cobranca || '';

  // 2. Busca devedores cadastrados
  const { data: devedoresCadastrados } = await supabase
    .from('lojistas_devedores')
    .select('nome, saldo_devedor, telefone, whatsapp')
    .eq('loja_id', lojaId)
    .eq('ativo', true);

  // 3. Busca vendas atacado / fiado / pendentes
  const { data: vendasBanco } = await supabase
    .from('vendas')
    .select('id, clienteNome, valor, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao, itens, dataPagamento, dataVencimento')
    .eq('loja_id', lojaId);

  // 4. Busca aparelhos do estoque da loja
  const { data: aparelhos } = await supabase
    .from('aparelhos')
    .select('id, modelo, marca, cor, capacidade, imei, preco, precoAtacado, observacoes, status, condicao, dataCadastro')
    .eq('loja_id', lojaId);

  return consolidarFiadoCompleto(devedoresCadastrados, vendasBanco, aparelhos, nomeLoja, chavePix);
}

export async function buscarExtratoLojista(
  supabase: any,
  lojaId: string,
  lojistaNomeOuBusca?: string
): Promise<ExtratoLojista | null> {
  const fiado = await buscarFiadoConsolidadoLoja(supabase, lojaId);
  if (fiado.devedores.length === 0) return null;

  // Busca dados da loja
  const { data: loja } = await supabase
    .from('lojas')
    .select('nome, chave_pix, chave_pix_cobranca, config_atacado')
    .eq('id', lojaId)
    .maybeSingle();

  const nomeLoja = loja?.nome || 'Lucas Imports';
  const chavePix = (loja?.config_atacado as any)?.chave_pix || loja?.chave_pix || loja?.chave_pix_cobranca || '';

  let devedorAlvo: DevedorConsolidado | undefined;

  if (lojistaNomeOuBusca && lojistaNomeOuBusca.trim()) {
    const q = lojistaNomeOuBusca.trim().toLowerCase();
    devedorAlvo = fiado.devedores.find(
      (d) => d.nome.toLowerCase() === q || d.nome.toLowerCase().includes(q)
    );
    // Se buscou por um nome específico e não encontrou, não gera extrato de outro lojista
    if (!devedorAlvo) return null;
  } else {
    // Se não passou nome nenhum (comando !extrato puro), sugere o primeiro devedor com débitos
    devedorAlvo = fiado.devedores[0];
  }

  if (!devedorAlvo) return null;

  const textoFormatado = formatarTextoExtrato(devedorAlvo, nomeLoja, chavePix);

  return {
    lojistaNome: devedorAlvo.nome,
    telefone: devedorAlvo.whatsapp || devedorAlvo.telefone,
    pedidos: devedorAlvo.pedidos,
    totalComprado: devedorAlvo.saldo,
    totalPago: 0,
    saldoDevedor: devedorAlvo.saldo,
    totalAparelhos: devedorAlvo.totalAparelhos,
    textoFormatado,
  };
}
