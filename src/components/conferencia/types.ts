export type AcaoFaltante = 'manter' | 'vendido' | 'manutencao' | 'atacado' | 'remover';

export interface ItemEscaneado {
  codigoLido: string;
  timestamp: string;
  aparelhoEncontrado?: any;
}

export interface RascunhoConferencia {
  lojaId: string;
  usuarioId: string;
  dataAtualizacao: string;
  escaneados: ItemEscaneado[];
  totalEstoqueSnapshot: number;
}

export type FlashColor = 'none' | 'green' | 'yellow' | 'red';

export interface DesambiguacaoModalProps {
  codigoDigitado: string;
  candidatos: any[];
  onSelecionar: (aparelho: any) => void;
  onCancelar: () => void;
}
