import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const lojaId = body?.lojaId;

    return await executarSincronizacao(lojaId);
  } catch (error: any) {
    console.error('Erro na API de sync de logs:', error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lojaId = searchParams.get('lojaId') || undefined;

    return await executarSincronizacao(lojaId);
  } catch (error: any) {
    console.error('Erro na API de sync de logs (GET):', error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

async function executarSincronizacao(lojaId?: string) {
  // 1. Busca todos os logs existentes para não duplicar
  let queryLogs = supabase
    .from('logs_sistema')
    .select('detalhes');

  if (lojaId && lojaId !== 'todas') {
    queryLogs = queryLogs.eq('loja_id', lojaId);
  }

  const { data: logsExistentes } = await queryLogs;
  const refsExistentes = new Set<string>();

  logsExistentes?.forEach((log) => {
    if (log.detalhes) {
      const match = log.detalhes.match(/\[ref:([a-zA-Z0-9_\-]+)\]/);
      if (match) {
        refsExistentes.add(match[1]);
      }
    }
  });

  const novosLogs: any[] = [];

  // 2. Sincronizar VENDAS
  let queryVendas = supabase
    .from('vendas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (lojaId && lojaId !== 'todas') {
    queryVendas = queryVendas.eq('loja_id', lojaId);
  }

  const { data: vendas } = await queryVendas;
  if (vendas) {
    for (const v of vendas) {
      const refKey = `vendas_${v.id}`;
      if (!refsExistentes.has(refKey)) {
        refsExistentes.add(refKey);

        const valorFormatado = v.valor_total !== undefined 
          ? `R$ ${Number(v.valor_total).toFixed(2).replace('.', ',')}` 
          : '';
        const cliente = v.clienteNome || v.comprador || 'Cliente Comum';
        const tipo = v.tipo_venda === 'atacado' ? 'Venda Atacado' : 'Venda Varejo';

        novosLogs.push({
          loja_id: v.loja_id || null,
          tipo_evento: 'venda',
          acao: tipo,
          detalhes: `Venda ${v.numero ? `#${v.numero}` : ''} para "${cliente}" ${valorFormatado ? `no valor de ${valorFormatado}` : ''} ${v.forma_pagamento ? `(${v.forma_pagamento})` : ''} [ref:${refKey}]`.trim(),
          created_at: v.created_at || v.dataPagamento || new Date().toISOString(),
        });
      }
    }
  }

  // 3. Sincronizar APARELHOS (Estoque e Saídas)
  let queryAparelhos = supabase
    .from('aparelhos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (lojaId && lojaId !== 'todas') {
    queryAparelhos = queryAparelhos.eq('loja_id', lojaId);
  }

  const { data: aparelhos } = await queryAparelhos;
  if (aparelhos) {
    for (const a of aparelhos) {
      const refKey = `aparelhos_${a.id}`;
      if (!refsExistentes.has(refKey)) {
        refsExistentes.add(refKey);

        const isVendido = a.status === 'vendido' || a.status === 'saida';
        const acao = isVendido ? 'Saída / Venda de Aparelho' : 'Entrada no Estoque';
        const comprador = a.comprador_atacado || a.comprador || '';
        const preco = a.preco_venda ? `por R$ ${Number(a.preco_venda).toFixed(2).replace('.', ',')}` : '';

        novosLogs.push({
          loja_id: a.loja_id || null,
          tipo_evento: 'estoque',
          acao,
          detalhes: `${a.modelo || 'Aparelho'} (IMEI: ${a.imei || 'S/N'}) - Status: ${a.status} ${comprador ? `para ${comprador}` : ''} ${preco} [ref:${refKey}]`.trim(),
          created_at: a.data_saida || a.created_at || new Date().toISOString(),
        });
      }
    }
  }

  // 4. Sincronizar ORDENS DE SERVIÇO
  let queryOS = supabase
    .from('ordens_servico')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (lojaId && lojaId !== 'todas') {
    queryOS = queryOS.eq('loja_id', lojaId);
  }

  const { data: ordens } = await queryOS;
  if (ordens) {
    for (const os of ordens) {
      const refKey = `ordens_servico_${os.id}`;
      if (!refsExistentes.has(refKey)) {
        refsExistentes.add(refKey);

        novosLogs.push({
          loja_id: os.loja_id || null,
          tipo_evento: 'os',
          acao: `Ordem de Serviço #${os.numero_os || 'S/N'}`,
          detalhes: `OS para ${os.cliente_nome || 'Cliente'} (${os.aparelho_modelo || 'Aparelho'}) - Status: ${os.status} - R$ ${Number(os.valor_total || 0).toFixed(2).replace('.', ',')} [ref:${refKey}]`.trim(),
          created_at: os.created_at || new Date().toISOString(),
        });
      }
    }
  }

  // 5. Sincronizar GARANTIAS
  let queryGarantias = supabase
    .from('garantias')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150);

  if (lojaId && lojaId !== 'todas') {
    queryGarantias = queryGarantias.eq('loja_id', lojaId);
  }

  const { data: garantias } = await queryGarantias;
  if (garantias) {
    for (const g of garantias) {
      const refKey = `garantias_${g.id}`;
      if (!refsExistentes.has(refKey)) {
        refsExistentes.add(refKey);

        novosLogs.push({
          loja_id: g.loja_id || null,
          tipo_evento: 'garantia',
          acao: 'Emissão de Garantia',
          detalhes: `Garantia para ${g.cliente_nome || 'Cliente'} (${g.aparelho_descricao || 'Aparelho'}) - ${g.dias_garantia || 90} dias [ref:${refKey}]`.trim(),
          created_at: g.created_at || new Date().toISOString(),
        });
      }
    }
  }

  // 6. Inserir em lotes de 50 para máxima performance
  let inseridos = 0;
  if (novosLogs.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < novosLogs.length; i += batchSize) {
      const batch = novosLogs.slice(i, i + batchSize);
      const { error: insertErr } = await supabase.from('logs_sistema').insert(batch);
      if (!insertErr) {
        inseridos += batch.length;
      } else {
        console.warn('Erro ao inserir lote de logs:', insertErr.message);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sincronizados: inseridos,
    totalNovos: novosLogs.length,
    mensagem: `${inseridos} eventos históricos sincronizados com sucesso!`
  });
}
