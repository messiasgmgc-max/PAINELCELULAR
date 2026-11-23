import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarMensagemEntradaGrupo,
  notificarEntradaGrupoEntradas,
} from './notificarEntradaEstoque';

test('formatarMensagemEntradaGrupo formata entrada por foto com avaria, bateria, IMEI e data', () => {
  const msg = formatarMensagemEntradaGrupo({
    itens: [
      {
        marca: 'Apple',
        modelo: 'iPhone 16 Pro Max',
        capacidade: '256GB',
        cor: 'Desert',
        bateria: 84,
        imei: '6147',
        codigo: 'AP-123456',
        observacoes: 'Obs: (Traseira quebrada) | Bateria: 84% | IMEI: 6147',
        custo: 4200,
      },
    ],
    usuarioNome: 'Messias',
    dataEntrada: '2026-11-21',
    origemLabel: 'PV • Foto',
  });

  assert.match(msg, /ENTRADA REGISTRADA NO ESTOQUE/);
  assert.match(msg, /21\/11\/2026/);
  assert.match(msg, /Messias \(PV • Foto\)/);
  assert.match(msg, /iPhone 16 Pro Max 256GB Desert/);
  assert.match(msg, /84%/);
  assert.match(msg, /6147/);
  assert.match(msg, /Traseira quebrada/);
  assert.match(msg, /4\.200,00/);
});

test('notificarEntradaGrupoEntradas envia ao grupo de entradas quando originada do PV pessoal', async () => {
  const envios: Array<{ telefone: string; texto: string }> = [];

  const res = await notificarEntradaGrupoEntradas({
    supabase: null,
    lojaId: 'loja-1',
    itens: [
      {
        modelo: 'iPhone 15 Pro Max',
        capacidade: '256GB',
        cor: 'Natural',
        imei: '7887',
        bateria: 92,
      },
      {
        modelo: 'iPhone 16 Pro Max',
        capacidade: '256GB',
        cor: 'Desert',
        imei: '6147',
        bateria: 84,
        observacoes: 'Traseira quebrada',
      },
    ],
    usuarioNome: 'Messias',
    origemIsGroup: false,
    origemRemoteJid: '5531993586377@s.whatsapp.net',
    resolverGrupoJid: async () => '120363000000001@g.us',
    enviarTexto: async ({ telefone, texto }) => {
      envios.push({ telefone, texto });
      return { success: true };
    },
  });

  assert.equal(res.enviado, true);
  assert.equal(res.grupoJid, '120363000000001@g.us');
  assert.equal(envios.length, 1);
  assert.equal(envios[0].telefone, '120363000000001@g.us');
  assert.match(envios[0].texto, /Total:\* 2 aparelhos/);
  assert.match(envios[0].texto, /Traseira quebrada/);
});

test('notificarEntradaGrupoEntradas não duplica quando entrada já veio de um grupo', async () => {
  let enviou = false;

  const res = await notificarEntradaGrupoEntradas({
    supabase: null,
    lojaId: 'loja-1',
    itens: [{ modelo: 'iPhone 14', capacidade: '128GB', cor: 'Preto' }],
    usuarioNome: 'Messias',
    origemIsGroup: true,
    origemRemoteJid: '120363000000001@g.us',
    resolverGrupoJid: async () => '120363000000001@g.us',
    enviarTexto: async () => {
      enviou = true;
      return { success: true };
    },
  });

  assert.equal(res.enviado, false);
  assert.equal(res.motivo, 'origem_grupo');
  assert.equal(enviou, false);
});

test('notificarEntradaGrupoEntradas trata ausência de grupo sem falhar o cadastro', async () => {
  const res = await notificarEntradaGrupoEntradas({
    supabase: null,
    lojaId: 'loja-1',
    itens: [{ modelo: 'iPhone 13', capacidade: '128GB' }],
    usuarioNome: 'Messias',
    origemIsGroup: false,
    resolverGrupoJid: async () => null,
    enviarTexto: async () => ({ success: true }),
  });

  assert.equal(res.enviado, false);
  assert.equal(res.motivo, 'grupo_nao_encontrado');
});
