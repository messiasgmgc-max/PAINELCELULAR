import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarPendenciasNotinha,
  diagnosticarVendaPendente,
  ehNomeClienteGenerico,
  telefoneClienteValido,
} from './pendencias';
import type { Cliente } from '@/lib/db/types';

const criarCliente = (parcial: Partial<Cliente>): Cliente => ({
  id: 'cli-1',
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  telefone: '(31) 99999-8888',
  cpf: '123.456.789-00',
  dataCadastro: '2026-01-01T00:00:00.000Z',
  ativo: true,
  lojaId: 'loja-1',
  ...parcial,
});

describe('Diagnóstico detalhado de pendências da notinha', () => {
  it('identifica nomes genéricos e telefones inválidos corretamente', () => {
    assert.equal(ehNomeClienteGenerico(''), true);
    assert.equal(ehNomeClienteGenerico('Cliente Balcão'), true);
    assert.equal(ehNomeClienteGenerico('Consumidor'), true);
    assert.equal(ehNomeClienteGenerico('Carlos Eduardo'), false);

    assert.equal(telefoneClienteValido(''), false);
    assert.equal(telefoneClienteValido('00000000000'), false);
    assert.equal(telefoneClienteValido('319999'), false);
    assert.equal(telefoneClienteValido('(31) 98888-7777'), true);
  });

  it('lista exatamente quais dados estão incompletos em venda de balcão sem cadastro', () => {
    const diag = diagnosticarVendaPendente(
      {
        id: 'v-1',
        clienteNome: 'Cliente Balcão',
        clienteId: null,
        tipoEntrega: 'Varejo',
        custo: 0,
        itens: [{ descricao: 'iPhone 15 128GB', quantidade: 1, valorExibir: 4500, valorInterno: 0, desconto: 0, tipoDesconto: 'R$', total: 4500, observacao: '' }],
      },
      [criarCliente({})],
      []
    );

    assert.equal(diag.isPendente, true);
    assert.deepEqual(diag.motivosObrigatorios, [
      'Nome do cliente',
      'Cadastro do cliente',
      'Telefone / WhatsApp',
    ]);
    assert.deepEqual(diag.camposComplementares, ['E-mail', 'CPF / CNPJ', 'IMEI', 'Custo']);
  });

  it('indica apenas Telefone / WhatsApp quando cliente cadastrado está com telefone zerado', () => {
    const cli = criarCliente({
      id: 'cli-zero',
      nome: 'João Pedro',
      telefone: '00000000000',
      email: 'sem@email.com',
      cpf: '',
    });

    const diag = diagnosticarVendaPendente(
      {
        id: 'v-2',
        clienteId: 'cli-zero',
        clienteNome: 'João Pedro',
        tipoEntrega: 'Varejo',
        custo: 3200,
        itens: [{ descricao: 'iPhone 14', imei: '358012345678901', observacao: '' }],
      },
      [cli],
      []
    );

    assert.equal(diag.isPendente, true);
    assert.deepEqual(diag.motivosObrigatorios, ['Telefone / WhatsApp']);
    assert.deepEqual(diag.camposComplementares, ['E-mail', 'CPF / CNPJ']);
    assert.equal(diag.clienteVinculado?.id, 'cli-zero');
  });

  it('não marca como pendente quando o cliente é encontrado pelo nome com telefone válido', () => {
    const cli = criarCliente({
      id: 'cli-ok',
      nome: 'Fernanda Souza',
      telefone: '31987654321',
      email: 'fernanda@teste.com',
      cpf: '111.222.333-44',
    });

    const diag = diagnosticarVendaPendente(
      {
        id: 'v-3',
        clienteId: null,
        clienteNome: 'Fernanda Souza',
        tipoEntrega: 'Varejo',
        custo: 2500,
        dados_cliente_pendente: false,
        itens: [{ descricao: 'iPhone 13', imei: '350011223344556', observacao: '' }],
      },
      [cli],
      []
    );

    assert.equal(diag.isPendente, false);
    assert.deepEqual(diag.motivosObrigatorios, []);
    assert.deepEqual(diag.camposComplementares, []);
    assert.equal(diag.clienteVinculado?.id, 'cli-ok');
  });

  it('nunca marca venda de atacado como pendente de dados do cliente do varejo', () => {
    const diag = diagnosticarVendaPendente(
      {
        id: 'v-4',
        clienteNome: 'Lojista Parceiro',
        tipoEntrega: 'Atacado / Lojista',
        custo: 4000,
        itens: [{ descricao: 'Lote iPhone' }],
      },
      [],
      []
    );

    assert.equal(diag.isPendente, false);
    assert.deepEqual(diag.motivosObrigatorios, []);
  });

  it('avalia pendências em tempo real no formulário', () => {
    const parcial = avaliarPendenciasNotinha({
      nome: 'Ana Clara',
      clienteId: 'novo',
      telefone: '31999990000',
      email: '',
      cpf: '',
      imei: '359988776655443',
      custo: 2100,
      isAtacado: false,
    });

    assert.equal(parcial.isPendente, false);
    assert.deepEqual(parcial.motivosObrigatorios, []);
    assert.deepEqual(parcial.camposComplementares, ['E-mail', 'CPF / CNPJ']);
  });
});
