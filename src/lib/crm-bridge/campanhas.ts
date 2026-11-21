import { supabaseAdmin } from '@/integrations/supabase/server';
import { vendaConta } from '@/lib/vendas/situacao';

export type SegmentoCampanha =
  | 'sem_compra_90d'
  | 'upgrade_iphones_antigos'
  | 'garantia_vencendo_30d'
  | 'leads_nao_convertidos'
  | 'todos_clientes';

export interface DestinatarioCampanha {
  nome: string;
  telefone: string;
  contexto?: string;
}

function minutosDoDia(hhmm: string, padrao: number): number {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return padrao;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function validarJanelaAntiBan(
  janelaInicio: string,
  janelaFim: string,
  agora: Date = new Date()
): { permitido: boolean; motivo?: string } {
  const ini = minutosDoDia(janelaInicio, 9 * 60);
  const fim = minutosDoDia(janelaFim, 19 * 60);
  const atual = agora.getHours() * 60 + agora.getMinutes();

  const dentro = ini <= fim ? atual >= ini && atual <= fim : atual >= ini || atual <= fim;
  if (!dentro) {
    return {
      permitido: false,
      motivo: `Fora da janela segura anti-ban (${janelaInicio} às ${janelaFim}).`,
    };
  }
  return { permitido: true };
}

export function calcularDelayAntiBanMs(minSeg: number, maxSeg: number): number {
  const min = Math.max(5, Math.min(Number(minSeg) || 25, 300));
  const max = Math.max(min, Math.min(Number(maxSeg) || 65, 600));
  const seg = min + Math.random() * (max - min);
  return Math.round(seg * 1000);
}

export async function listarDestinatariosSegmento(
  lojaId: string,
  segmento: SegmentoCampanha | string
): Promise<DestinatarioCampanha[]> {
  const unicos = new Map<string, DestinatarioCampanha>();
  const add = (nome: string, tel: string, contexto?: string) => {
    const limpo = String(tel || '').replace(/\D/g, '');
    if (limpo.length < 10) return;
    const key = limpo.slice(-8);
    if (!unicos.has(key)) {
      unicos.set(key, {
        nome: String(nome || 'Cliente').trim(),
        telefone: String(tel).trim(),
        contexto,
      });
    }
  };

  if (segmento === 'leads_nao_convertidos') {
    const { data } = await supabaseAdmin
      .from('crm_leads_anuncio')
      .select('contato_nome, contato_telefone, ad_headline, status')
      .eq('loja_id', lojaId)
      .neq('status', 'convertido')
      .order('created_at', { ascending: false })
      .limit(400);

    for (const l of (data || []) as Array<Record<string, unknown>>) {
      add(
        String(l.contato_nome || 'Lead'),
        String(l.contato_telefone || ''),
        String(l.ad_headline || '')
      );
    }
    return Array.from(unicos.values());
  }

  if (segmento === 'garantia_vencendo_30d') {
    const agora = Date.now();
    const em30d = agora + 30 * 86400 * 1000;
    const [garRes, cliRes] = await Promise.all([
      supabaseAdmin
        .from('garantias')
        .select('"clienteNome", "aparelhoModelo", "dataFim"')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .limit(400),
      supabaseAdmin
        .from('clientes')
        .select('nome, telefone')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .limit(1000),
    ]);

    const mapaTel = new Map<string, string>();
    for (const c of (cliRes.data || []) as Array<Record<string, unknown>>) {
      if (c.nome && c.telefone) {
        mapaTel.set(String(c.nome).trim().toLowerCase(), String(c.telefone));
      }
    }

    for (const g of (garRes.data || []) as Array<Record<string, unknown>>) {
      const fim = Date.parse(String(g.dataFim || ''));
      if (!Number.isFinite(fim) || fim < agora || fim > em30d) continue;
      const nome = String(g.clienteNome || '').trim();
      const tel = mapaTel.get(nome.toLowerCase()) || '';
      if (tel) add(nome, tel, String(g.aparelhoModelo || ''));
    }
    return Array.from(unicos.values());
  }

  const [cliRes, vendasRes] = await Promise.all([
    supabaseAdmin
      .from('clientes')
      .select('id, nome, telefone')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .limit(1000),
    supabaseAdmin
      .from('vendas')
      .select('"clienteId", "clienteNome", "aparelhoDescricao", "dataPagamento", status, ativo')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .order('dataPagamento', { ascending: false })
      .limit(1000),
  ]);

  const clientes = (cliRes.data || []) as Array<Record<string, unknown>>;
  const vendas = ((vendasRes.data || []) as Array<Record<string, unknown>>).filter((v) =>
    vendaConta({ status: v.status })
  );

  if (segmento === 'todos_clientes') {
    for (const c of clientes) {
      add(String(c.nome || 'Cliente'), String(c.telefone || ''));
    }
    return Array.from(unicos.values());
  }

  if (segmento === 'sem_compra_90d') {
    const corte = Date.now() - 90 * 86400 * 1000;
    const compraRecenteIds = new Set<string>();
    const compraRecenteNomes = new Set<string>();

    for (const v of vendas) {
      const ts = Date.parse(String(v.dataPagamento || ''));
      if (Number.isFinite(ts) && ts >= corte) {
        if (v.clienteId) compraRecenteIds.add(String(v.clienteId));
        if (v.clienteNome) compraRecenteNomes.add(String(v.clienteNome).trim().toLowerCase());
      }
    }

    for (const c of clientes) {
      const id = String(c.id || '');
      const nome = String(c.nome || '').trim().toLowerCase();
      if (!compraRecenteIds.has(id) && !compraRecenteNomes.has(nome)) {
        add(String(c.nome || 'Cliente'), String(c.telefone || ''));
      }
    }
    return Array.from(unicos.values());
  }

  if (segmento === 'upgrade_iphones_antigos') {
    const telPorId = new Map<string, string>();
    const telPorNome = new Map<string, string>();
    for (const c of clientes) {
      if (c.id && c.telefone) telPorId.set(String(c.id), String(c.telefone));
      if (c.nome && c.telefone) telPorNome.set(String(c.nome).trim().toLowerCase(), String(c.telefone));
    }

    for (const v of vendas) {
      const desc = String(v.aparelhoDescricao || '').toLowerCase();
      if (/\biphone\s*(7|8|x|xr|xs|11|12|13)\b/i.test(desc)) {
        const nome = String(v.clienteNome || 'Cliente');
        const tel =
          telPorId.get(String(v.clienteId || '')) ||
          telPorNome.get(nome.toLowerCase()) ||
          '';
        if (tel) add(nome, tel, String(v.aparelhoDescricao || ''));
      }
    }
    return Array.from(unicos.values());
  }

  return [];
}
