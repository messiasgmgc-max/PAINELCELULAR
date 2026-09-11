/**
 * Recibo da venda enviado em PDF para o WhatsApp do cliente pela Evolution API.
 *
 * A loja liga ou desliga em Configurações → Notificações e escreve a mensagem que vai
 * junto do PDF. A escolha fica em `lojas.configuracoes.recibo_whatsapp`, ao lado das
 * outras chaves (assinatura etc.), que não podem ser apagadas ao salvar.
 */

export interface ConfigReciboWhatsapp {
  ativo: boolean;
  mensagem: string;
}

export const CHAVE_RECIBO_WHATSAPP = 'recibo_whatsapp';

export const MENSAGEM_RECIBO_PADRAO =
  'Olá, {cliente}! Obrigado pela compra na {loja}. Segue o recibo da sua compra #{venda} ({aparelho}) no valor de {valor}. Guarde este arquivo: ele vale como garantia.';

export const VARIAVEIS_RECIBO = ['{cliente}', '{loja}', '{venda}', '{valor}', '{aparelho}'] as const;

const LIMITE_MENSAGEM = 1000;

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

export function lerConfigReciboWhatsapp(configuracoes: unknown): ConfigReciboWhatsapp {
  const salvo = comoObjeto(comoObjeto(configuracoes)[CHAVE_RECIBO_WHATSAPP]);
  const mensagem = typeof salvo.mensagem === 'string' && salvo.mensagem.trim() ? salvo.mensagem.trim() : MENSAGEM_RECIBO_PADRAO;
  return { ativo: salvo.ativo === true, mensagem: mensagem.slice(0, LIMITE_MENSAGEM) };
}

/** `configuracoes` com a escolha nova, preservando as demais chaves. */
export function salvarConfigReciboWhatsapp(configuracoes: unknown, nova: ConfigReciboWhatsapp): Record<string, unknown> {
  const mensagem = nova.mensagem.trim().slice(0, LIMITE_MENSAGEM) || MENSAGEM_RECIBO_PADRAO;
  return { ...comoObjeto(configuracoes), [CHAVE_RECIBO_WHATSAPP]: { ativo: nova.ativo === true, mensagem } };
}

function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(valor) ? valor : 0);
}

export function codigoVenda(vendaId: string): string {
  return String(vendaId || '').slice(-6).toUpperCase();
}

export function montarMensagemRecibo(
  modelo: string,
  dados: { cliente?: string | null; loja?: string | null; vendaId: string; valor: number; aparelho?: string | null }
): string {
  const primeiroNome = String(dados.cliente || '').trim().split(/\s+/)[0] || 'cliente';
  const trocas: Record<string, string> = {
    '{cliente}': primeiroNome,
    '{loja}': String(dados.loja || '').trim() || 'nossa loja',
    '{venda}': codigoVenda(dados.vendaId),
    '{valor}': moeda(dados.valor),
    '{aparelho}': String(dados.aparelho || '').trim() || 'seu aparelho',
  };
  return (modelo || MENSAGEM_RECIBO_PADRAO).replace(/\{(cliente|loja|venda|valor|aparelho)\}/g, (marca) => trocas[marca]);
}

export function nomeArquivoRecibo(vendaId: string): string {
  return `Recibo-${codigoVenda(vendaId)}.pdf`;
}

/** Tira o prefixo "data:application/pdf;base64," e confere se o conteúdo parece um PDF. */
export function base64DoPdf(entrada: unknown, limiteCaracteres = 4_000_000): string | null {
  if (typeof entrada !== 'string') return null;
  const puro = entrada.replace(/^data:application\/pdf[^,]*,/i, '').replace(/\s/g, '');
  if (!puro || puro.length > limiteCaracteres || !/^[A-Za-z0-9+/]+=*$/.test(puro)) return null;
  // "%PDF" em base64 começa com "JVBER".
  return puro.startsWith('JVBER') ? puro : null;
}
