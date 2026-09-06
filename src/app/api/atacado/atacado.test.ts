import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function formatarMensagemCobranca(
  template: string,
  dados: { nome: string; valor: number; chavePix: string; nomeLoja: string; itens?: string }
): string {
  const valorFormatado = dados.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return template
    .replace(/\{nome\}/gi, dados.nome)
    .replace(/\{valor\}/gi, valorFormatado)
    .replace(/\{chave_pix\}/gi, dados.chavePix)
    .replace(/\{nome_loja\}/gi, dados.nomeLoja)
    .replace(/\{itens\}/gi, dados.itens || 'retiradas de atacado');
}

function normalizarTelefoneWhatsapp(numero: string): string | null {
  const limpo = numero.replace(/\D/g, '');
  if (limpo.length < 10) return null;
  if (limpo.startsWith('55') && limpo.length >= 12) return limpo;
  return '55' + limpo;
}

function validarHorarioDisparo(horario: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(horario);
}

describe('Testes de Automação e Bot de Atacado', () => {
  it('deve interpolar corretamente variáveis no template de cobrança do WhatsApp', () => {
    const template = 'Olá {nome}, seu saldo pendente na {nome_loja} é de {valor}. Pix: {chave_pix}.';
    const resultado = formatarMensagemCobranca(template, {
      nome: 'Carlos Celulares',
      valor: 4500,
      chavePix: 'loja@pix.com',
      nomeLoja: 'Phone Center Atacado',
    });

    assert.ok(resultado.includes('Carlos Celulares'));
    assert.ok(resultado.includes('Phone Center Atacado'));
    assert.ok(resultado.includes('loja@pix.com'));
    assert.ok(resultado.includes('4.500,00'));
  });

  it('deve normalizar telefones de WhatsApp corretamente para o padrão Evolution API', () => {
    assert.equal(normalizarTelefoneWhatsapp('(31) 99358-6377'), '5531993586377');
    assert.equal(normalizarTelefoneWhatsapp('31993586377'), '5531993586377');
    assert.equal(normalizarTelefoneWhatsapp('5531993586377'), '5531993586377');
    assert.equal(normalizarTelefoneWhatsapp('123'), null);
  });

  it('deve validar horários de disparo no formato HH:MM', () => {
    assert.equal(validarHorarioDisparo('10:00'), true);
    assert.equal(validarHorarioDisparo('08:30'), true);
    assert.equal(validarHorarioDisparo('23:59'), true);
    assert.equal(validarHorarioDisparo('24:00'), false);
    assert.equal(validarHorarioDisparo('10:65'), false);
    assert.equal(validarHorarioDisparo('invalido'), false);
  });

  it('deve formatar valores monetários de saldo devedor de forma confiável', () => {
    const valor = 1250.75;
    const formatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    assert.ok(formatado.includes('1.250,75'));
  });
});
