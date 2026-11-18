'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { dataDaVendaEditada, dataLocalDoCampo } from '@/lib/vendas/itemVenda';
import { FILTRO_VENDA_VALIDA } from '@/lib/vendas/situacao';
import {
  avaliarPendenciasNotinha,
  ehNomeClienteGenerico,
  telefoneClienteValido,
} from '@/lib/vendas/pendencias';
import {
  X,
  Edit2,
  DollarSign,
  Calendar,
  User,
  CreditCard,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Printer,
  Phone,
  Mail,
  FileText,
  MapPin,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, parseMonetaryValue, obterDataHoraVenda } from '@/lib/utils';
import { CompradorAutocomplete } from '@/components/CompradorAutocomplete';
import { useCompradores, type CompradorFrequente } from '@/hooks/useCompradores';
import type { Cliente } from '@/lib/db/types';

export interface VendaEditavelData {
  id?: string;
  vendaId?: string;
  aparelhoId?: string;
  clienteId?: string | null;
  data: string;
  dataVencimento?: string;
  comprador: string;
  modelo?: string;
  marca?: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  codigo?: string;
  valorVenda: number;
  custo: number;
  metodoPgto?: string;
  parcelas?: number;
  tipoVenda?: string;
  vendedor?: string;
  garantia?: string;
  observacoes?: string;
  valorPago?: number;
  metodo?: string;
  status?: string;
  itens?: any[];
  raw?: any;
  modoCompletar?: boolean;
}

interface EditarVendaRegistroModalProps {
  isOpen: boolean;
  onClose: () => void;
  venda: VendaEditavelData | null;
  lojaId: string | null;
  clientes?: Cliente[];
  onSuccess: () => Promise<void>;
  onEmitirNotinha?: (vendaAtualizada: any, clienteAtualizado?: Cliente | null) => void;
}

const FORMAS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'fiado', label: 'A Prazo / Fiado' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'trade_in', label: 'Troca / Upgrade' },
];

const GARANTIAS_SUGERIDAS = ['90 dias', '30 dias', '6 meses', '1 ano', 'Garantia de Atacado (Teste)', 'Sem garantia'];

function extrairImeiInicial(venda: VendaEditavelData): string {
  if (venda.imei && String(venda.imei).trim()) return String(venda.imei).trim();
  const item0 = venda.itens?.[0];
  if (item0?.imei) return String(item0.imei).trim();
  if (item0?.serial) return String(item0.serial).trim();
  if (item0?.observacao) {
    const m = String(item0.observacao).match(/IMEI(?:\/ID)?:\s*([A-Za-z0-9]+)/i);
    if (m?.[1]) return m[1].trim();
  }
  if (item0?.descricao) {
    const m =
      String(item0.descricao).match(/\((?:IMEI\/ID|IMEI):\s*([^\)]+)\)/i) ||
      String(item0.descricao).match(/IMEI:\s*(\S+)/i);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function extrairObservacaoLimpa(obs?: string): string {
  if (!obs) return '';
  return String(obs)
    .replace(/IMEI(?:\/ID)?:\s*[A-Za-z0-9]+\s*\|?\s*/gi, '')
    .trim();
}

function inferirTipoVendaInicial(venda: VendaEditavelData): 'Atacado' | 'Varejo' {
  if (venda.tipoVenda) {
    return venda.tipoVenda.toLowerCase().includes('atacado') ? 'Atacado' : 'Varejo';
  }
  const entregaRaw = String(venda.raw?.tipoEntrega || '').toLowerCase();
  if (entregaRaw.includes('atacado')) return 'Atacado';
  if (entregaRaw.includes('varejo')) return 'Varejo';
  if (venda.modelo && !venda.vendaId && !venda.raw?.itens) return 'Atacado';
  return 'Varejo';
}

function montarNomeProdutoInicial(venda: VendaEditavelData): string {
  if (venda.modelo && venda.modelo.trim()) {
    const mod = venda.modelo.trim();
    const marca = (venda.marca || '').trim();
    const jaTemMarca = marca && mod.toLowerCase().includes(marca.toLowerCase());
    const partes = [
      jaTemMarca ? '' : marca,
      mod,
      venda.capacidade && !mod.toLowerCase().includes(venda.capacidade.toLowerCase()) ? venda.capacidade : '',
      venda.cor && !mod.toLowerCase().includes(venda.cor.toLowerCase()) ? venda.cor : '',
    ].filter(Boolean);
    return partes.join(' ');
  }
  return venda.itens?.[0]?.descricao || '';
}

export function EditarVendaRegistroModal({
  isOpen,
  onClose,
  venda,
  lojaId,
  clientes: clientesProp,
  onSuccess,
  onEmitirNotinha,
}: EditarVendaRegistroModalProps) {
  const [comprador, setComprador] = useState('');
  const [clienteIdSelecionado, setClienteIdSelecionado] = useState<string | null>(null);
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [clienteCpf, setClienteCpf] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [mostrarDadosCliente, setMostrarDadosCliente] = useState(false);

  const [modeloProduto, setModeloProduto] = useState('');
  const [imeiProduto, setImeiProduto] = useState('');
  const [garantia, setGarantia] = useState('90 dias');
  const [vendedor, setVendedor] = useState('');
  const [tipoVenda, setTipoVenda] = useState('Varejo');

  const [valorVenda, setValorVenda] = useState('');
  const [custo, setCusto] = useState('');
  const [dataVenda, setDataVenda] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [parcelas, setParcelas] = useState(1);
  const [statusVenda, setStatusVenda] = useState<'pago' | 'pendente' | 'parcial'>('pago');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [clientesFallback, setClientesFallback] = useState<Cliente[]>([]);
  const contatoHidratadoRef = useRef<string | null>(null);
  const usuarioEditouClienteRef = useRef(false);

  const { compradores, buscarCompradores, fetchCompradores, upsertComprador } = useCompradores(lojaId);

  // Caso o chamador não passe a lista de clientes (ex: AparelhosTab / AtacadoTab), busca direto do Supabase
  useEffect(() => {
    if (!isOpen || (clientesProp && clientesProp.length > 0) || !lojaId) return;
    let ativo = true;
    supabase
      .from('clientes')
      .select('id, nome, telefone, email, cpf, endereco, ativo, loja_id, dataCadastro')
      .eq('loja_id', lojaId)
      .limit(1000)
      .then(({ data }) => {
        if (ativo && Array.isArray(data)) {
          setClientesFallback(
            data.map((c: any) => ({
              id: c.id,
              nome: c.nome || '',
              email: c.email || '',
              telefone: c.telefone || '',
              cpf: c.cpf || undefined,
              endereco: c.endereco || undefined,
              ativo: c.ativo ?? true,
              dataCadastro: c.dataCadastro || '',
              lojaId: c.lojaId || c.loja_id || lojaId || '',
            }))
          );
        }
      });
    return () => {
      ativo = false;
    };
  }, [isOpen, clientesProp, lojaId]);

  const listaClientes = useMemo(
    () => (clientesProp && clientesProp.length > 0 ? clientesProp : clientesFallback),
    [clientesProp, clientesFallback]
  );

  // Inicializa os campos da venda ao abrir o modal
  useEffect(() => {
    if (!isOpen || !venda) {
      contatoHidratadoRef.current = null;
      usuarioEditouClienteRef.current = false;
      return;
    }

    const tipoInferido = inferirTipoVendaInicial(venda);
    const isAtacadoInicial = tipoInferido === 'Atacado';

    setComprador(venda.comprador || '');
    setValorVenda(venda.valorVenda !== undefined ? String(venda.valorVenda) : '0');
    setCusto(venda.custo !== undefined ? String(venda.custo) : '0');

    const d = venda.data ? new Date(venda.data) : new Date();
    setDataVenda(dataLocalDoCampo(!isNaN(d.getTime()) ? d : new Date()));

    const rawVenc = venda.dataVencimento || venda.raw?.dataVencimento || venda.raw?.data_vencimento;
    if (rawVenc) {
      const dV = new Date(rawVenc);
      setDataVencimento(!isNaN(dV.getTime()) ? dataLocalDoCampo(dV) : '');
    } else {
      setDataVencimento('');
    }

    const metodoInicial = venda.metodoPgto || venda.metodo || venda.raw?.metodo || 'pix';
    setMetodoPgto(metodoInicial);

    const pagPrincipal = Array.isArray(venda.raw?.pagamentos) ? venda.raw.pagamentos[0] : null;
    setParcelas(Number(venda.parcelas || pagPrincipal?.parcelas || 1) || 1);

    const statusInicialRaw = String(venda.status || venda.raw?.status || '').toLowerCase();
    const statusNorm: 'pago' | 'pendente' | 'parcial' =
      statusInicialRaw === 'pendente'
        ? 'pendente'
        : statusInicialRaw === 'parcial'
        ? 'parcial'
        : metodoInicial === 'fiado'
        ? 'pendente'
        : 'pago';
    setStatusVenda(statusNorm);

    setTipoVenda(tipoInferido);
    setModeloProduto(montarNomeProdutoInicial(venda));
    setImeiProduto(extrairImeiInicial(venda));
    setGarantia(venda.garantia || venda.raw?.garantia || (isAtacadoInicial ? 'Garantia de Atacado (Teste)' : '90 dias'));
    setVendedor(venda.vendedor || venda.raw?.vendedor || '');
    setObservacoes(extrairObservacaoLimpa(venda.observacoes));

    const cidInicial = venda.clienteId || venda.raw?.clienteId || null;
    setClienteIdSelecionado(cidInicial);
    setClienteTelefone(venda.raw?.clienteTelefone || '');
    setClienteEmail(
      venda.raw?.clienteEmail && venda.raw.clienteEmail !== 'sem@email.com' ? venda.raw.clienteEmail : ''
    );
    setClienteCpf(venda.raw?.clienteCpf || '');
    setClienteEndereco('');

    setMostrarDadosCliente(Boolean(venda.modoCompletar));
    contatoHidratadoRef.current = null;
    usuarioEditouClienteRef.current = false;
  }, [isOpen, venda]);

  // Hidrata os dados cadastrais do cliente assim que listaClientes/compradores estiver disponível
  useEffect(() => {
    if (!isOpen || !venda || usuarioEditouClienteRef.current) return;
    const chaveHidratacao = `${venda.id || ''}-${venda.vendaId || ''}-${venda.aparelhoId || ''}:${listaClientes.length > 0 ? 'cli' : 'nocli'}:${compradores.length > 0 ? 'comp' : 'nocomp'}`;
    if (contatoHidratadoRef.current === chaveHidratacao) return;

    const cidAlvo = venda.clienteId || venda.raw?.clienteId || null;
    const nomeAlvo = (venda.comprador || '').trim();

    let cliEncontrado: Cliente | null = null;
    if (listaClientes.length > 0) {
      if (cidAlvo) {
        cliEncontrado = listaClientes.find((c) => c.id === cidAlvo) || null;
      }
      if (!cliEncontrado && nomeAlvo && !ehNomeClienteGenerico(nomeAlvo)) {
        const nomeLower = nomeAlvo.toLowerCase();
        cliEncontrado =
          listaClientes.find((c) => (c.nome || '').trim().toLowerCase() === nomeLower) || null;
      }
    }

    const compEncontrado = nomeAlvo
      ? compradores.find((c) => c.nome.trim().toLowerCase() === nomeAlvo.toLowerCase()) || null
      : null;

    if (!cliEncontrado && !compEncontrado && listaClientes.length === 0) return;

    contatoHidratadoRef.current = chaveHidratacao;

    const telInit = cliEncontrado?.telefone || compEncontrado?.telefone || venda.raw?.clienteTelefone || '';
    const emailRaw = cliEncontrado?.email || compEncontrado?.email || venda.raw?.clienteEmail || '';
    const emailInit = emailRaw && emailRaw.toLowerCase() !== 'sem@email.com' ? emailRaw : '';
    const cpfInit = cliEncontrado?.cpf || compEncontrado?.cpf || venda.raw?.clienteCpf || '';
    const endInit = cliEncontrado?.endereco || compEncontrado?.endereco || '';

    if (cliEncontrado?.id || compEncontrado?.clienteId) {
      setClienteIdSelecionado(cliEncontrado?.id || compEncontrado?.clienteId || null);
    }
    if (telInit) setClienteTelefone(telInit);
    if (emailInit) setClienteEmail(emailInit);
    if (cpfInit) setClienteCpf(cpfInit);
    if (endInit) setClienteEndereco(endInit);

    const isAtacadoInicial = inferirTipoVendaInicial(venda) === 'Atacado';
    const faltandoAlgoCliente =
      ehNomeClienteGenerico(nomeAlvo) ||
      !telefoneClienteValido(telInit) ||
      !emailInit ||
      !cpfInit;

    if (venda.modoCompletar || (!isAtacadoInicial && faltandoAlgoCliente)) {
      setMostrarDadosCliente(true);
    }
  }, [isOpen, venda, listaClientes, compradores]);

  const clienteVinculadoAtual = useMemo(() => {
    if (clienteIdSelecionado) {
      return listaClientes.find((c) => c.id === clienteIdSelecionado) || null;
    }
    const nomeLimpo = comprador.trim().toLowerCase();
    if (nomeLimpo && !ehNomeClienteGenerico(comprador)) {
      return listaClientes.find((c) => (c.nome || '').trim().toLowerCase() === nomeLimpo) || null;
    }
    return null;
  }, [clienteIdSelecionado, comprador, listaClientes]);

  const valorVendaNum = parseMonetaryValue(valorVenda);
  const custoNum = parseMonetaryValue(custo);
  const lucroNum = valorVendaNum - custoNum;
  const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

  const isAtacado = tipoVenda.toLowerCase().includes('atacado');

  // Diagnóstico em tempo real para mostrar exatamente o que falta na notinha
  const diagnosticoAtual = useMemo(() => {
    const temNomeReal = !ehNomeClienteGenerico(comprador);
    return avaliarPendenciasNotinha({
      nome: comprador,
      clienteId: clienteIdSelecionado || (temNomeReal ? 'pendente-criacao' : null),
      clienteEncontrado: clienteVinculadoAtual,
      clientesCarregados: true,
      telefone: clienteTelefone,
      email: clienteEmail,
      cpf: clienteCpf,
      imei: imeiProduto,
      custo: custoNum,
      dadosClientePendente: false,
      isAtacado,
    });
  }, [
    comprador,
    clienteIdSelecionado,
    clienteVinculadoAtual,
    clienteTelefone,
    clienteEmail,
    clienteCpf,
    imeiProduto,
    custoNum,
    isAtacado,
  ]);

  if (!isOpen || !venda) return null;

  const handleSelecionarComprador = (comp: CompradorFrequente) => {
    usuarioEditouClienteRef.current = true;
    setComprador(comp.nome);
    const idCli =
      comp.clienteId || (comp.tipo === 'cliente' && !comp.id.startsWith('local-') ? comp.id : null);
    setClienteIdSelecionado(idCli);
    if (comp.telefone !== undefined) setClienteTelefone(comp.telefone || '');
    if (comp.email !== undefined) {
      setClienteEmail(comp.email && comp.email !== 'sem@email.com' ? comp.email : '');
    }
    if (comp.cpf !== undefined) setClienteCpf(comp.cpf || '');
    if (comp.endereco !== undefined) setClienteEndereco(comp.endereco || '');
  };

  const handleNomeCompradorChange = (novoNome: string) => {
    usuarioEditouClienteRef.current = true;
    setComprador(novoNome);
    if (!novoNome.trim()) {
      setClienteIdSelecionado(null);
      setClienteTelefone('');
      setClienteEmail('');
      setClienteCpf('');
      setClienteEndereco('');
    }
  };

  const handleNovoCliente = () => {
    usuarioEditouClienteRef.current = true;
    setClienteIdSelecionado(null);
    setComprador('');
    setClienteTelefone('');
    setClienteEmail('');
    setClienteCpf('');
    setClienteEndereco('');
    setMostrarDadosCliente(true);
  };

  const handleMetodoChange = (novoMetodo: string) => {
    setMetodoPgto(novoMetodo);
    if (novoMetodo === 'fiado') {
      const valorPagoAtual = Number(venda.valorPago || 0);
      if (valorPagoAtual < valorVendaNum) {
        setStatusVenda(valorPagoAtual > 0 ? 'parcial' : 'pendente');
      }
    } else if (statusVenda === 'pendente' || statusVenda === 'parcial') {
      setStatusVenda('pago');
    }
  };

  const salvarAlteracoes = async (emitirNotinhaAposSalvar: boolean) => {
    if (!comprador.trim()) {
      toast.error('Informe o nome do comprador / cliente.');
      return;
    }

    setSalvando(true);
    const toastId = toast.loading(
      emitirNotinhaAposSalvar ? 'Salvando e gerando notinha...' : 'Salvando alterações do registro...'
    );

    try {
      const compradorFinal = comprador.trim() || (isAtacado ? 'Lojista / Revenda' : 'Cliente Balcão');
      // Mantém o horário original da venda; só o dia muda se a data foi trocada.
      const dataIso = dataDaVendaEditada(venda.data, dataVenda) ?? obterDataHoraVenda(dataVenda);
      const produtoDesc = modeloProduto.trim() || venda.modelo || 'Aparelho / Produto';
      const imeiLimpo = imeiProduto.trim();
      const obsLimpa = observacoes.trim();
      const obsItemFinal = obsLimpa;

      // 1. Cria ou atualiza o cliente real na tabela 'clientes' para vincular clienteId e salvar telefone/e-mail/CPF
      let clienteIdFinal: string | null = clienteIdSelecionado || null;
      let clienteSalvoObj: Cliente | null = clienteVinculadoAtual;

      const temDadosContato = Boolean(
        clienteTelefone.trim() || clienteEmail.trim() || clienteCpf.trim() || clienteEndereco.trim()
      );

      if (!ehNomeClienteGenerico(compradorFinal) && (!isAtacado || clienteIdFinal || temDadosContato)) {
        if (!clienteIdFinal && lojaId) {
          const { data: cliExistente } = await supabase
            .from('clientes')
            .select('id, nome, telefone, email, cpf, endereco')
            .eq('loja_id', lojaId)
            .ilike('nome', compradorFinal)
            .limit(1)
            .maybeSingle();

          if (cliExistente?.id) {
            clienteIdFinal = cliExistente.id;
          }
        }

        if (clienteIdFinal) {
          const updateCli: Record<string, any> = { nome: compradorFinal };
          if (clienteTelefone.trim()) {
            updateCli.telefone = clienteTelefone.trim();
          } else if (mostrarDadosCliente && clienteVinculadoAtual?.telefone) {
            updateCli.telefone = '';
          }

          if (clienteEmail.trim()) {
            updateCli.email = clienteEmail.trim();
          } else if (
            mostrarDadosCliente &&
            clienteVinculadoAtual?.email &&
            clienteVinculadoAtual.email !== 'sem@email.com'
          ) {
            updateCli.email = 'sem@email.com';
          }

          if (clienteCpf.trim()) {
            updateCli.cpf = clienteCpf.trim();
          } else if (mostrarDadosCliente && clienteVinculadoAtual?.cpf) {
            updateCli.cpf = null;
          }

          if (clienteEndereco.trim()) {
            updateCli.endereco = clienteEndereco.trim();
          } else if (mostrarDadosCliente && clienteVinculadoAtual?.endereco) {
            updateCli.endereco = null;
          }

          let { data: cliAtualizado, error: errCliUpd } = await supabase
            .from('clientes')
            .update(updateCli)
            .eq('id', clienteIdFinal)
            .select()
            .maybeSingle();

          if (errCliUpd) {
            const { cpf: _c, endereco: _e, ...baseUpd } = updateCli;
            const retry = await supabase
              .from('clientes')
              .update(baseUpd)
              .eq('id', clienteIdFinal)
              .select()
              .maybeSingle();
            cliAtualizado = retry.data;
          }

          clienteSalvoObj = (cliAtualizado as Cliente) || {
            ...(clienteVinculadoAtual || ({} as Cliente)),
            id: clienteIdFinal,
            nome: compradorFinal,
            telefone: clienteTelefone.trim(),
            email: clienteEmail.trim() || 'sem@email.com',
            cpf: clienteCpf.trim() || undefined,
            endereco: clienteEndereco.trim() || undefined,
          };
        } else {
          const insertCli: Record<string, any> = {
            nome: compradorFinal,
            telefone: clienteTelefone.trim() || '',
            email: clienteEmail.trim() || 'sem@email.com',
            cpf: clienteCpf.trim() || null,
            endereco: clienteEndereco.trim() || null,
            ativo: true,
            loja_id: lojaId || null,
          };
          Object.keys(insertCli).forEach((k) => {
            if (insertCli[k] === null || insertCli[k] === undefined) delete insertCli[k];
          });

          let { data: cliInserido, error: errCliIns } = await supabase
            .from('clientes')
            .insert([insertCli])
            .select()
            .maybeSingle();

          if (errCliIns) {
            const { cpf: _c, endereco: _e, ...baseIns } = insertCli;
            const retry = await supabase
              .from('clientes')
              .insert([baseIns])
              .select()
              .maybeSingle();
            cliInserido = retry.data;
          }

          if (cliInserido?.id) {
            clienteIdFinal = cliInserido.id;
            clienteSalvoObj = cliInserido as Cliente;
          }
        }
      }

      // 2. Se tem aparelhoId vinculado, atualiza o aparelho na tabela 'aparelhos'
      if (venda.aparelhoId) {
        const { data: aparAtual } = await supabase
          .from('aparelhos')
          .select('observacoes')
          .eq('id', venda.aparelhoId)
          .maybeSingle();

        const obsBase = String(aparAtual?.observacoes || '')
          .replace(/BAIXA_ESTOQUE:[^\n|]+(?:\|\s*)?/gi, '')
          .replace(/Venda (?:ATACADO|VAREJO)[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Comprador:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Valor:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Custo:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Lucro:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Pgto:[^\n|]*(?:\|\s*)?/gi, '')
          .trim();

        const obsBaixa = [
          `BAIXA_ESTOQUE:${dataIso}:Venda ${tipoVenda.toUpperCase()} para ${compradorFinal} por R$ ${valorVendaNum.toFixed(2)} | Valor: R$ ${valorVendaNum.toFixed(2)} | Comprador: ${compradorFinal} | Custo: R$ ${custoNum.toFixed(2)} | Lucro: R$ ${lucroNum.toFixed(2)} | Pgto: ${metodoPgto}`,
          obsLimpa ? `Obs: ${obsLimpa}` : '',
          venda.codigo ? `ID: ${venda.codigo}` : '',
          imeiLimpo ? `IMEI: ${imeiLimpo}` : '',
          obsBase ? `Obs: ${obsBase}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        const aparelhoUpdate: Record<string, any> = {
          preco: valorVendaNum,
          preco_atacado: valorVendaNum,
          custo: custoNum,
          cliente: compradorFinal,
          observacoes: obsBaixa,
        };
        if (imeiLimpo) aparelhoUpdate.imei = imeiLimpo;
        if (clienteIdFinal) aparelhoUpdate.clienteId = clienteIdFinal;

        const { error: errAparelho } = await supabase
          .from('aparelhos') // estoque-guard: sem-ciclo
          .update(aparelhoUpdate)
          .eq('id', venda.aparelhoId);

        if (errAparelho && clienteIdFinal) {
          delete aparelhoUpdate.clienteId;
          await supabase
            .from('aparelhos') // estoque-guard: sem-ciclo
            .update(aparelhoUpdate)
            .eq('id', venda.aparelhoId);
        }
      }

      // 3. Atualiza ou cria registro na tabela 'vendas'
      const isValidUUID = (id: any) =>
        typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let idParaVenda = isValidUUID(venda.vendaId) ? venda.vendaId : null;
      if (!idParaVenda && isValidUUID(venda.id) && venda.id !== venda.aparelhoId) {
        idParaVenda = venda.id;
      }

      const dataVencIso = dataVencimento ? new Date(dataVencimento + 'T12:00:00').toISOString() : null;

      if (!idParaVenda && venda.aparelhoId) {
        const { data: vendasExistentes } = await supabase
          .from('vendas')
          .select('id, itens, valorPago, saldoDevedor, status')
          .contains('itens', [{ aparelhoId: venda.aparelhoId }])
          .or(FILTRO_VENDA_VALIDA)
          .limit(2);

        const vendaEncontrada = vendasExistentes?.length === 1 ? vendasExistentes[0] : undefined;

        if (vendaEncontrada && isValidUUID(vendaEncontrada.id)) {
          idParaVenda = vendaEncontrada.id;
          if (venda.valorPago === undefined) {
            venda.valorPago = vendaEncontrada.valorPago;
          }
        }
      }

      const valorPagoAtual = Number(venda.valorPago || 0);
      let novoSaldoDevedor = 0;
      let novoStatus: 'pago' | 'pendente' | 'parcial' = statusVenda;

      if (statusVenda === 'pendente' || statusVenda === 'parcial' || metodoPgto === 'fiado') {
        if (statusVenda === 'pago' && metodoPgto !== 'fiado') {
          novoSaldoDevedor = 0;
          novoStatus = 'pago';
        } else {
          novoSaldoDevedor = Math.max(0, valorVendaNum - valorPagoAtual);
          novoStatus = novoSaldoDevedor <= 0.01 ? 'pago' : valorPagoAtual > 0 ? 'parcial' : statusVenda;
        }
      } else {
        novoSaldoDevedor = 0;
        novoStatus = 'pago';
      }

      const aindaPendente =
        !isAtacado && (ehNomeClienteGenerico(compradorFinal) || !telefoneClienteValido(clienteTelefone));

      let vendaResultante: any = null;

      if (idParaVenda) {
        const payloadVendaUpdate: any = {
          clienteId: clienteIdFinal || null,
          clienteNome: compradorFinal,
          valor: valorVendaNum,
          saldoDevedor: novoSaldoDevedor,
          status: novoStatus,
          custo: custoNum,
          lucro: lucroNum,
          percentualLucro: parseFloat(margemPercent) || 0,
          dataPagamento: dataIso,
          dataVencimento: dataVencIso,
          metodo: metodoPgto,
          tipoEntrega: tipoVenda,
          vendedor: vendedor.trim() || venda.raw?.vendedor || 'Sistema',
          garantia: garantia.trim() || '90 dias',
          descricao: `Venda ${tipoVenda.toUpperCase()} - ${produtoDesc} para ${compradorFinal}`,
          dados_cliente_pendente: aindaPendente,
        };

        let itensParaAtualizar = venda.itens;
        if (!itensParaAtualizar || !Array.isArray(itensParaAtualizar) || itensParaAtualizar.length === 0) {
          const { data: dbVenda } = await supabase
            .from('vendas')
            .select('itens')
            .eq('id', idParaVenda)
            .maybeSingle();
          if (dbVenda?.itens && Array.isArray(dbVenda.itens)) {
            itensParaAtualizar = dbVenda.itens;
          }
        }

        if (itensParaAtualizar && Array.isArray(itensParaAtualizar) && itensParaAtualizar.length > 0) {
          const itemUnico = itensParaAtualizar.length === 1;
          const alvoIdx = itensParaAtualizar.findIndex(
            (it: any) => venda.aparelhoId && it.aparelhoId === venda.aparelhoId
          );
          const idxPrincipal = alvoIdx >= 0 ? alvoIdx : 0;
          const alterouValorOuCusto =
            Math.abs(valorVendaNum - Number(venda.valorVenda || 0)) > 0.009 ||
            Math.abs(custoNum - Number(venda.custo || 0)) > 0.009;

          payloadVendaUpdate.itens = itensParaAtualizar.map((it: any, idx: number) => {
            if (idx !== idxPrincipal) return it;
            const atualizado: any = {
              ...it,
              descricao: produtoDesc || it.descricao,
              observacao: obsItemFinal,
            };
            if (imeiLimpo) atualizado.imei = imeiLimpo;
            else delete atualizado.imei;

            if (itemUnico || alterouValorOuCusto) {
              const valItem = itemUnico ? valorVendaNum : Number(it.total ?? it.valorExibir ?? valorVendaNum);
              const custoItem = itemUnico ? custoNum : Number(it.valorInterno ?? it.custoUnitario ?? custoNum);
              atualizado.total = valItem;
              atualizado.valorExibir = valItem;
              atualizado.valorUnitario = valItem;
              atualizado.valorInterno = custoItem;
              atualizado.custoUnitario = custoItem;
              atualizado.lucroUnitario = Number((valItem - custoItem).toFixed(2));
            }
            return atualizado;
          });
        } else {
          payloadVendaUpdate.itens = [
            {
              id: Date.now().toString(),
              aparelhoId: venda.aparelhoId,
              descricao: produtoDesc,
              imei: imeiLimpo || undefined,
              quantidade: 1,
              valorExibir: valorVendaNum,
              valorUnitario: valorVendaNum,
              total: valorVendaNum,
              valorInterno: custoNum,
              custoUnitario: custoNum,
              lucroUnitario: lucroNum,
              desconto: 0,
              tipoDesconto: 'R$',
              observacao: obsItemFinal,
            },
          ];
        }

        const pagsExistentes = Array.isArray(venda.raw?.pagamentos) ? venda.raw.pagamentos : [];
        const alterouMetodo = metodoPgto !== (venda.metodoPgto || venda.raw?.metodo || 'pix');
        const alterouValor = Math.abs(valorVendaNum - Number(venda.valorVenda || 0)) > 0.009;
        if (metodoPgto !== 'fiado') {
          if (pagsExistentes.length > 1 && !alterouMetodo && !alterouValor) {
            payloadVendaUpdate.pagamentos = pagsExistentes.map((p: any, idx: number) =>
              idx === 0 ? { ...p, parcelas: metodoPgto === 'cartao_credito' ? parcelas : p.parcelas || 1 } : p
            );
          } else {
            payloadVendaUpdate.pagamentos = [
              {
                id: pagsExistentes[0]?.id || Date.now().toString(),
                metodo: metodoPgto,
                valor: valorVendaNum,
                parcelas: metodoPgto === 'cartao_credito' ? parcelas : 1,
              },
            ];
          }
        }

        const { data: vendaAtualizadaDb, error: errVenda } = await supabase
          .from('vendas')
          .update(payloadVendaUpdate)
          .eq('id', idParaVenda)
          .select()
          .maybeSingle();

        if (errVenda) {
          console.error('Erro ao atualizar registro de venda:', errVenda);
          throw errVenda;
        }
        vendaResultante = vendaAtualizadaDb || { ...(venda.raw || {}), id: idParaVenda, ...payloadVendaUpdate };
      } else {
        const payloadVendaInsert: any = {
          loja_id: lojaId || undefined,
          aparelhoId: venda.aparelhoId || undefined,
          clienteId: clienteIdFinal || null,
          clienteNome: compradorFinal,
          valor: valorVendaNum,
          valorPago: novoStatus === 'pago' ? valorVendaNum : valorPagoAtual,
          saldoDevedor: novoSaldoDevedor,
          status: novoStatus,
          custo: custoNum,
          lucro: lucroNum,
          percentualLucro: parseFloat(margemPercent) || 0,
          dataPagamento: dataIso,
          dataVencimento: dataVencIso,
          metodo: metodoPgto,
          tipoEntrega: tipoVenda,
          vendedor: vendedor.trim() || 'Sistema',
          garantia: garantia.trim() || '90 dias',
          dados_cliente_pendente: aindaPendente,
          descricao: `Venda ${tipoVenda.toUpperCase()} - ${produtoDesc} para ${compradorFinal}`,
          itens: [
            {
              id: Date.now().toString(),
              aparelhoId: venda.aparelhoId,
              descricao: produtoDesc,
              modelo: produtoDesc,
              marca: venda.marca || 'Apple',
              imei: imeiLimpo || '',
              quantidade: 1,
              valorUnitario: valorVendaNum,
              total: valorVendaNum,
              valorExibir: valorVendaNum,
              valorInterno: custoNum,
              custoUnitario: custoNum,
              lucroUnitario: lucroNum,
              desconto: 0,
              tipoDesconto: 'R$',
              observacao: obsItemFinal,
              tipoVenda: tipoVenda.toLowerCase(),
            },
          ],
          pagamentos: [
            {
              id: Date.now().toString(),
              metodo: metodoPgto,
              valor: valorVendaNum,
              parcelas: metodoPgto === 'cartao_credito' ? parcelas : 1,
            },
          ],
        };

        const { data: vendaInseridaDb, error: errInsert } = await supabase
          .from('vendas')
          .insert([payloadVendaInsert])
          .select()
          .maybeSingle();

        if (errInsert) {
          console.error('Erro ao inserir registro de venda ao editar:', errInsert);
          throw errInsert;
        }
        vendaResultante = vendaInseridaDb || payloadVendaInsert;
      }

      if (!ehNomeClienteGenerico(compradorFinal)) {
        await upsertComprador(
          compradorFinal,
          isAtacado ? 'lojista' : 'cliente',
          clienteTelefone.trim() || undefined
        );
        void fetchCompradores();
      }

      toast.success(
        aindaPendente
          ? '✅ Alterações salvas! (Cliente ainda sem telefone completo para sair de pendentes)'
          : '✅ Venda e dados do cliente salvos com sucesso!',
        { id: toastId }
      );

      await onSuccess();
      onClose();

      if (emitirNotinhaAposSalvar && onEmitirNotinha && vendaResultante) {
        onEmitirNotinha(vendaResultante, clienteSalvoObj);
      }
    } catch (err: any) {
      console.error('Erro ao editar registro:', err);
      toast.error(`Erro ao salvar: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void salvarAlteracoes(false);
  };

  const temPendencias =
    diagnosticoAtual.motivosObrigatorios.length > 0 || diagnosticoAtual.camposComplementares.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto">
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">
                {venda.modoCompletar ? 'Completar Dados da Notinha' : 'Editar Venda, Cliente & Custos'}
              </h3>
              <p className="text-xs text-slate-400">
                Edite dados do cliente, aparelho/IMEI, garantia, valores e pagamento sem abrir o PDV completo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DIAGNÓSTICO EM TEMPO REAL DE DADOS INCOMPLETOS */}
        {temPendencias ? (
          <div
            className={cn(
              'p-3 rounded-2xl border space-y-2',
              diagnosticoAtual.motivosObrigatorios.length > 0
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-slate-950/80 border-slate-800'
            )}
          >
            {diagnosticoAtual.motivosObrigatorios.length > 0 ? (
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Falta para completar a notinha:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {diagnosticoAtual.motivosObrigatorios.map((motivo) => (
                    <Badge
                      key={motivo}
                      className="bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] font-bold"
                    >
                      {motivo}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Dados obrigatórios do cliente completos!
              </div>
            )}

            {diagnosticoAtual.camposComplementares.length > 0 && (
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-slate-400 shrink-0 mt-0.5">
                  Opcionais em branco:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {diagnosticoAtual.camposComplementares.map((campo) => (
                    <Badge
                      key={campo}
                      variant="outline"
                      className="bg-slate-900/80 text-slate-300 border-slate-700 text-[10px]"
                    >
                      Sem {campo}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            Todos os dados do cliente e da notinha estão completos!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SEÇÃO 1: COMPRADOR / LOJISTA / CLIENTE + EDIÇÃO DO CLIENTE */}
          <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                Comprador / Lojista / Cliente *
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNovoCliente}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  title="Limpar e cadastrar um novo cliente"
                >
                  <UserPlus className="w-3 h-3 text-cyan-400" />
                  Novo Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarDadosCliente((prev) => !prev)}
                  className={cn(
                    'text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-colors',
                    mostrarDadosCliente
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                      : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  )}
                >
                  <Edit2 className="w-3 h-3" />
                  Editar Dados do Cliente
                  {mostrarDadosCliente ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <CompradorAutocomplete
              value={comprador}
              onChange={handleNomeCompradorChange}
              onSelectComprador={handleSelecionarComprador}
              compradores={compradores}
              onBuscar={(termo) => buscarCompradores(termo, isAtacado ? 'lojista' : undefined)}
              tipo={isAtacado ? 'lojista' : 'todos'}
              placeholder="Buscar por nome, telefone, CPF ou digitar novo..."
              required
            />

            {/* Resumo clicável quando o painel está recolhido */}
            {!mostrarDadosCliente && (
              <div
                onClick={() => setMostrarDadosCliente(true)}
                className="flex flex-wrap items-center gap-1.5 pt-0.5 cursor-pointer group"
                title="Clique para editar telefone, e-mail, CPF ou endereço"
              >
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1',
                    telefoneClienteValido(clienteTelefone)
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  )}
                >
                  <Phone className="w-2.5 h-2.5" />
                  {clienteTelefone ? clienteTelefone : 'Telefone não informado'}
                </span>
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1',
                    clienteEmail
                      ? 'bg-slate-900 border-slate-700 text-slate-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-500'
                  )}
                >
                  <Mail className="w-2.5 h-2.5" />
                  {clienteEmail || 'Sem e-mail'}
                </span>
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1',
                    clienteCpf
                      ? 'bg-slate-900 border-slate-700 text-slate-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-500'
                  )}
                >
                  <FileText className="w-2.5 h-2.5" />
                  {clienteCpf || 'Sem CPF/CNPJ'}
                </span>
                <span className="text-[10px] text-cyan-400 group-hover:underline ml-auto">
                  Clique para editar
                </span>
              </div>
            )}

            {/* Painel de Edição Completa dos Dados do Cliente */}
            {mostrarDadosCliente && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    Telefone / WhatsApp {!isAtacado && <span className="text-amber-400">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="(31) 99999-9999"
                    value={clienteTelefone}
                    onChange={(e) => {
                      usuarioEditouClienteRef.current = true;
                      setClienteTelefone(e.target.value);
                    }}
                    className={cn(
                      'w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500 font-mono',
                      !isAtacado && !telefoneClienteValido(clienteTelefone)
                        ? 'border-amber-500/50'
                        : 'border-slate-800'
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-blue-400" />
                    E-mail (para recibo digital)
                  </label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={clienteEmail}
                    onChange={(e) => {
                      usuarioEditouClienteRef.current = true;
                      setClienteEmail(e.target.value);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-purple-400" />
                    CPF / CNPJ (na notinha)
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={clienteCpf}
                    onChange={(e) => {
                      usuarioEditouClienteRef.current = true;
                      setClienteCpf(e.target.value);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-400" />
                    Endereço (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Rua, número, bairro..."
                    value={clienteEndereco}
                    onChange={(e) => {
                      usuarioEditouClienteRef.current = true;
                      setClienteEndereco(e.target.value);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 2: DADOS DO PRODUTO / NOTINHA */}
          <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                Dados do Produto & Notinha
              </span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTipoVenda('Varejo')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer',
                    !isAtacado ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  )}
                >
                  Varejo
                </button>
                <button
                  type="button"
                  onClick={() => setTipoVenda('Atacado')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer',
                    isAtacado ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  )}
                >
                  Atacado
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  Produto / Descrição na Notinha
                </label>
                <input
                  type="text"
                  placeholder="Ex: Apple iPhone 15 Pro Max 256GB Titânio"
                  value={modeloProduto}
                  onChange={(e) => setModeloProduto(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-cyan-400" />
                  IMEI / Nº de Série
                </label>
                <input
                  type="text"
                  placeholder="Ex: 3580..."
                  value={imeiProduto}
                  onChange={(e) => setImeiProduto(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Garantia
                </label>
                <input
                  type="text"
                  list="opcoes-garantia-rapida"
                  placeholder="Ex: 90 dias"
                  value={garantia}
                  onChange={(e) => setGarantia(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
                />
                <datalist id="opcoes-garantia-rapida">
                  {GARANTIAS_SUGERIDAS.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: VALORES, CUSTO, PAGAMENTO E STATUS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Valor da Venda (R$) *
              </label>
              <input
                type="text"
                placeholder="0,00"
                value={valorVenda}
                onChange={(e) => setValorVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                Custo do Produto (R$) *
              </label>
              <input
                type="text"
                placeholder="0,00"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none"
                required
              />
            </div>
          </div>

          {/* RECÁLCULO DO LUCRO EM TEMPO REAL */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className={cn('w-4 h-4', lucroNum >= 0 ? 'text-emerald-400' : 'text-rose-400')} />
              <span className="text-slate-400 font-semibold">Lucro Recalculado:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('font-mono font-bold text-sm', lucroNum >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                R$ {lucroNum.toFixed(2).replace('.', ',')}
              </span>
              <Badge
                className={cn(
                  'text-[10px]',
                  lucroNum >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                )}
              >
                {margemPercent}% margem
              </Badge>
            </div>
          </div>

          {/* DATA, PAGAMENTO, PARCELAS, STATUS E VENDEDOR */}
          <div className={cn('grid grid-cols-1 gap-3', metodoPgto === 'cartao_credito' ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Data da Venda
              </label>
              <input
                type="date"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                Pagamento
              </label>
              <select
                value={metodoPgto}
                onChange={(e) => handleMetodoChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {metodoPgto === 'cartao_credito' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Parcelas</label>
                <select
                  value={parcelas}
                  onChange={(e) => setParcelas(Number(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                >
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Status</label>
              <select
                value={statusVenda}
                onChange={(e) => setStatusVenda(e.target.value as 'pago' | 'pendente' | 'parcial')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="parcial">Parcial</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Vendedor</label>
              <input
                type="text"
                placeholder="Ex: Lucas, Maria..."
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Observações / Notas</label>
              <input
                type="text"
                placeholder="Ex: Acompanha capa e película..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* DATA DE VENCIMENTO / PREVISÃO (QUANDO FOR FIADO) */}
          {metodoPgto === 'fiado' && (
            <div className="space-y-1 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-2xl">
              <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Data de Vencimento / Previsão de Pagamento
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400">
                Se passar desta data, o sistema indicará atraso e calculará juros automaticamente no extrato.
              </p>
            </div>
          )}

          {/* BOTÕES INFERIORES */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={salvando}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Cancelar
            </Button>

            {onEmitirNotinha && (
              <Button
                type="button"
                disabled={salvando}
                onClick={() => void salvarAlteracoes(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs gap-2 px-4 py-2.5 rounded-xl shadow-lg shadow-blue-950/40 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Salvar e Emitir Notinha
              </Button>
            )}

            <Button
              type="submit"
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Salvar Alterações
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
