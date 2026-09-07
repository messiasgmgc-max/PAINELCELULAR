import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function obterVariantesTelefone(rawPhone: string): string[] {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(digits);

  if (digits.startsWith('55') && digits.length >= 12) {
    const local = digits.substring(2);
    variants.add(local);
    const ddd = local.substring(0, 2);
    const num = local.substring(2);
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`);
      variants.add(`${ddd}${num.substring(1)}`);
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`);
      variants.add(`${ddd}9${num}`);
    }
  } else if (digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
    const ddd = digits.substring(0, 2);
    const num = digits.substring(2);
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`);
      variants.add(`${ddd}${num.substring(1)}`);
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`);
      variants.add(`${ddd}9${num}`);
    }
  }

  return Array.from(variants);
}

function ehPerguntaPlanos(texto: string): boolean {
  const lower = texto.toLowerCase().trim();
  return /quais planos temos|quais s[aã]o os planos|tabela de planos|planos do sistema|valores dos planos|como funcionam os planos|planos phone center/i.test(lower);
}

function ehPerguntaVencimento(texto: string): boolean {
  const lower = texto.toLowerCase().trim();
  return /(?:quando (?:meu|o)? ?plano (?:vai )?venc|quando vence|vencimento (?:do )?plano|plano (?:vai )?venc|meu plano t[aá] ativo|quantos dias de plano|dias restantes do plano|validade do plano)/i.test(lower);
}

function ehPerguntaRelatorioGeral(texto: string): boolean {
  const lower = String(texto || '').toLowerCase().trim();
  return /(?:venda|vendas|atacado|varejo|historico|histórico|relatorio|relatório|hoje|ontem|mes|mês|semana|quanto|faturamento|total)/i.test(lower);
}

function ehPedidoExtratoLojista(texto: string, isGroup = false): boolean {
  const lowerText = String(texto || '').toLowerCase().trim();
  const relatorioGeral = ehPerguntaRelatorioGeral(lowerText);
  const ehComandoExtratoDireto = (lowerText.startsWith('!extrato') || lowerText === '!extrato') && !relatorioGeral;
  const ehPedidoExtratoNatural = !isGroup && !relatorioGeral && (
    lowerText === 'extrato' ||
    lowerText.startsWith('extrato ') ||
    /(?:me )?(?:manda|envia|gerar?|ver|passa|consultar?|qual|copia|quero)(?: o)? extrato/i.test(lowerText) ||
    /(?:extrato)(?: do)? (?:lojista|fiado|devedor|cliente|cl)/i.test(lowerText)
  );
  return ehComandoExtratoDireto || ehPedidoExtratoNatural;
}

describe('Copiloto Operacional do Lojista - Validações', () => {
  it('deve gerar todas as variantes de telefone para cruzamento de loja no WhatsApp', () => {
    const v1 = obterVariantesTelefone('5531993586377');
    assert.ok(v1.includes('5531993586377'));
    assert.ok(v1.includes('31993586377'));
    assert.ok(v1.includes('553193586377'));
    assert.ok(v1.includes('3193586377'));

    const v2 = obterVariantesTelefone('(31) 99358-6377');
    assert.ok(v2.includes('5531993586377'));
    assert.ok(v2.includes('31993586377'));
  });

  it('deve identificar corretamente perguntas sobre planos da plataforma', () => {
    assert.equal(ehPerguntaPlanos('quais planos temos?'), true);
    assert.equal(ehPerguntaPlanos('quais são os planos do sistema?'), true);
    assert.equal(ehPerguntaPlanos('qual a tabela de planos'), true);
    assert.equal(ehPerguntaPlanos('valores dos planos'), true);
    assert.equal(ehPerguntaPlanos('como funcionam os planos'), true);
    assert.equal(ehPerguntaPlanos('temos iphone 13 no estoque'), false);
  });

  it('deve identificar corretamente perguntas sobre vencimento e assinatura', () => {
    assert.equal(ehPerguntaVencimento('meu plano vai vencer quando?'), true);
    assert.equal(ehPerguntaVencimento('quando vence meu plano?'), true);
    assert.equal(ehPerguntaVencimento('quando o plano vai vencer?'), true);
    assert.equal(ehPerguntaVencimento('qual o vencimento do plano'), true);
    assert.equal(ehPerguntaVencimento('quantos dias de plano ainda temos?'), true);
    assert.equal(ehPerguntaVencimento('vendi um iphone 11'), false);
  });

  it('NÃO deve interceptar perguntas de vendas, atacado e relatórios como extrato de devedores', () => {
    // Perguntas gerais de vendas e atacado devem ir para o copiloto neural/analítico
    assert.equal(ehPedidoExtratoLojista('qual o extrato de vendas do atacado'), false);
    assert.equal(ehPedidoExtratoLojista('extrato de vendas'), false);
    assert.equal(ehPedidoExtratoLojista('extrato do atacado'), false);
    assert.equal(ehPedidoExtratoLojista('historico de vendas'), false);
    assert.equal(ehPedidoExtratoLojista('historico do atacado'), false);
    assert.equal(ehPedidoExtratoLojista('peco o historico'), false);
    assert.equal(ehPedidoExtratoLojista('relatorio total de vendas'), false);
    assert.equal(ehPedidoExtratoLojista('quais vendas feito hoje'), false);
    assert.equal(ehPedidoExtratoLojista('vendas esta semana'), false);
    assert.equal(ehPedidoExtratoLojista('!extrato atacado'), false);
    assert.equal(ehPedidoExtratoLojista('!extrato vendas'), false);

    // Pedidos diretos de extrato de dívida de lojista devem ser interceptados normalmente
    assert.equal(ehPedidoExtratoLojista('!extrato cl'), true);
    assert.equal(ehPedidoExtratoLojista('!extrato joao'), true);
    assert.equal(ehPedidoExtratoLojista('!extrato'), true);
    assert.equal(ehPedidoExtratoLojista('extrato cl'), true);
    assert.equal(ehPedidoExtratoLojista('extrato do cl'), true);
    assert.equal(ehPedidoExtratoLojista('manda o extrato do devedor'), true);
  });
});
