import { registrarCapabilities, todasCapabilities } from './core';
import { capabilitiesEstoque } from './estoque';
import { capabilitiesVendas } from './vendas';
import { capabilitiesServicos } from './servicos';
import { capabilitiesClientes } from './clientes';

// O registro é populado uma única vez, no carregamento do módulo.
if (todasCapabilities().length === 0) {
  registrarCapabilities([
    ...capabilitiesEstoque,
    ...capabilitiesVendas,
    ...capabilitiesServicos,
    ...capabilitiesClientes,
  ]);
}

export * from './core';
