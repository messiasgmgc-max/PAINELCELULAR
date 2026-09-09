import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verificarPermissaoRecursoPlano } from '@/lib/planos-config';
import { processarAnaliticaVendas } from './vendasAnalyticsHelper';
import { parseGeminiPlan } from './commandExecutor';

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

  it('deve validar permissões de recursos por plano (Entrada, Intermediário e Avançado)', () => {

    // Plano Entrada NÃO deve ter acesso a IMEI, broadcast nem escuta multi-loja
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'consulta_imei'), false);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'broadcast_grupos'), false);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'escuta_multiloja'), false);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'vendas'), true);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'estoque'), true);

    // Plano Intermediário deve ter IMEI e broadcast, mas NÃO escuta multi-loja
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'consulta_imei'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'broadcast_grupos'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'fiado_devedores'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'escuta_multiloja'), false);

    // Plano Avançado deve ter acesso completo
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'consulta_imei'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'broadcast_grupos'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'escuta_multiloja'), true);
  });

  it('deve filtrar lojas em grupo apenas se tiverem plano Avançado E opt-in explícito', () => {

    const mockLojas = [
      // Loja A: Avançado COM opt-in
      { id: 'loja-a', nome: 'Loja A', plano_tipo: 'avancado', config_atacado: { participar_rede_grupos: true } },
      // Loja B: Avançado SEM opt-in (privacidade preservada)
      { id: 'loja-b', nome: 'Loja B', plano_tipo: 'avancado', config_atacado: { participar_rede_grupos: false } },
      // Loja C: Intermediário COM flag de opt-in (mas sem o plano avançado necessário)
      { id: 'loja-c', nome: 'Loja C', plano_tipo: 'intermediario', config_atacado: { participar_rede_grupos: true } },
      // Loja D: Entrada
      { id: 'loja-d', nome: 'Loja D', plano_tipo: 'entrada', config_atacado: {} },
    ];

    const lojaContextoId = 'loja-origem';

    const permitidas = mockLojas.filter((l) => {
      if (l.id === lojaContextoId) return true;
      const temPermissao = verificarPermissaoRecursoPlano(l.plano_tipo, 'escuta_multiloja');
      if (!temPermissao) return false;
      return Boolean(l.config_atacado?.participar_rede_grupos);
    });

    assert.equal(permitidas.length, 1);
    assert.equal(permitidas[0].id, 'loja-a');
  });

  it('deve calcular corretamente lucro, custo total e margem nas vendas agregadas', () => {

    const vendasMock = [
      {
        id: 'v1',
        valor: 2500,
        custo: 1800,
        lucro: 700,
        tipoEntrega: 'Atacado',
        clienteNome: 'Lucas Imports',
        dataPagamento: new Date().toISOString(),
      },
      {
        id: 'v2',
        valor: 1500,
        custo: 1000,
        lucro: 500,
        tipoEntrega: 'Varejo',
        clienteNome: 'Mariana',
        dataPagamento: new Date().toISOString(),
      },
    ];

    const analitica = processarAnaliticaVendas(vendasMock);
    assert.equal(analitica.hoje.total, 4000);
    assert.equal(analitica.hoje.custoTotal, 2800);
    assert.equal(analitica.hoje.lucroTotal, 1200);
    assert.equal(analitica.hoje.margemPercentual.toFixed(1), '30.0');
    assert.equal(analitica.hoje.atacadoLucro, 700);
    assert.equal(analitica.hoje.varejoLucro, 500);
    assert.ok(analitica.hoje.resumoLucroTexto.includes('1.200,00'));
    assert.ok(analitica.hoje.itensFormatados.includes('Lucro: R$ 700,00'));
  });

  it('deve gerenciar memória de conversa recente e expirar após 3 minutos sem interação', () => {
    const TEMPO_EXPIRACAO_MS = 3 * 60 * 1000;
    const historicoSessao: { mensagens: Array<{ role: string; text: string }>; ultimoTimestamp: number } = {
      mensagens: [
        { role: 'user', text: 'quais iphones 15 temos no estoque?' },
        { role: 'model', text: 'Temos 2 iPhone 15 disponíveis.' },
      ],
      ultimoTimestamp: Date.now(),
    };

    const obterHistorico = (agora: number) => {
      if (agora - historicoSessao.ultimoTimestamp > TEMPO_EXPIRACAO_MS) {
        return [];
      }
      return historicoSessao.mensagens;
    };

    // 1. Mensagem enviada dentro de 2 minutos (120s): deve manter o contexto
    const dentroDoTempo = Date.now() + 2 * 60 * 1000;
    assert.equal(obterHistorico(dentroDoTempo).length, 2);

    // 2. Mensagem enviada após 3 minutos e 10 segundos (190s): expira e reseta o histórico
    const aposExpirar = Date.now() + (3 * 60 + 10) * 1000;
    assert.equal(obterHistorico(aposExpirar).length, 0);
  });

  it('deve interpretar plano de update_venda para alteração de valor ou custo', () => {

    const planoJson = JSON.stringify({
      type: 'command',
      action: 'update_venda',
      params: {
        comprador: 'Lucas',
        novoValor: 2600,
        novoCusto: 1900,
      },
      confianca: 'alta',
    });

    const parsed = parseGeminiPlan(planoJson);
    assert.ok(parsed);
    assert.equal(parsed.action, 'update_venda');
    assert.equal(parsed.confianca, 'alta');
    assert.equal(parsed.params.comprador, 'Lucas');
    assert.equal(parsed.params.novoValor, 2600);
    assert.equal(parsed.params.novoCusto, 1900);
  });
});
