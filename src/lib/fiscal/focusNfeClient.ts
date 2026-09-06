/**
 * Cliente REST Focus NFe v2
 * Suporta Homologação e Produção, emissão de NFC-e (mod 65) e NF-e (mod 55),
 * consulta de status, DANFE e download de XML.
 */

import { AmbienteFiscal, TipoNotaFiscal } from './types';

const URLS = {
  homologacao: 'https://homologacao.focusnfe.com.br/v2',
  producao: 'https://api.focusnfe.com.br/v2'
};

export class FocusNFeClient {
  private token: string;
  private ambiente: AmbienteFiscal;
  private baseUrl: string;

  constructor(token?: string, ambiente: AmbienteFiscal = 'homologacao') {
    this.token = token || process.env.FOCUS_NFE_API_TOKEN || '';
    this.ambiente = ambiente;
    this.baseUrl = URLS[ambiente] || URLS.homologacao;
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(this.token + ':').toString('base64');
  }

  public isConfigured(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  /**
   * Envia uma NFC-e (modelo 65) para autorização na Focus NFe / SEFAZ
   */
  async emitirNFCe(referencia: string, payload: any): Promise<any> {
    if (!this.isConfigured()) {
      return {
        status: 'nao_configurado',
        mensagem_sefaz: 'Token da Focus NFe não configurado para esta loja.'
      };
    }

    const url = `${this.baseUrl}/nfce?ref=${encodeURIComponent(referencia)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({ status: 'erro', mensagem: 'Resposta inválida do servidor Focus NFe' }));
    return {
      httpStatus: resp.status,
      ...data
    };
  }

  /**
   * Envia uma NF-e (modelo 55) para autorização na Focus NFe / SEFAZ
   */
  async emitirNFe(referencia: string, payload: any): Promise<any> {
    if (!this.isConfigured()) {
      return {
        status: 'nao_configurado',
        mensagem_sefaz: 'Token da Focus NFe não configurado para esta loja.'
      };
    }

    const url = `${this.baseUrl}/nfe?ref=${encodeURIComponent(referencia)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({ status: 'erro', mensagem: 'Resposta inválida do servidor Focus NFe' }));
    return {
      httpStatus: resp.status,
      ...data
    };
  }

  /**
   * Consulta o status de uma NFC-e ou NF-e pela referência da venda
   */
  async consultarNota(tipo: TipoNotaFiscal, referencia: string): Promise<any> {
    if (!this.isConfigured()) {
      return {
        status: 'nao_configurado',
        mensagem_sefaz: 'Token da Focus NFe não configurado.'
      };
    }

    const endpoint = tipo === 'nfe' ? 'nfe' : 'nfce';
    const url = `${this.baseUrl}/${endpoint}/${encodeURIComponent(referencia)}?completa=1`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader()
      }
    });

    const data = await resp.json().catch(() => ({ status: 'erro', mensagem: 'Resposta inválida ao consultar nota' }));
    return {
      httpStatus: resp.status,
      ...data
    };
  }

  /**
   * Cancela uma nota fiscal autorizada
   */
  async cancelarNota(tipo: TipoNotaFiscal, referencia: string, justificativa: string): Promise<any> {
    if (!this.isConfigured()) {
      return {
        status: 'nao_configurado',
        mensagem_sefaz: 'Token da Focus NFe não configurado.'
      };
    }

    const endpoint = tipo === 'nfe' ? 'nfe' : 'nfce';
    const url = `${this.baseUrl}/${endpoint}/${encodeURIComponent(referencia)}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify({ justificativa })
    });

    const data = await resp.json().catch(() => ({ status: 'erro', mensagem: 'Erro ao cancelar nota' }));
    return {
      httpStatus: resp.status,
      ...data
    };
  }

  /**
   * Obtém a URL pública absoluta do DANFE (PDF)
   */
  getDanfeUrl(caminhoDanfe?: string): string | undefined {
    if (!caminhoDanfe) return undefined;
    if (caminhoDanfe.startsWith('http')) return caminhoDanfe;
    return `${this.baseUrl}${caminhoDanfe.startsWith('/') ? '' : '/'}${caminhoDanfe}`;
  }

  /**
   * Obtém a URL pública absoluta do XML
   */
  getXmlUrl(caminhoXml?: string): string | undefined {
    if (!caminhoXml) return undefined;
    if (caminhoXml.startsWith('http')) return caminhoXml;
    return `${this.baseUrl}${caminhoXml.startsWith('/') ? '' : '/'}${caminhoXml}`;
  }
}
