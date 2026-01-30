import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { OrdemServico, PecaUtilizada } from './types';
import { atualizarEstoque } from './pecas';

const dataDir = join(process.cwd(), 'data');
const ordensPath = join(dataDir, 'ordensServico.json');

// Função auxiliar para ler arquivo
async function lerOrdensServico(): Promise<OrdemServico[]> {
  try {
    const dados = await fs.readFile(ordensPath, 'utf-8');
    return JSON.parse(dados);
  } catch (error) {
    return [];
  }
}

// Função auxiliar para escrever arquivo
async function salvarOrdensServico(ordens: OrdemServico[]): Promise<void> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(ordensPath, JSON.stringify(ordens, null, 2));
  } catch (error) {
    throw new Error(`Erro ao salvar ordens de serviço: ${error}`);
  }
}

// Obter número sequencial para próxima OS
async function obterProximoNumeroOS(): Promise<number> {
  const ordens = await lerOrdensServico();
  if (ordens.length === 0) return 1;
  
  const numeros = ordens.map(o => o.numeroOS).sort((a, b) => b - a);
  return (numeros[0] || 0) + 1;
}

// Calcular custos
function calcularCustos(pecasUtilizadas: PecaUtilizada[], maoDeObra: number) {
  const custoPecas = pecasUtilizadas.reduce((sum, peca) => sum + peca.valorTotal, 0);
  const custoTotal = custoPecas + maoDeObra;
  
  return { custoPecas, custoTotal };
}

// Obter todas as OS
export async function getOrdensServico(): Promise<OrdemServico[]> {
  try {
    const ordens = await lerOrdensServico();
    return ordens.filter(o => o.ativo).sort((a, b) => b.numeroOS - a.numeroOS);
  } catch (error) {
    throw new Error(`Erro ao obter ordens de serviço: ${error}`);
  }
}

// Obter OS por ID
export async function getOrdemServicoById(id: string): Promise<OrdemServico | null> {
  try {
    const ordens = await lerOrdensServico();
    return ordens.find(o => o.id === id) || null;
  } catch (error) {
    throw new Error(`Erro ao obter ordem de serviço: ${error}`);
  }
}

// Criar nova OS
export async function createOrdemServico(dados: Partial<OrdemServico>): Promise<OrdemServico> {
  try {
    const ordens = await lerOrdensServico();
    const numeroOS = await obterProximoNumeroOS();
    const { custoPecas, custoTotal } = calcularCustos(dados.pecasUtilizadas || [], dados.maoDeObra || 0);
    
    const precoVenda = dados.precoVenda || custoTotal;
    const lucro = precoVenda - custoTotal;
    const margemLucro = custoTotal > 0 ? (lucro / custoTotal) * 100 : 0;

    const novaOrdem: OrdemServico = {
      id: uuid(),
      numeroOS,
      clienteId: dados.clienteId || '',
      clienteNome: dados.clienteNome || '',
      aparelhoId: dados.aparelhoId,
      aparelhoMarca: dados.aparelhoMarca || '',
      aparelhoModelo: dados.aparelhoModelo || '',
      imei: dados.imei,
      defeito: dados.defeito || '',
      checklist: dados.checklist || [],
      servicosARealizarQuais: dados.servicosARealizarQuais,
      pecasUtilizadas: dados.pecasUtilizadas || [],
      tecnicoId: dados.tecnicoId,
      tecnicoNome: dados.tecnicoNome,
      prioridade: dados.prioridade || 'normal',
      status: dados.status || 'aguardando_pecas',
      custoPecas,
      maoDeObra: dados.maoDeObra || 0,
      custoTotal,
      precoVenda,
      lucro: Math.round(lucro * 100) / 100,
      margemLucro: Math.round(margemLucro * 100) / 100,
      prazoEstimado: dados.prazoEstimado,
      dataEntrada: new Date().toISOString(),
      observacoes: dados.observacoes,
      ativo: true
    };

    // Atualizar estoque das peças usadas
    for (const peca of novaOrdem.pecasUtilizadas) {
      await atualizarEstoque(peca.pecaId, peca.quantidade, 'saida');
    }

    ordens.push(novaOrdem);
    await salvarOrdensServico(ordens);
    
    return novaOrdem;
  } catch (error) {
    throw new Error(`Erro ao criar ordem de serviço: ${error}`);
  }
}

// Atualizar OS
export async function updateOrdemServico(id: string, dados: Partial<OrdemServico>): Promise<OrdemServico | null> {
  try {
    const ordens = await lerOrdensServico();
    const index = ordens.findIndex(o => o.id === id);
    
    if (index === -1) return null;

    const ordemAntiga = ordens[index];
    
    // Se as peças foram alteradas, reverter estoque anterior
    const pecasRemovidas = ordemAntiga.pecasUtilizadas.filter(
      p => !dados.pecasUtilizadas?.some(pn => pn.pecaId === p.pecaId)
    );
    
    for (const peca of pecasRemovidas) {
      await atualizarEstoque(peca.pecaId, peca.quantidade, 'entrada');
    }

    // Adicionar novas peças
    const pecasNovas = dados.pecasUtilizadas?.filter(
      p => !ordemAntiga.pecasUtilizadas.some(pa => pa.pecaId === p.pecaId)
    ) || [];
    
    for (const peca of pecasNovas) {
      await atualizarEstoque(peca.pecaId, peca.quantidade, 'saida');
    }

    // Recalcular custos
    const { custoPecas, custoTotal } = calcularCustos(dados.pecasUtilizadas || ordemAntiga.pecasUtilizadas, dados.maoDeObra ?? ordemAntiga.maoDeObra);
    const precoVenda = dados.precoVenda ?? ordemAntiga.precoVenda;
    const lucro = precoVenda - custoTotal;
    const margemLucro = custoTotal > 0 ? (lucro / custoTotal) * 100 : 0;

    const ordemAtualizada: OrdemServico = {
      ...ordemAntiga,
      ...dados,
      custoPecas,
      custoTotal,
      precoVenda,
      lucro: Math.round(lucro * 100) / 100,
      margemLucro: Math.round(margemLucro * 100) / 100,
      dataConclusao: dados.status === 'concluido' ? new Date().toISOString() : ordemAntiga.dataConclusao,
      dataRetirada: dados.status === 'entregue' ? new Date().toISOString() : ordemAntiga.dataRetirada
    };

    ordens[index] = ordemAtualizada;
    await salvarOrdensServico(ordens);
    
    return ordemAtualizada;
  } catch (error) {
    throw new Error(`Erro ao atualizar ordem de serviço: ${error}`);
  }
}

// Deletar OS
export async function deleteOrdemServico(id: string): Promise<boolean> {
  try {
    const ordens = await lerOrdensServico();
    const index = ordens.findIndex(o => o.id === id);
    
    if (index === -1) return false;

    // Reverter estoque das peças
    for (const peca of ordens[index].pecasUtilizadas) {
      await atualizarEstoque(peca.pecaId, peca.quantidade, 'entrada');
    }

    ordens[index].ativo = false;
    await salvarOrdensServico(ordens);
    
    return true;
  } catch (error) {
    throw new Error(`Erro ao deletar ordem de serviço: ${error}`);
  }
}

// Buscar OS por termo
export async function buscarOrdensServico(termo: string): Promise<OrdemServico[]> {
  try {
    const ordens = await lerOrdensServico();
    const termoLower = termo.toLowerCase();
    
    return ordens.filter(o => 
      o.ativo && (
        o.numeroOS.toString().includes(termoLower) ||
        o.clienteNome.toLowerCase().includes(termoLower) ||
        o.aparelhoMarca.toLowerCase().includes(termoLower) ||
        o.aparelhoModelo.toLowerCase().includes(termoLower) ||
        o.imei?.toLowerCase().includes(termoLower) ||
        o.defeito.toLowerCase().includes(termoLower)
      )
    ).sort((a, b) => b.numeroOS - a.numeroOS);
  } catch (error) {
    throw new Error(`Erro ao buscar ordens de serviço: ${error}`);
  }
}

// Obter OS por cliente
export async function getOrdensPorCliente(clienteId: string): Promise<OrdemServico[]> {
  try {
    const ordens = await lerOrdensServico();
    return ordens
      .filter(o => o.ativo && o.clienteId === clienteId)
      .sort((a, b) => b.numeroOS - a.numeroOS);
  } catch (error) {
    throw new Error(`Erro ao obter ordens do cliente: ${error}`);
  }
}

// Obter OS por técnico
export async function getOrdensPorTecnico(tecnicoId: string): Promise<OrdemServico[]> {
  try {
    const ordens = await lerOrdensServico();
    return ordens
      .filter(o => o.ativo && o.tecnicoId === tecnicoId)
      .sort((a, b) => b.numeroOS - a.numeroOS);
  } catch (error) {
    throw new Error(`Erro ao obter ordens do técnico: ${error}`);
  }
}

// Obter OS por status
export async function getOrdensPorStatus(status: string): Promise<OrdemServico[]> {
  try {
    const ordens = await lerOrdensServico();
    return ordens
      .filter(o => o.ativo && o.status === status)
      .sort((a, b) => b.numeroOS - a.numeroOS);
  } catch (error) {
    throw new Error(`Erro ao obter ordens por status: ${error}`);
  }
}
