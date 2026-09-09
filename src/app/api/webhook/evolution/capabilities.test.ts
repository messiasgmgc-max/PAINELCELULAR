import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  capabilitiesDisponiveis,
  capabilitiesBloqueadasPorPlano,
  executarCapability,
  montarMenuAjuda,
  montarSecaoAcoesPrompt,
  obterCapability,
  todasCapabilities,
  numero,
  bloquearAtalhoForaDoPlano,
  type ContextoCapability,
} from './capabilities';

function ctx(over: Partial<ContextoCapability> = {}): ContextoCapability {
  return {
    supabase: {} as never,
    lojaId: 'loja-1',
    nomeLoja: 'Loja Teste',
    plano: 'entrada',
    papel: 'owner',
    telefone: '5531999990000',
    pushName: 'Lucas',
    isGroup: false,
    ...over,
  };
}

describe('Registro de capacidades do bot', () => {
  it('registra todas as capacidades sem action duplicada', () => {
    const caps = todasCapabilities();
    assert.ok(caps.length >= 20, `esperava 20+ capacidades, veio ${caps.length}`);
    const acoes = caps.map((c) => c.action);
    assert.equal(new Set(acoes).size, acoes.length, 'há actions duplicadas no registro');
  });

  it('toda capacidade declara título, recurso, papéis e ao menos um exemplo', () => {
    for (const cap of todasCapabilities()) {
      assert.ok(cap.titulo, `${cap.action} sem título`);
      assert.ok(cap.recurso, `${cap.action} sem recurso de plano`);
      assert.ok(cap.papeis.length > 0, `${cap.action} sem papéis`);
      assert.ok(cap.exemplos.length > 0, `${cap.action} sem exemplos para a IA`);
    }
  });
});

describe('Gate por plano', () => {
  it('plano entrada não enxerga fiado nem consulta de IMEI', () => {
    const acoes = capabilitiesDisponiveis('entrada', 'owner').map((c) => c.action);
    assert.ok(!acoes.includes('abater_divida'));
    assert.ok(!acoes.includes('list_devedores'));
    assert.ok(!acoes.includes('consultar_imei'));
    // ...mas enxerga o operacional básico
    assert.ok(acoes.includes('create_venda'));
    assert.ok(acoes.includes('list_estoque'));
    assert.ok(acoes.includes('create_os'));
  });

  it('plano intermediário libera fiado e IMEI', () => {
    const acoes = capabilitiesDisponiveis('intermediario', 'owner').map((c) => c.action);
    assert.ok(acoes.includes('abater_divida'));
    assert.ok(acoes.includes('consultar_imei'));
  });

  it('plano avançado enxerga tudo que o owner pode fazer', () => {
    assert.equal(capabilitiesBloqueadasPorPlano('avancado', 'owner').length, 0);
  });

  it('recusa a execução de ação fora do plano, com mensagem de upgrade', async () => {
    const r = await executarCapability('abater_divida', ctx({ plano: 'entrada' }), {
      cliente: 'Joao',
      valor: 300,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.motivo, 'plano');
    assert.match(r.resposta, /Intermedi/i);
    assert.match(r.resposta, /!plano/);
  });

  it('o prompt da IA só descreve ações liberadas pelo plano', () => {
    const promptEntrada = montarSecaoAcoesPrompt(capabilitiesDisponiveis('entrada', 'owner'));
    assert.ok(!promptEntrada.includes('abater_divida'));
    assert.ok(promptEntrada.includes('create_venda'));

    const promptAvancado = montarSecaoAcoesPrompt(capabilitiesDisponiveis('avancado', 'owner'));
    assert.ok(promptAvancado.includes('abater_divida'));
  });
});

describe('Gate por papel', () => {
  it('motoboy não registra venda', async () => {
    const r = await executarCapability('create_venda', ctx({ plano: 'avancado', papel: 'motoboy' }), {});
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.motivo, 'permissao');
  });

  it('staff não edita venda já registrada (só o dono)', () => {
    const acoes = capabilitiesDisponiveis('avancado', 'staff').map((c) => c.action);
    assert.ok(!acoes.includes('update_venda'));
    assert.ok(!acoes.includes('remover_aparelho'));
    assert.ok(acoes.includes('create_venda'));
  });

  it('ação inexistente é reportada como desconhecida, sem resposta ao usuário', async () => {
    const r = await executarCapability('acao_que_nao_existe', ctx(), {});
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.motivo, 'desconhecida');
    assert.equal(r.resposta, '');
  });
});

describe('Validação de parâmetros antes de gravar', () => {
  it('pede o dado que falta em vez de cadastrar aparelho incompleto', async () => {
    const r = await executarCapability('create_aparelho', ctx(), { modelo: 'iPhone 12' });
    assert.equal(r.ok, true);
    assert.match(r.resposta, /pre[çc]o/i);
  });

  it('pede o comprador quando a venda vem sem destinatário', async () => {
    const r = await executarCapability('create_venda', ctx(), { modelo: 'iPhone 13', valor: 2500 });
    assert.equal(r.ok, true);
    assert.match(r.resposta, /vendeu|quem/i);
  });

  it('recusa IMEI incompleto sem consultar a base', async () => {
    const r = await executarCapability('consultar_imei', ctx({ plano: 'avancado' }), { imei: '12345' });
    assert.equal(r.ok, true);
    assert.match(r.resposta, /incompleto/i);
  });
});

describe('Gate de plano nos atalhos !comando', () => {
  it('bloqueia !abater no plano entrada com mensagem de upgrade', () => {
    const r = bloquearAtalhoForaDoPlano('!abater Lucas 1500', 'entrada', 'owner');
    assert.ok(r, 'esperava bloqueio');
    assert.match(r as string, /Intermedi/i);
  });

  it('bloqueia !checarimei no plano entrada', () => {
    assert.ok(bloquearAtalhoForaDoPlano('!checarimei 356789012345678', 'entrada', 'owner'));
  });

  it('libera !abater no plano intermediário', () => {
    assert.equal(bloquearAtalhoForaDoPlano('!abater Lucas 1500', 'intermediario', 'owner'), null);
  });

  it('libera !estoque em qualquer plano', () => {
    assert.equal(bloquearAtalhoForaDoPlano('!estoque', 'entrada', 'staff'), null);
  });

  it('bloqueia por papel mesmo com o plano em dia', () => {
    const r = bloquearAtalhoForaDoPlano('!abater Lucas 1500', 'avancado', 'staff');
    assert.ok(r);
    assert.match(r as string, /restrito/i);
  });

  it('ignora comandos sem capacidade correspondente', () => {
    assert.equal(bloquearAtalhoForaDoPlano('!config normal', 'entrada', 'owner'), null);
    assert.equal(bloquearAtalhoForaDoPlano('!plano', 'entrada', 'owner'), null);
  });

  it('ignora texto que não é atalho', () => {
    assert.equal(bloquearAtalhoForaDoPlano('quanto ta o iphone 13', 'entrada', 'owner'), null);
  });
});

describe('Leitura de valores em português', () => {
  it('entende valores com separador brasileiro e prefixo R$', () => {
    assert.equal(numero({ v: 'R$ 2.500,50' }, 'v'), 2500.5);
    assert.equal(numero({ v: '2500' }, 'v'), 2500);
    assert.equal(numero({ v: 1800 }, 'v'), 1800);
    assert.equal(numero({ v: '' }, 'v'), 0);
  });
});

describe('Menu do !ajuda', () => {
  it('mostra o plano atual e oferece upgrade quando há bloqueio', () => {
    const menu = montarMenuAjuda('entrada', 'owner');
    assert.match(menu, /Entrada/);
    assert.match(menu, /Disponível em planos superiores/);
    // O que está fora do plano aparece só como upsell, nunca na lista de atalhos.
    const [disponivel] = menu.split('Disponível em planos superiores');
    assert.ok(!disponivel.includes('Abater dívida'));
  });

  it('não oferece upgrade para quem já está no avançado', () => {
    const menu = montarMenuAjuda('avancado', 'owner');
    assert.ok(!menu.includes('Disponível em planos superiores'));
  });

  it('atalhos anunciados no menu existem no registro', () => {
    for (const cap of todasCapabilities()) {
      if (!cap.atalho) continue;
      assert.ok(cap.atalho.startsWith('!'), `${cap.action}: atalho deve começar com !`);
      assert.equal(obterCapability(cap.action)?.atalho, cap.atalho);
    }
  });
});
