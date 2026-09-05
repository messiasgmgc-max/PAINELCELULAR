import { supabase } from '@/lib/supabaseClient';

export type TipoEventoLog = 
  | 'login' 
  | 'venda' 
  | 'os' 
  | 'estoque' 
  | 'equipe' 
  | 'plano' 
  | 'cliente' 
  | 'garantia' 
  | 'info';

export interface RegistrarLogParams {
  loja_id?: string | null;
  usuario_id?: string | null;
  usuario_email?: string | null;
  usuario_nome?: string | null;
  tipo_evento: TipoEventoLog;
  acao: string;
  detalhes?: string | null;
  created_at?: string;
}

/**
 * Registra uma atividade no sistema de logs de auditoria.
 * Totalmente seguro: nunca lança exceções para não interromper a operação do usuário.
 */
export async function registrarLog(params: RegistrarLogParams): Promise<void> {
  try {
    const payload = {
      loja_id: params.loja_id || null,
      usuario_id: params.usuario_id || null,
      usuario_email: params.usuario_email || null,
      usuario_nome: params.usuario_nome || null,
      tipo_evento: params.tipo_evento || 'info',
      acao: String(params.acao || 'Ação do Sistema').trim(),
      detalhes: params.detalhes ? String(params.detalhes).trim() : null,
      created_at: params.created_at || new Date().toISOString(),
    };

    // Tenta inserção direta pelo cliente Supabase
    const { error } = await supabase.from('logs_sistema').insert([payload]);

    if (error) {
      // Se falhar no client-side (ex: RLS restrito), faz fallback via API route
      if (typeof window !== 'undefined') {
        fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Logger] Aviso silencioso ao gravar log:', err);
  }
}

/**
 * Helper para registrar vendas de forma padronizada
 */
export async function logVenda(venda: {
  id?: string;
  numero?: number | string;
  clienteNome?: string;
  comprador?: string;
  valorTotal?: number;
  tipoVenda?: string;
  formaPagamento?: string;
  itensCount?: number;
}, usuario?: any, lojaId?: string | null) {
  const nomeCliente = venda.clienteNome || venda.comprador || 'Cliente';
  const tipo = venda.tipoVenda === 'atacado' ? 'Venda Atacado' : 'Venda Varejo';
  const valorFormatado = venda.valorTotal !== undefined 
    ? `R$ ${Number(venda.valorTotal).toFixed(2).replace('.', ',')}` 
    : '';

  const detalhes = [
    `Venda ${venda.numero ? `#${venda.numero}` : ''} realizada para "${nomeCliente}"`,
    valorFormatado ? `no valor de ${valorFormatado}` : '',
    venda.formaPagamento ? `(${venda.formaPagamento})` : '',
    venda.itensCount ? `[${venda.itensCount} item(ns)]` : '',
    venda.id ? `[ref:vendas_${venda.id}]` : ''
  ].filter(Boolean).join(' ');

  return registrarLog({
    loja_id: lojaId || usuario?.lojaId || null,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || 'Operador',
    usuario_email: usuario?.email || null,
    tipo_evento: 'venda',
    acao: tipo,
    detalhes,
  });
}

/**
 * Helper para registrar movimentações de estoque
 */
export async function logEstoque(aparelho: {
  id?: string;
  modelo?: string;
  marca?: string;
  imei?: string;
  status?: string;
  precoVenda?: number;
  comprador?: string;
}, acao: string, usuario?: any, lojaId?: string | null) {
  const detalhes = [
    `${aparelho.modelo || 'Aparelho'}`,
    aparelho.imei ? `(IMEI: ${aparelho.imei})` : '',
    aparelho.status ? `- Status: ${aparelho.status}` : '',
    aparelho.comprador ? `para ${aparelho.comprador}` : '',
    aparelho.precoVenda ? `por R$ ${Number(aparelho.precoVenda).toFixed(2).replace('.', ',')}` : '',
    aparelho.id ? `[ref:aparelhos_${aparelho.id}]` : ''
  ].filter(Boolean).join(' ');

  return registrarLog({
    loja_id: lojaId || usuario?.lojaId || null,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || 'Operador',
    usuario_email: usuario?.email || null,
    tipo_evento: 'estoque',
    acao,
    detalhes,
  });
}

/**
 * Helper para registrar Ordens de Serviço
 */
export async function logOS(os: {
  id?: string;
  numeroOS?: number | string;
  clienteNome?: string;
  aparelhoModelo?: string;
  status?: string;
  valorTotal?: number;
}, acao: string, usuario?: any, lojaId?: string | null) {
  const detalhes = [
    `OS #${os.numeroOS || 'S/N'} - Cliente: ${os.clienteNome || 'Não informado'}`,
    os.aparelhoModelo ? `(${os.aparelhoModelo})` : '',
    os.status ? `- Status: ${os.status}` : '',
    os.valorTotal ? `- Valor: R$ ${Number(os.valorTotal).toFixed(2).replace('.', ',')}` : '',
    os.id ? `[ref:ordens_servico_${os.id}]` : ''
  ].filter(Boolean).join(' ');

  return registrarLog({
    loja_id: lojaId || usuario?.lojaId || null,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || 'Operador',
    usuario_email: usuario?.email || null,
    tipo_evento: 'os',
    acao,
    detalhes,
  });
}

/**
 * Helper para registrar emissão de garantias
 */
export async function logGarantia(garantia: {
  id?: string;
  clienteNome?: string;
  aparelhoDescricao?: string;
  diasGarantia?: number;
}, usuario?: any, lojaId?: string | null) {
  const detalhes = [
    `Garantia para ${garantia.clienteNome || 'Cliente'}`,
    garantia.aparelhoDescricao ? `(${garantia.aparelhoDescricao})` : '',
    garantia.diasGarantia ? `- Prazo: ${garantia.diasGarantia} dias` : '',
    garantia.id ? `[ref:garantias_${garantia.id}]` : ''
  ].filter(Boolean).join(' ');

  return registrarLog({
    loja_id: lojaId || usuario?.lojaId || null,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || 'Operador',
    usuario_email: usuario?.email || null,
    tipo_evento: 'garantia',
    acao: 'Emissão de Garantia',
    detalhes,
  });
}

/**
 * Helper para registrar login/logout
 */
export async function logAuth(usuario: any, acao: 'Login' | 'Logout' | 'Primeiro Acesso', detalhesExtras?: string) {
  return registrarLog({
    loja_id: usuario?.lojaId || null,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || 'Usuário',
    usuario_email: usuario?.email || null,
    tipo_evento: 'login',
    acao: `${acao} no Painel`,
    detalhes: detalhesExtras || `Usuário ${usuario?.nome || usuario?.email || ''} realizou ${acao.toLowerCase()} no sistema.`,
  });
}
