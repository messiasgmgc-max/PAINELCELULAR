import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarSupabaseFake } from '../estoque/testes/supabaseFake';
import {
  type AparelhoBase,
  type PayloadCadastroRapido,
  ErroCadastroRapido,
  MARCADORES,
  buscarModelos,
  cadastrarAparelhoRapido,
  calcularMargem,
  capacidadeMaisComum,
  capacidadesDoModelo,
  coresSugeridas,
  derivarMarca,
  desfazerCadastroRapido,
  digitoVerificadorImei,
  formularioVazio,
  gerarCodigoEtiqueta,
  imeiValido,
  interpretarIdentificador,
  listarOpcoesModelo,
  montarPayloadCadastroRapido,
  normalizarCapacidade,
  normalizarCor,
  normalizarMarca,
  normalizarModelo,
  procurarDuplicado,
  sugerirPorTac,
  sugerirPreco,
  validarCadastroRapido,
} from './cadastroRapido';

const IMEI_OK = '490154203237518';
const IMEI_OK_2 = '356938035643809';

const ap = (p: Partial<AparelhoBase> & { id: string }): AparelhoBase => ({
  marca: 'Apple',
  ativo: true,
  status: 'disponivel',
  condicao: 'seminovo',
  preco: 0,
  ...p,
});

describe('IMEI', () => {
  it('calcula o dígito verificador (Luhn)', () => {
    assert.equal(digitoVerificadorImei('49015420323751'), 8);
    assert.equal(digitoVerificadorImei('35693803564380'), 9);
    assert.ok(imeiValido(IMEI_OK));
    assert.ok(!imeiValido('490154203237519'));
    assert.ok(!imeiValido('49015420323751'));
  });

  it('interpreta o que foi bipado', () => {
    assert.deepEqual(interpretarIdentificador(IMEI_OK), { tipo: 'imei', imei: IMEI_OK, completado: false });
    assert.deepEqual(interpretarIdentificador('IMEI: ' + IMEI_OK), { tipo: 'imei', imei: IMEI_OK, completado: false });
    assert.deepEqual(interpretarIdentificador(`IMEI1 ${IMEI_OK} IMEI2 ${IMEI_OK_2}`), {
      tipo: 'imei',
      imei: IMEI_OK,
      completado: false,
    });
    assert.deepEqual(interpretarIdentificador('490154203237519'), { tipo: 'imei_invalido', imei: '490154203237519' });
    assert.deepEqual(interpretarIdentificador(''), { tipo: 'vazio' });
    assert.deepEqual(interpretarIdentificador('35693'), { tipo: 'incompleto', digitos: '35693' });
  });

  it('completa o 15º dígito de um IMEI de 14', () => {
    assert.deepEqual(interpretarIdentificador('49015420323751'), { tipo: 'imei', imei: IMEI_OK, completado: true });
  });

  it('texto com letras vira número de série; o prefixo S do código de barras da caixa sai', () => {
    assert.deepEqual(interpretarIdentificador('f2lxk9q0n72p'), { tipo: 'serial', numeroSerie: 'F2LXK9Q0N72P' });
    assert.deepEqual(interpretarIdentificador('SDX3LKJ9QPN'), { tipo: 'serial', numeroSerie: 'DX3LKJ9QPN' });
    assert.deepEqual(interpretarIdentificador('Serial: DX3LKJ9QPN'), { tipo: 'serial', numeroSerie: 'DX3LKJ9QPN' });
  });
});

describe('Modelo, marca, capacidade e cor', () => {
  it('padroniza a grafia do modelo', () => {
    assert.equal(normalizarModelo('iphone 13 pro max'), 'iPhone 13 Pro Max');
    assert.equal(normalizarModelo('15pm'), 'iPhone 15 Pro Max');
    assert.equal(normalizarModelo('Apple iPhone 13'), 'iPhone 13');
    assert.equal(normalizarModelo('iphone 17 pro max'), 'iPhone 17 Pro Max');
    assert.equal(normalizarModelo('galaxy s23 ultra'), 'Galaxy S23 Ultra');
    assert.equal(normalizarModelo('redmi note 13 pro'), 'Redmi Note 13 Pro');
    assert.equal(normalizarModelo('N/A'), '');
  });

  it('busca tolerante acha o modelo pelo jeito que o vendedor digita', () => {
    const opcoes = listarOpcoesModelo([]);
    assert.equal(buscarModelos('15pm', opcoes)[0].modelo, 'iPhone 15 Pro Max');
    assert.equal(buscarModelos('iphone 17 pro max', opcoes)[0].modelo, 'iPhone 17 Pro Max');
    const iphone1 = buscarModelos('iphone 1', opcoes);
    assert.ok(iphone1.length > 0);
    assert.ok(iphone1.every((o) => o.modelo.startsWith('iPhone 1')));
  });

  it('modelos mais vendidos na loja aparecem primeiro', () => {
    const agora = new Date('2026-09-10T12:00:00Z');
    const aparelhos = [1, 2, 3].map((i) =>
      ap({ id: `a${i}`, modelo: 'iPhone 13 Pro Max', created_at: '2026-09-01T12:00:00Z' })
    );
    const opcoes = listarOpcoesModelo(aparelhos, agora);
    assert.equal(opcoes[0].modelo, 'iPhone 13 Pro Max');
    assert.equal(buscarModelos('pro max', opcoes)[0].modelo, 'iPhone 13 Pro Max');
    // O modelo exato digitado vem antes do parecido mais vendido.
    assert.equal(buscarModelos('iphone 13', opcoes)[0].modelo, 'iPhone 13');
  });

  it('deriva a marca do modelo e, sem pista, usa a mais comum da loja', () => {
    assert.deepEqual(derivarMarca('iPhone 13', []), { marca: 'Apple', origem: 'modelo' });
    assert.deepEqual(derivarMarca('13 Pro Max', []), { marca: 'Apple', origem: 'modelo' });
    assert.deepEqual(derivarMarca('Redmi Note 13', []), { marca: 'Xiaomi', origem: 'modelo' });
    assert.deepEqual(derivarMarca('Galaxy A15', []), { marca: 'Samsung', origem: 'modelo' });
    const loja = [ap({ id: '1', marca: 'apple' }), ap({ id: '2', marca: 'iPhone' }), ap({ id: '3', marca: 'Xioami' })];
    assert.deepEqual(derivarMarca('Coisa X1', loja), { marca: 'Apple', origem: 'loja' });
    assert.equal(normalizarMarca('xioami'), 'Xiaomi');
  });

  it('capacidade nunca vira N/A', () => {
    assert.equal(normalizarCapacidade('128gb'), '128GB');
    assert.equal(normalizarCapacidade(' 256 GB '), '256GB');
    assert.equal(normalizarCapacidade('1000GB'), '1TB');
    assert.equal(normalizarCapacidade('1tb'), '1TB');
    assert.equal(normalizarCapacidade('512'), '512GB');
    assert.equal(normalizarCapacidade('N/A'), null);
    assert.equal(normalizarCapacidade(''), null);
  });

  it('mostra só as capacidades que o modelo tem', () => {
    assert.deepEqual(capacidadesDoModelo('iPhone 15 Pro Max'), ['256GB', '512GB', '1TB']);
    assert.deepEqual(capacidadesDoModelo('iPhone 17 Pro Max'), ['256GB', '512GB', '1TB', '2TB']);
    assert.ok(capacidadesDoModelo('Galaxy S23').includes('128GB'));
    const loja = [
      ap({ id: '1', modelo: 'iPhone 13', capacidade: '128gb' }),
      ap({ id: '2', modelo: 'iPhone 13', capacidade: '128GB' }),
      ap({ id: '3', modelo: 'iPhone 13', capacidade: '256GB' }),
    ];
    assert.equal(capacidadeMaisComum('iphone 13', loja), '128GB');
  });

  it('cores: reaproveita a grafia da loja e sugere as do modelo', () => {
    assert.equal(normalizarCor('grafite', ['Grafite']), 'Grafite');
    assert.equal(normalizarCor('midnight'), 'Meia-noite');
    assert.equal(normalizarCor('N/A'), null);
    const loja = [
      ap({ id: '1', modelo: 'iPhone 13', cor: 'Azul' }),
      ap({ id: '2', modelo: 'iPhone 13', cor: 'azul' }),
      ap({ id: '3', modelo: 'iPhone 13', cor: 'Meia-noite' }),
      ap({ id: '4', modelo: 'iPhone 11', cor: 'Roxo' }),
    ];
    assert.deepEqual(coresSugeridas('iPhone 13', loja), ['Azul', 'Meia-noite']);
  });
});

describe('Sugestões pelo histórico da loja', () => {
  it('sugere modelo pelo TAC quando todos os aparelhos com o mesmo TAC concordam', () => {
    const loja = [
      ap({ id: '1', modelo: 'iPhone 13', capacidade: '128GB', imei: '356938030000001', ativo: false, status: 'vendido' }),
      ap({ id: '2', modelo: 'iphone 13', capacidade: '128GB', imei: '356938031111112' }),
    ];
    assert.deepEqual(sugerirPorTac(IMEI_OK_2, loja), { modelo: 'iPhone 13', capacidade: '128GB', base: 2 });

    const divergente = [...loja, ap({ id: '3', modelo: 'iPhone 13 Pro', imei: '356938032222223' })];
    assert.equal(sugerirPorTac(IMEI_OK_2, divergente), null);
    assert.equal(sugerirPorTac('12345', loja), null);
  });

  it('com um único aparelho de base, sugere o modelo mas não chuta a capacidade', () => {
    const loja = [ap({ id: '1', modelo: 'iPhone 13', capacidade: '128GB', imei: '356938030000001' })];
    assert.deepEqual(sugerirPorTac(IMEI_OK_2, loja), { modelo: 'iPhone 13', capacidade: null, base: 1 });
  });

  it('preço sugerido é a mediana dos 5 últimos iguais', () => {
    const precos = [2000, 2500, 2600, 2700, 2800, 2900];
    const loja = precos.map((preco, i) =>
      ap({ id: `p${i}`, modelo: 'iPhone 13', capacidade: '128GB', preco, created_at: `2026-09-0${i + 1}T12:00:00Z` })
    );
    assert.deepEqual(sugerirPreco({ modelo: 'iphone 13', capacidade: '128gb', condicao: 'seminovo' }, loja), {
      valor: 2700,
      base: 5,
      minimo: 2500,
      maximo: 2900,
      criterio: 'exato',
    });
  });

  it('sem aparelho da mesma condição, avisa que a base é de outra condição', () => {
    const loja = [ap({ id: '1', modelo: 'iPhone 13', capacidade: '128GB', preco: 3000, condicao: 'novo' })];
    const sugestao = sugerirPreco({ modelo: 'iPhone 13', capacidade: '128GB', condicao: 'usado' }, loja);
    assert.equal(sugestao?.criterio, 'sem_condicao');
    assert.equal(sugerirPreco({ modelo: 'iPhone 14', capacidade: '128GB', condicao: 'usado' }, loja), null);
  });
});

describe('Duplicidade local', () => {
  const loja = [
    ap({ id: 'estoque', imei: IMEI_OK }),
    ap({ id: 'vendido', imei: IMEI_OK_2, ativo: false, status: 'vendido' }),
    ap({ id: 'manut', numeroSerie: 'DX3LKJ9QPN', status: 'manutencao' }),
  ];

  it('classifica pela gravidade', () => {
    assert.equal(procurarDuplicado({ imei: IMEI_OK }, loja, { carrinhoIds: ['estoque'] }).tipo, 'no_carrinho');
    assert.equal(procurarDuplicado({ imei: IMEI_OK }, loja).tipo, 'em_estoque');
    assert.equal(procurarDuplicado({ imei: IMEI_OK_2 }, loja).tipo, 'fora_do_estoque');
    assert.equal(procurarDuplicado({ numeroSerie: 'dx3lkj9qpn' }, loja).tipo, 'manutencao');
    assert.equal(procurarDuplicado({ imei: '111111111111111' }, loja).tipo, 'nenhuma');
    assert.equal(procurarDuplicado({}, loja).tipo, 'nenhuma');
  });

  it('aparelho com condicao legada "vendido" conta como fora do estoque', () => {
    const legado = [ap({ id: 'x', imei: IMEI_OK, ativo: false, status: 'disponivel', condicao: 'vendido' })];
    assert.equal(procurarDuplicado({ imei: IMEI_OK }, legado).tipo, 'fora_do_estoque');
  });

  it('ignora cadastro desfeito', () => {
    const desfeito = [
      ap({ id: 'x', imei: IMEI_OK, ativo: false, status: 'baixado', observacoes: MARCADORES.cadastroDesfeito }),
    ];
    assert.equal(procurarDuplicado({ imei: IMEI_OK }, desfeito).tipo, 'nenhuma');
  });

  it('cadastro desfeito que voltou ao estoque conta de novo como duplicidade', () => {
    const restaurado = [ap({ id: 'x', imei: IMEI_OK, observacoes: MARCADORES.cadastroDesfeito })];
    assert.equal(procurarDuplicado({ imei: IMEI_OK }, restaurado).tipo, 'em_estoque');
  });
});

describe('Margem', () => {
  it('calcula lucro e margem sobre o preço', () => {
    assert.deepEqual(calcularMargem(2810, 3260), { lucro: 450, percentual: 13.8, prejuizo: false, abaixoDoMinimo: false });
    assert.equal(calcularMargem(3000, 2800)?.prejuizo, true);
    assert.equal(calcularMargem(3000, 3200, 8)?.abaixoDoMinimo, true);
    assert.equal(calcularMargem(null, 3000), null);
  });
});

describe('Validação', () => {
  const valido = () =>
    formularioVazio({
      identificador: IMEI_OK,
      modelo: 'iPhone 13',
      marca: 'Apple',
      capacidade: '128GB',
      preco: 3000,
      custo: 2500,
      bateria: '87',
    });

  it('formulário completo passa', () => {
    assert.deepEqual(validarCadastroRapido(valido()), {});
  });

  it('bloqueia o que o popup antigo deixava passar', () => {
    const erros = validarCadastroRapido({ ...valido(), modelo: '  ', preco: 0, capacidade: null, bateria: '101' });
    assert.ok(erros.modelo);
    assert.ok(erros.preco);
    assert.ok(erros.capacidade);
    assert.ok(erros.bateria);
  });

  it('IMEI: vazio, incompleto e inválido bloqueiam; "Sem IMEI agora" e serial liberam', () => {
    assert.ok(validarCadastroRapido({ ...valido(), identificador: '' }).identificador);
    assert.match(validarCadastroRapido({ ...valido(), identificador: '3569380356' }).identificador || '', /10 de 15/);
    assert.ok(validarCadastroRapido({ ...valido(), identificador: '490154203237519' }).identificador);
    assert.equal(validarCadastroRapido({ ...valido(), identificador: '', semImei: true }).identificador, undefined);
    assert.equal(
      validarCadastroRapido({ ...valido(), identificador: '490154203237519', identificadorEhSerial: true }).identificador,
      undefined
    );
  });

  it('modelo "N/A" não passa', () => {
    assert.ok(validarCadastroRapido({ ...valido(), modelo: 'N/A' }).modelo);
  });

  it('aparelho novo não precisa de bateria', () => {
    assert.deepEqual(validarCadastroRapido({ ...valido(), condicao: 'novo', bateria: '' }), {});
  });
});

describe('Payload', () => {
  const agora = new Date('2026-09-10T12:16:38Z');
  const base = formularioVazio({
    identificador: IMEI_OK,
    modelo: 'iphone 13',
    marca: 'apple',
    capacidade: '128gb',
    cor: 'azul',
    preco: 3000,
    custo: 2500,
    bateria: '87',
    acessorios: ['Caixa', 'Cabo'],
  });

  it('grava o que foi digitado, sem N/A e com a origem', () => {
    const p = montarPayloadCadastroRapido(base, {
      usuarioNome: 'Ana',
      podeVerFinanceiro: true,
      agora,
      codigo: '12345678',
      coresConhecidas: ['Azul'],
    });
    assert.equal(p.modelo, 'iPhone 13');
    assert.equal(p.marca, 'Apple');
    assert.equal(p.capacidade, '128GB');
    assert.equal(p.cor, 'Azul');
    assert.equal(p.imei, IMEI_OK);
    assert.equal(p.saude_bateria, '87%');
    assert.equal(p.custo, 2500);
    assert.equal(p.precoAtacado, 2650);
    assert.equal(p.preco_atacado, 2650);
    assert.equal(p.codigo, '12345678');
    assert.equal(p.status, 'disponivel');
    assert.equal(p.acessorios, 'Caixa, Cabo');
    assert.equal(p.observacoes, 'Cadastrado no PDV por Ana em 10/09/2026 às 09:16');
    assert.ok(!JSON.stringify(p).includes('N/A'));
  });

  it('capacidade e cor vazias viram null; aparelho novo grava bateria 100%', () => {
    const p = montarPayloadCadastroRapido(
      { ...base, capacidade: null, cor: '', condicao: 'novo', bateria: '' },
      { podeVerFinanceiro: true, agora, codigo: '1' }
    );
    assert.equal(p.capacidade, null);
    assert.equal(p.cor, null);
    assert.equal(p.saude_bateria, '100%');
  });

  it('quem não vê financeiro grava custo 0 e marca CUSTO_PENDENTE; sem IMEI marca IMEI_PENDENTE', () => {
    const p = montarPayloadCadastroRapido(
      { ...base, identificador: '', semImei: true },
      { usuarioNome: 'Vendedor', podeVerFinanceiro: false, agora, codigo: '1' }
    );
    assert.equal(p.custo, 0);
    assert.equal(p.imei, null);
    assert.equal(p.precoAtacado, 0);
    assert.match(p.observacoes, /CUSTO_PENDENTE/);
    assert.match(p.observacoes, /IMEI_PENDENTE/);
  });

  it('observações nunca levam "ID:", que a etiqueta e a remontagem leem como código', () => {
    const p = montarPayloadCadastroRapido(
      { ...base, fornecedor: 'João' },
      { podeVerFinanceiro: true, agora, codigo: '1', recompraDe: { id: '9876543' } }
    );
    assert.match(p.observacoes, /Fornecedor: João/);
    assert.match(p.observacoes, /Recompra/);
    assert.ok(!/\bID:/i.test(p.observacoes));
  });

  it('código da etiqueta tem 8 dígitos e não repete um existente', () => {
    const sequencia = [0.1, 0.1, 0.2];
    const codigo = gerarCodigoEtiqueta([{ codigo: '19000000' }], () => sequencia.shift() ?? 0.5);
    assert.equal(codigo, '28000000');
  });
});

describe('Gravação', () => {
  const LOJA = 'loja-1';
  const payloadDe = (identificador: string) =>
    montarPayloadCadastroRapido(
      formularioVazio({ identificador, modelo: 'iPhone 13', marca: 'Apple', capacidade: '128GB', preco: 3000, custo: 2500 }),
      { usuarioNome: 'Ana', podeVerFinanceiro: true, codigo: '12345678' }
    );

  function montar(aparelhos: Record<string, unknown>[] = []) {
    const fake = criarSupabaseFake({ aparelhos, movimentacoes_estoque: [] });
    const criados: Record<string, unknown>[] = [];
    const logs: unknown[] = [];
    const deps = {
      lojaId: LOJA,
      usuarioNome: 'Ana',
      criarAparelho: async (payload: PayloadCadastroRapido) => {
        const linha = { ...payload, id: `novo-${criados.length + 1}`, loja_id: LOJA };
        fake.tabelas.aparelhos.push(linha);
        criados.push(linha);
        return linha as unknown as AparelhoBase;
      },
      registrarLog: async (l: unknown) => {
        logs.push(l);
      },
    };
    return { fake, criados, logs, deps };
  }

  it('IMEI já ativo no banco bloqueia antes do insert', async () => {
    const { fake, criados, deps } = montar([
      { id: 'a1', loja_id: LOJA, modelo: 'iPhone 13', imei: IMEI_OK, ativo: true, status: 'disponivel', condicao: 'seminovo' },
    ]);
    await assert.rejects(
      cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), deps),
      (e: unknown) => e instanceof ErroCadastroRapido && e.codigo === 'duplicado_em_estoque' && e.existente?.id === 'a1'
    );
    assert.equal(criados.length, 0);
  });

  it('IMEI que já saiu do estoque exige confirmar recompra', async () => {
    const vendido = {
      id: 'v1',
      loja_id: LOJA,
      modelo: 'iPhone 13',
      imei: IMEI_OK,
      ativo: false,
      status: 'vendido',
      condicao: 'seminovo',
    };
    const cenario = montar([vendido]);
    await assert.rejects(
      cadastrarAparelhoRapido(cenario.fake.client, payloadDe(IMEI_OK), cenario.deps),
      (e: unknown) => e instanceof ErroCadastroRapido && e.codigo === 'duplicado_fora_do_estoque'
    );
    assert.equal(cenario.criados.length, 0);

    const confirmado = await cadastrarAparelhoRapido(cenario.fake.client, payloadDe(IMEI_OK), cenario.deps, {
      aceitarRecompra: true,
    });
    assert.equal(confirmado.aparelho.id, 'novo-1');
  });

  it('o mesmo IMEI em outra loja não é duplicidade', async () => {
    const { fake, deps } = montar([
      { id: 'b1', loja_id: 'outra-loja', imei: IMEI_OK, ativo: true, status: 'disponivel', condicao: 'seminovo' },
    ]);
    const r = await cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), deps);
    assert.equal(r.aparelho.id, 'novo-1');
  });

  it('cadastro grava entrada em movimentacoes_estoque e log com a origem PDV', async () => {
    const { fake, logs, deps } = montar();
    const r = await cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), deps);
    assert.equal(r.auditoriaRegistrada, true);

    const movimentos = fake.tabelas.movimentacoes_estoque;
    assert.equal(movimentos.length, 1);
    assert.equal(movimentos[0].tipo, 'entrada');
    assert.equal(movimentos[0].aparelho_id, 'novo-1');
    assert.equal(movimentos[0].loja_id, LOJA);

    assert.equal(logs.length, 1);
    assert.equal((logs[0] as { acao: string }).acao, 'Aparelho cadastrado pelo PDV');
  });

  it('falha na auditoria não vira erro de cadastro (evita cadastrar duas vezes)', async () => {
    const fake = criarSupabaseFake(
      { aparelhos: [], movimentacoes_estoque: [] },
      { falharInsertEm: ['movimentacoes_estoque'] }
    );
    const r = await cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), {
      lojaId: LOJA,
      criarAparelho: async (p) => {
        const linha = { ...p, id: 'n1', loja_id: LOJA };
        fake.tabelas.aparelhos.push(linha);
        return linha as unknown as AparelhoBase;
      },
    });
    assert.equal(r.aparelho.id, 'n1');
    assert.equal(r.auditoriaRegistrada, false);
  });

  it('erro do banco no insert chega com a mensagem real', async () => {
    const fake = criarSupabaseFake({ aparelhos: [], movimentacoes_estoque: [] });
    await assert.rejects(
      cadastrarAparelhoRapido<AparelhoBase>(fake.client, payloadDe(IMEI_OK), {
        lojaId: LOJA,
        criarAparelho: async () => {
          throw { message: 'null value in column "marca" violates not-null constraint' };
        },
      }),
      (e: unknown) => e instanceof ErroCadastroRapido && e.codigo === 'falha_cadastro' && /not-null/.test(e.message)
    );
  });

  it('desfazer tira do estoque como baixa auditada, sem DELETE, e libera o IMEI', async () => {
    const { fake, deps } = montar();
    const { aparelho } = await cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), deps);

    const r = await desfazerCadastroRapido(fake.client, aparelho, { lojaId: LOJA, usuarioNome: 'Ana' });
    assert.equal(r.afetados, 1);

    const linha = fake.tabelas.aparelhos.find((a) => a.id === aparelho.id);
    assert.equal(linha?.ativo, false);
    assert.equal(linha?.status, 'baixado');
    assert.equal(linha?.motivo_saida, 'baixa_manual');
    assert.notEqual(linha?.condicao, 'vendido');
    assert.match(String(linha?.observacoes), /CADASTRO_DESFEITO/);
    assert.ok(!fake.chamadas.some((c) => c.operacao === 'delete'));
    assert.ok(fake.tabelas.movimentacoes_estoque.some((m) => m.tipo === 'baixa' && m.aparelho_id === aparelho.id));

    // Relançar o mesmo IMEI não pede confirmação de recompra.
    const relancado = await cadastrarAparelhoRapido(fake.client, payloadDe(IMEI_OK), deps);
    assert.equal(relancado.aparelho.id, 'novo-2');
  });

  it('desfazer não mexe em aparelho que já foi vendido', async () => {
    const fake = criarSupabaseFake({
      aparelhos: [{ id: 'x', loja_id: LOJA, ativo: false, status: 'vendido', condicao: 'seminovo' }],
      movimentacoes_estoque: [],
    });
    const r = await desfazerCadastroRapido(fake.client, { id: 'x' }, { lojaId: LOJA });
    assert.equal(r.afetados, 0);
    assert.equal(fake.tabelas.aparelhos[0].status, 'vendido');
  });
});
