import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAGENS_LEITOR,
  acaoPermissaoCamera,
  classificarFalhaNativa,
  escolherMotorLeitura,
  mensagemErroCameraWeb,
} from './motor';

describe('Motor de leitura', () => {
  it('app com o plugin usa o leitor nativo', () => {
    assert.equal(escolherMotorLeitura({ plataformaNativa: true, pluginDisponivel: true, nativoFalhou: false }), 'nativo');
  });

  it('navegador e Electron usam o html5-qrcode', () => {
    assert.equal(escolherMotorLeitura({ plataformaNativa: false, pluginDisponivel: false, nativoFalhou: false }), 'html5');
    assert.equal(escolherMotorLeitura({ plataformaNativa: false, pluginDisponivel: true, nativoFalhou: false }), 'html5');
  });

  it('APK antigo sem o plugin cai no html5-qrcode', () => {
    assert.equal(escolherMotorLeitura({ plataformaNativa: true, pluginDisponivel: false, nativoFalhou: false }), 'html5');
  });

  it('depois de o nativo falhar, cai no html5-qrcode', () => {
    assert.equal(escolherMotorLeitura({ plataformaNativa: true, pluginDisponivel: true, nativoFalhou: true }), 'html5');
  });
});

describe('Permissão da câmera no app', () => {
  it('liberada inicia a leitura', () => {
    assert.equal(acaoPermissaoCamera('granted', false), 'iniciar');
    assert.equal(acaoPermissaoCamera('limited', true), 'iniciar');
  });

  it('ainda não perguntada pede a permissão', () => {
    assert.equal(acaoPermissaoCamera('prompt', false), 'pedir');
    assert.equal(acaoPermissaoCamera('prompt-with-rationale', false), 'pedir');
    assert.equal(acaoPermissaoCamera(undefined, false), 'pedir');
  });

  it('negada, ou sem resposta depois de pedir, mostra a mensagem', () => {
    assert.equal(acaoPermissaoCamera('denied', false), 'negada');
    assert.equal(acaoPermissaoCamera('prompt', true), 'negada');
    assert.equal(acaoPermissaoCamera(null, true), 'negada');
  });
});

describe('Falha do leitor nativo', () => {
  it('permissão', () => {
    assert.equal(classificarFalhaNativa(new Error('User denied access to camera.')), 'permissao');
    assert.equal(classificarFalhaNativa({ message: 'Camera permission is required' }), 'permissao');
  });

  it('cancelado pela pessoa', () => {
    assert.equal(classificarFalhaNativa({ message: 'scan canceled.' }), 'cancelado');
  });

  it('qualquer outra coisa é indisponível (vai para o html5-qrcode)', () => {
    assert.equal(classificarFalhaNativa(new Error('"BarcodeScanner" plugin is not implemented on android')), 'indisponivel');
    assert.equal(classificarFalhaNativa({ code: 'UNAVAILABLE', message: 'Camera binding failed' }), 'indisponivel');
    assert.equal(classificarFalhaNativa(undefined), 'indisponivel');
  });
});

describe('Mensagem do erro da câmera no html5-qrcode', () => {
  it('permissão negada no app manda para as configurações', () => {
    assert.equal(mensagemErroCameraWeb('NotAllowedError: Permission denied', true), MENSAGENS_LEITOR.permissaoNegadaApp);
  });

  it('permissão negada no navegador fala do cadeado do site', () => {
    const erro = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    assert.equal(mensagemErroCameraWeb(erro, false), MENSAGENS_LEITOR.permissaoNegadaNavegador);
  });

  it('sem câmera, câmera ocupada e sem HTTPS', () => {
    assert.equal(mensagemErroCameraWeb('NotFoundError: Requested device not found', false), MENSAGENS_LEITOR.semCamera);
    assert.equal(mensagemErroCameraWeb({ name: 'NotReadableError', message: 'Could not start video source' }, false), MENSAGENS_LEITOR.cameraOcupada);
    assert.equal(mensagemErroCameraWeb('Camera streaming not supported by the browser.', false), MENSAGENS_LEITOR.semHttps);
  });

  it('erro desconhecido mantém o texto de hoje', () => {
    assert.equal(mensagemErroCameraWeb(new Error('Algo estranho'), false), 'Algo estranho');
    assert.equal(mensagemErroCameraWeb(undefined, false), MENSAGENS_LEITOR.generico);
  });
});
