/**
 * Tipos e Interfaces do Módulo Fiscal (Focus NFe: NFC-e mod 65 e NF-e mod 55)
 * Phone Center SaaS Multi-tenant
 */

export type AmbienteFiscal = 'homologacao' | 'producao';
export type TipoNotaFiscal = 'nfce' | 'nfe';
export type StatusNotaFiscal = 'pendente' | 'processando' | 'autorizada' | 'erro_autorizacao' | 'cancelada';

export interface DadosFiscaisLoja {
  ativo: boolean;
  focus_token?: string; // Token específico da loja (se vazio, usa global FOCUS_NFE_API_TOKEN)
  ambiente: AmbienteFiscal;
  cnpj: string;
  inscricao_estadual: string;
  razao_social: string;
  nome_fantasia: string;
  regime_tributario: '1' | '2' | '3'; // 1 = Simples Nacional, 2 = Simples Sublimite, 3 = Regime Normal
  
  // Endereço fiscal da loja
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;

  // Dados SEFAZ para NFC-e (mod 65)
  id_csc?: string; // ID do Token CSC SEFAZ (ex: '000001' ou '1')
  csc?: string;    // Código CSC
  serie_nfce: string; // Padrão: '1'
  numero_nfce_atual: number;

  // Dados SEFAZ para NF-e (mod 55)
  serie_nfe: string; // Padrão: '1'
  numero_nfe_atual: number;

  // Parâmetros Fiscais Padrão
  aliquota_icms_simples?: number; // Ex: 3.5%
  cfop_padrao_nfce: string;       // Ex: '5102'
  cfop_padrao_nfe: string;        // Ex: '5102' (dentro do estado) ou '6102'
  ncm_padrao_smartphones: string; // Ex: '8517.13.00'
  ncm_padrao_acessorios: string;  // Ex: '8517.79.00'

  // Configuração de Certificado Digital A1
  certificado_nome?: string;
  certificado_vencimento?: string;
  certificado_enviado?: boolean;
  certificado_pfx_base64?: string;
  certificado_senha?: string;

  // Automações
  emitir_automatico_pdv: boolean; // Emite NFC-e automaticamente ao concluir venda
  enviar_danfe_email_cliente: boolean;
}

export interface NotaFiscalRecord {
  id: string;
  loja_id: string;
  venda_id: string;
  tipo: TipoNotaFiscal;
  status: StatusNotaFiscal;
  numero?: number;
  serie?: string;
  chave_acesso?: string;
  protocolo?: string;
  mensagem_sefaz?: string;
  url_danfe?: string;
  url_xml?: string;
  caminho_danfe?: string;
  caminho_xml_nota?: string;
  xml_conteudo?: string;
  valor_total: number;
  destinatario_nome?: string;
  destinatario_documento?: string;
  tentativas: number;
  dados_emissao?: any;
  retorno_sefaz?: any;
  created_at?: string;
  updated_at?: string;
}

export interface RequisicaoEmissao {
  vendaId: string;
  tipo?: TipoNotaFiscal;
  lojaId?: string;
  destinatario?: {
    nome?: string;
    cpfCnpj?: string;
    email?: string;
    endereco?: {
      logradouro?: string;
      numero?: string;
      bairro?: string;
      municipio?: string;
      uf?: string;
      cep?: string;
    };
  };
}

export interface RespostaEmissao {
  sucesso: boolean;
  status: StatusNotaFiscal;
  mensagem: string;
  notaId?: string;
  vendaId: string;
  tipo: TipoNotaFiscal;
  chaveAcesso?: string;
  numero?: number;
  serie?: string;
  urlDanfe?: string;
  urlXml?: string;
  caminhoDanfe?: string;
  caminhoXml?: string;
  protocolo?: string;
  errosValidacao?: string[];
  configurado?: boolean;
}
