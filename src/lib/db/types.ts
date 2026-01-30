// Tipos para autenticação
export interface Usuario {
  id: string;
  email: string;
  senha: string; // hash bcrypt
  nome: string;
  role: 'super_admin' | 'admin' | 'operador' | 'tecnico' | 'vendedor';
  ativo: boolean;
  dataCadastro: string;
  ultimoAcesso?: string;
}

export interface SessaoUsuario {
  id: string;
  email: string;
  nome: string;
  role: 'super_admin' | 'admin' | 'operador' | 'tecnico' | 'vendedor';
  lojaId?: string;
}

// Tipos para clientes
export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  dataCadastro: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para aparelhos
export interface Aparelho {
  id: string;
  marca: string;
  modelo: string;
  imei?: string;
  numeroSerie?: string;
  cor?: string;
  capacidade?: string;
  condicao: "novo" | "seminovo" | "usado" | "danificado";
  preco: number;
  descricao?: string;
  cliente?: string; // Nome do cliente proprietário
  clienteId?: string; // ID do cliente
  acessorios?: string; // Lista de acessórios inclusos
  observacoes?: string;
  dataCadastro: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para peças
export interface Peca {
  id: string;
  codigoUnico: string; // Código único da peça
  nome: string;
  descricao?: string;
  fornecedor?: string;
  custoPeca: number; // Valor de custo
  vendaPeca: number; // Valor de venda
  margem?: number; // Margem de lucro em %
  estoque: number; // Quantidade atual em estoque
  estoqueMinimo: number; // Quantidade mínima
  estoqueMaximo: number; // Quantidade máxima
  localizacao?: string; // Localização física no depósito
  codigoBarras?: string; // Código de barras
  compatibilidade?: string; // Compatibilidade com modelos
  dataCadastro: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para Ordem de Serviço
export interface PecaUtilizada {
  pecaId: string;
  pecaNome: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface OrdemServico {
  id: string;
  numeroOS: number; // Número sequencial automático
  clienteId: string;
  clienteNome: string;
  aparelhoId?: string;
  aparelhoMarca: string;
  aparelhoModelo: string;
  imei?: string;
  defeito: string; // Defeito relatado
  checklist?: string[]; // Checklist de verificação
  servicosARealizarQuais?: string; // Descrição dos serviços
  pecasUtilizadas: PecaUtilizada[]; // Lista de peças usadas
  tecnicoId?: string;
  tecnicoNome?: string;
  prioridade: "normal" | "urgente" | "express"; // Prioridade
  status: "aguardando_pecas" | "em_andamento" | "concluido" | "aguardando_retirada" | "entregue"; // Status
  custoPecas: number; // Soma de peças
  maoDeObra: number; // Valor de mão de obra
  custoTotal: number; // custoPecas + maoDeObra
  precoVenda: number; // Preço final
  lucro: number; // lucro = precoVenda - custoTotal
  margemLucro: number; // Margem em %
  prazoEstimado?: string; // Data estimada de conclusão
  dataEntrada: string;
  dataConclusao?: string;
  dataRetirada?: string;
  observacoes?: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para Técnicos
export interface Tecnico {
  id: string;
  nome: string;
  email?: string;
  telefone: string;
  cpf?: string;
  especialidade?: string; // Ex: "Tela", "Bateria", "Placa"
  dataCadastro: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para agendamentos
export interface Agendamento {
  id: string;
  clienteId: string;
  clienteNome: string;
  telefone: string;
  data: string; // ISO format YYYY-MM-DD HH:mm
  descricao: string;
  tecnicoId?: string;
  tecnicoNome?: string;
  aparelhoId?: string;
  aparelhoDescricao?: string;
  status: 'agendado' | 'confirmado' | 'concluido' | 'cancelado';
  observacoes?: string;
  dataCadastro: string;
  ativo: boolean;
  lojaId: string;
}

// Tipos para garantias
export interface Garantia {
  id: string;
  osId: string;
  osNumero: number;
  clienteId: string;
  clienteNome: string;
  aparelhoDescricao: string;
  dataInicio: string; // ISO format
  diasGarantia: number; // Período de garantia em dias
  descricao?: string;
  historico: {
    data: string;
    acao: string; // "Troca", "Reparo", "Verificação"
    descricao?: string;
  }[];
  ativo: boolean;
  dataCadastro: string;
  lojaId: string;
}

// Tipos para Vendas
export interface VendaItem {
  id: string;
  aparelhoId: string;
  descricao: string;
  quantidade: number;
  valorInterno: number;
  valorExibir: number;
  desconto: number;
  tipoDesconto: 'R$' | '%';
  total: number;
  observacao: string;
}

export interface Venda {
  id: string;
  clienteId?: string;
  clienteNome: string;
  vendedor?: string;
  tipoEntrega?: string;
  itens: VendaItem[];
  valor: number;
  custo: number;
  lucro: number;
  percentualLucro: number;
  dataPagamento: string;
  status: 'pendente' | 'pago' | 'cancelado';
  metodo: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'boleto';
  descricao?: string;
  garantia?: string;
  descontoTotal?: number;
  lojaId: string;
}

// Resposta padrão da API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
