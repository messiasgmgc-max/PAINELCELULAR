'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProps } from 'react-beautiful-dnd';
import { useOrdensServico } from '@/hooks/useOrdensServico';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { usePecas } from '@/hooks/usePecas';
import { useTecnicos } from '@/hooks/useTecnicos';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, Edit2, Plus, Search, X, GripVertical, Camera, MessageCircle, Printer, FileText, FileCheck } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; emoji: string; color: string }> = {
  aguardando_pecas: { label: 'Aguardando Peças', emoji: '📦', color: 'bg-yellow-100 text-yellow-800' },
  em_andamento: { label: 'Em Andamento', emoji: '⚙️', color: 'bg-blue-100 text-blue-800' },
  concluido: { label: 'Concluído', emoji: '✅', color: 'bg-green-100 text-green-800' },
  aguardando_retirada: { label: 'Aguardando Retirada', emoji: '📍', color: 'bg-orange-100 text-orange-800' },
  entregue: { label: 'Entregue', emoji: '🎉', color: 'bg-purple-100 text-purple-800' }
};

const PRIORIDADE_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-800' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800' },
  express: { label: 'Express', color: 'bg-pink-100 text-pink-800' }
};

interface FormData {
  clienteId: string;
  clienteNome: string;
  aparelhoId: string;
  aparelhoMarca: string;
  aparelhoModelo: string;
  imei: string;
  defeito: string;
  servicosARealizarQuais: string;
  tecnicoId: string;
  tecnicoNome: string;
  maoDeObra: number;
  precoVenda: number;
  prioridade: 'normal' | 'urgente' | 'express';
  status: 'aguardando_pecas' | 'em_andamento' | 'concluido' | 'aguardando_retirada' | 'entregue';
  pecasUtilizadas: PecaUtilizada[];
  observacoes: string;
  fotosEntrada: string[];
  fotosSaida: string[];
}

const INITIAL_FORM: FormData = {
  clienteId: '',
  clienteNome: '',
  aparelhoId: '',
  aparelhoMarca: '',
  aparelhoModelo: '',
  imei: '',
  defeito: '',
  servicosARealizarQuais: '',
  tecnicoId: '',
  tecnicoNome: '',
  maoDeObra: 0,
  precoVenda: 0,
  prioridade: 'normal',
  status: 'aguardando_pecas',
  pecasUtilizadas: [],
  observacoes: '',
  fotosEntrada: [],
  fotosSaida: []
};

// Componente wrapper para corrigir problemas com React.StrictMode
const StrictModeDroppable = ({ children, ...props }: DroppableProps) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);
  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
};

export function OrdensTab() {
  const { ordensServico, loading, error, fetchOrdensServico } = useOrdensServico();
  const { config } = useStoreConfig();
  const { criarOrdemServico, atualizarOrdemServico, deletarOrdemServico } = useOrdensServico();
  const { clientes, fetchClientes, criarCliente } = useClientes();
  const { aparelhos, fetchAparelhos, criarAparelho } = useAparelhos();
  const { pecas, fetchPecas, criarPeca } = usePecas();
  const { tecnicos, fetchTecnicos, criarTecnico } = useTecnicos();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [selectedPecas, setSelectedPecas] = useState<PecaUtilizada[]>([]);
  const [pecaSelecionada, setPecaSelecionada] = useState('');
  const [quantidadePeca, setQuantidadePeca] = useState(1);

  // Modais de criação rápida
  const [showModalNovoCliente, setShowModalNovoCliente] = useState(false);
  const [showModalNovaTecnico, setShowModalNovaTecnico] = useState(false);
  const [showModalNovaPeca, setShowModalNovaPeca] = useState(false);
  const [showModalNovoAparelho, setShowModalNovoAparelho] = useState(false);
  const [formNovoCliente, setFormNovoCliente] = useState({ nome: '', telefone: '', email: '', cpf: '' });
  const [formNovaTecnico, setFormNovaTecnico] = useState({ nome: '', telefone: '', email: '', especialidade: '' });
  const [formNovaPeca, setFormNovaPeca] = useState({ codigoUnico: '', nome: '', custoPeca: '', vendaPeca: '' });
  const [formNovoAparelho, setFormNovoAparelho] = useState({ marca: '', modelo: '', imei: '', cor: '' });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchClientes();
    fetchAparelhos();
    fetchTecnicos();
    fetchPecas();
  }, []);

  if (!isMounted) return null;

  const ordensFiltradas = searchTerm.trim() 
    ? ordensServico.filter(o =>
        o.numeroOS.toString().includes(searchTerm) ||
        o.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.aparelhoMarca.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.defeito.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : ordensServico;

  const ordensPorStatus = {
    aguardando_pecas: ordensFiltradas.filter(o => o.status === 'aguardando_pecas'),
    em_andamento: ordensFiltradas.filter(o => o.status === 'em_andamento'),
    concluido: ordensFiltradas.filter(o => o.status === 'concluido'),
    aguardando_retirada: ordensFiltradas.filter(o => o.status === 'aguardando_retirada')
  };

  const ordensEntregues = ordensFiltradas.filter(o => o.status === 'entregue');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['maoDeObra', 'precoVenda'].includes(name) ? parseFloat(value) || 0 : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'clienteId') {
      const cliente = clientes.find(c => c.id === value);
      setFormData(prev => ({
        ...prev,
        clienteId: value,
        clienteNome: cliente?.nome || ''
      }));
    } else if (name === 'aparelhoId') {
      const aparelho = aparelhos.find(a => a.id === value);
      setFormData(prev => ({
        ...prev,
        aparelhoId: value,
        aparelhoMarca: aparelho?.marca || '',
        aparelhoModelo: aparelho?.modelo || '',
        imei: aparelho?.imei || ''
      }));
    } else if (name === 'tecnicoId') {
      const tecnico = tecnicos.find(t => t.id === value);
      setFormData(prev => ({
        ...prev,
        tecnicoId: value,
        tecnicoNome: tecnico?.nome || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Handler para criar novo cliente
  const handleCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovoCliente.nome || !formNovoCliente.telefone) {
      alert('Nome e telefone são obrigatórios');
      return;
    }
    try {
      const novoCliente = await criarCliente({
        nome: formNovoCliente.nome,
        telefone: formNovoCliente.telefone,
        email: formNovoCliente.email || 'sem@email.com',
        cpf: formNovoCliente.cpf || '',
        ativo: true
      });
      
      if (novoCliente) {
        setFormData(prev => ({
          ...prev,
          clienteId: novoCliente.id,
          clienteNome: novoCliente.nome
        }));
        setFormNovoCliente({ nome: '', telefone: '', email: '', cpf: '' });
        setShowModalNovoCliente(false);
        await fetchClientes();
      }
    } catch (err) {
      console.error('Erro ao criar cliente:', err);
    }
  };

  // Handler para criar novo técnico
  const handleCreateTecnico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const novoTecnico = await criarTecnico({
        nome: formNovaTecnico.nome,
        telefone: formNovaTecnico.telefone,
        email: formNovaTecnico.email || undefined,
        especialidade: formNovaTecnico.especialidade || undefined
      });
      
      setFormData(prev => ({
        ...prev,
        tecnicoId: novoTecnico.id,
        tecnicoNome: novoTecnico.nome
      }));
      
      setFormNovaTecnico({ nome: '', telefone: '', email: '', especialidade: '' });
      setShowModalNovaTecnico(false);
      await fetchTecnicos();
    } catch (err) {
      console.error('Erro ao criar técnico:', err);
    }
  };

  // Handler para criar nova peça
  const handleCreatePeca = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const custoPecaNum = parseInt((parseFloat(formNovaPeca.custoPeca) * 100).toString()) || 0;
      const vendaPecaNum = parseInt((parseFloat(formNovaPeca.vendaPeca) * 100).toString()) || 0;

      const novaPeca = await criarPeca({
        codigoUnico: formNovaPeca.codigoUnico,
        nome: formNovaPeca.nome,
        custoPeca: custoPecaNum,
        vendaPeca: vendaPecaNum,
        estoque: 0,
        estoqueMinimo: 0,
        estoqueMaximo: 0,
        ativo: true
      });
      
      setPecaSelecionada(novaPeca.id);
      setFormNovaPeca({ codigoUnico: '', nome: '', custoPeca: '', vendaPeca: '' });
      setShowModalNovaPeca(false);
      await fetchPecas();
    } catch (err) {
      console.error('Erro ao criar peça:', err);
    }
  };

  // Handler para criar novo aparelho
  const handleCreateAparelho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clienteId) {
      alert('Selecione um cliente antes de adicionar um aparelho.');
      return;
    }
    const cliente = clientes.find(c => c.id === formData.clienteId);
    try {
      const novoAparelho = await criarAparelho({
        marca: formNovoAparelho.marca,
        modelo: formNovoAparelho.modelo,
        imei: formNovoAparelho.imei,
        cor: formNovoAparelho.cor,
        clienteId: formData.clienteId,
        cliente: cliente?.nome || '',
        condicao: 'usado', // Aparelho de cliente entra como usado/manutenção
        preco: 0,
        ativo: true,
        observacoes: 'Adicionado via OS - Manutenção'
      });
      
      if (novoAparelho) {
        setFormData(prev => ({
          ...prev,
          aparelhoId: novoAparelho.id,
          aparelhoMarca: novoAparelho.marca,
          aparelhoModelo: novoAparelho.modelo,
          imei: novoAparelho.imei || ''
        }));
      }
      setFormNovoAparelho({ marca: '', modelo: '', imei: '', cor: '' });
      setShowModalNovoAparelho(false);
      await fetchAparelhos();
    } catch (err) {
      console.error('Erro ao criar aparelho:', err);
    }
  };

  const handleAddPeca = () => {
    if (!pecaSelecionada || quantidadePeca <= 0) return;
    
    const peca = pecas.find(p => p.id === pecaSelecionada);
    if (!peca) return;

    const pecaUtilizada: PecaUtilizada = {
      pecaId: peca.id,
      pecaNome: peca.nome,
      quantidade: quantidadePeca,
      valorUnitario: peca.vendaPeca / 100,
      valorTotal: (peca.vendaPeca / 100) * quantidadePeca
    };

    setSelectedPecas(prev => [...prev, pecaUtilizada]);
    setPecaSelecionada('');
    setQuantidadePeca(1);
  };

  const handleRemovePeca = (pecaId: string) => {
    setSelectedPecas(prev => prev.filter(p => p.pecaId !== pecaId));
  };

  const handleEdit = (ordem: OrdemServico) => {
    setFormData({
      clienteId: ordem.clienteId,
      clienteNome: ordem.clienteNome,
      aparelhoId: ordem.aparelhoId || '',
      aparelhoMarca: ordem.aparelhoMarca,
      aparelhoModelo: ordem.aparelhoModelo,
      imei: ordem.imei || '',
      defeito: ordem.defeito,
      servicosARealizarQuais: ordem.servicosARealizarQuais || '',
      tecnicoId: ordem.tecnicoId || '',
      tecnicoNome: ordem.tecnicoNome || '',
      maoDeObra: ordem.maoDeObra,
      precoVenda: ordem.precoVenda,
      prioridade: ordem.prioridade,
      status: ordem.status,
      pecasUtilizadas: ordem.pecasUtilizadas,
      observacoes: ordem.observacoes || '',
      fotosEntrada: (ordem as any).fotosEntrada || [],
      fotosSaida: (ordem as any).fotosSaida || []
    });
    setSelectedPecas(ordem.pecasUtilizadas);
    setEditingId(ordem.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Calcular totais para salvar no banco
      const custoPecas = selectedPecas.reduce((acc, p) => acc + p.valorTotal, 0);
      const custoTotal = custoPecas + formData.maoDeObra;
      const lucro = formData.precoVenda - custoTotal;
      const margemLucro = formData.precoVenda > 0 ? (lucro / formData.precoVenda) * 100 : 0;

      const dados = {
        ...formData,
        pecasUtilizadas: selectedPecas,
        custoPecas,
        custoTotal,
        lucro,
        margemLucro
      };

      if (editingId) {
        await atualizarOrdemServico(editingId, dados);
      } else {
        await criarOrdemServico(dados);
      }

      setFormData(INITIAL_FORM);
      setSelectedPecas([]);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      console.error('Erro ao salvar ordem:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar essa ordem de serviço?')) {
      try {
        await deletarOrdemServico(id);
      } catch (err) {
        console.error('Erro ao deletar:', err);
      }
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Solto fora de um droppable
    if (!destination) return;

    // Solto no mesmo lugar
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const novoStatus = destination.droppableId as OrdemServico['status'];
    const ordemId = draggableId.replace('ordem-', '');

    try {
      const ordem = ordensServico.find(o => o.id === ordemId);
      if (ordem) {
        await atualizarOrdemServico(ordemId, {
          ...ordem,
          status: novoStatus
        });
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const calcularTotal = () => {
    return selectedPecas.reduce((sum, p) => sum + p.valorTotal, 0) + formData.maoDeObra;
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'entrada' | 'saida') => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setFormData(prev => ({
            ...prev,
            [tipo === 'entrada' ? 'fotosEntrada' : 'fotosSaida']: [
              ...(prev[tipo === 'entrada' ? 'fotosEntrada' : 'fotosSaida'] || []),
              base64
            ]
          }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const openWhatsApp = (clienteNome: string, osNumero: string) => {
    const cliente = clientes.find(c => c.nome === clienteNome);
    const phone = cliente?.telefone.replace(/\D/g, '') || '';
    window.open(`https://wa.me/55${phone}?text=Olá ${clienteNome}, referente a sua OS #${osNumero}...`, '_blank');
  };

  const handleGerarOSTermica = (ordem: OrdemServico) => {
    const logoHtml = config.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 60px; max-width: 150px; display: block; margin: 0 auto 10px auto;" />` : '';

    const pecasTermicaHtml = ordem.pecasUtilizadas && ordem.pecasUtilizadas.length > 0 
      ? ordem.pecasUtilizadas.map(p => `
          <tr>
            <td style="padding: 2px 0;">${p.quantidade}x ${p.pecaNome}</td>
            <td style="text-align: right; padding: 2px 0;">R$ ${p.valorTotal.toFixed(2).replace('.', ',')}</td>
          </tr>
        `).join('')
      : '';

    const osHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ordem de Serviço #${ordem.numeroOS}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; margin: 0; padding: 20px; max-width: 300px; }
          @media print { body { max-width: 100%; padding: 0; } @page { margin: 5mm; } }
          .text-center { text-align: center; } .text-right { text-align: right; } .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          td { padding: 2px 0; }
        </style>
      </head>
      <body>
        <div class="text-center">
          ${logoHtml}
          <h2 style="margin: 0; font-size: 16px;">${config.nomeLoja || 'PHONE CENTER'}</h2>
          <p style="margin: 2px 0;">Assistência Técnica</p>
        </div>
        <div class="divider"></div>
        <p style="margin: 2px 0;"><strong>ORDEM DE SERVIÇO #${ordem.numeroOS}</strong></p>
        <p style="margin: 2px 0;">Data: ${new Date(ordem.dataEntrada).toLocaleString('pt-BR')}</p>
        <p style="margin: 2px 0;">Cliente: ${ordem.clienteNome}</p>
        <p style="margin: 2px 0;">Aparelho: ${ordem.aparelhoMarca} ${ordem.aparelhoModelo}</p>
        <div class="divider"></div>
        <p style="margin: 2px 0;"><strong>Defeito:</strong> ${ordem.defeito}</p>
        ${ordem.servicosARealizarQuais ? `<p style="margin: 2px 0;"><strong>Serviços:</strong> ${ordem.servicosARealizarQuais}</p>` : ''}
        <div class="divider"></div>
        <table>
          <thead><tr><th style="text-align: left;">Peças/Serviços</th><th style="text-align: right;">Total</th></tr></thead>
          <tbody>
          ${pecasTermicaHtml}
          <tr><td>Mão de Obra</td><td style="text-align: right;">R$ ${ordem.maoDeObra.toFixed(2).replace('.', ',')}</td></tr>
          </tbody>
        </table>
        <div class="divider"></div>
        <p class="text-right font-bold" style="font-size: 14px;">TOTAL: R$ ${ordem.precoVenda.toFixed(2).replace('.', ',')}</p>
        <div class="divider"></div>
        <p class="text-center font-bold" style="margin-bottom: 5px;">TERMOS DE GARANTIA</p>
        <p style="font-size: 10px; margin: 0; text-align: justify;">Garantia de 90 dias. Não cobre mau uso, quedas, contato com líquidos ou abertura por terceiros. Aparelhos não retirados após 90 dias poderão ser vendidos para custear o serviço.</p>
        <div class="divider"></div>
        <br><br>
        <div style="border-top: 1px solid #000; text-align: center; font-size: 10px; padding-top: 5px;">Assinatura do Cliente</div>
        <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) { printWindow.document.write(osHtml); printWindow.document.close(); } 
    else { alert("Por favor, permita pop-ups para gerar a ordem de serviço."); }
  };

  const handleGerarOSA4 = (ordem: OrdemServico) => {
    const logoHtml = config.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto 10px auto;" />` : '';

    const pecasHtml = ordem.pecasUtilizadas && ordem.pecasUtilizadas.length > 0 
      ? ordem.pecasUtilizadas.map(p => `
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;">${p.pecaNome}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${p.quantidade}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">R$ ${(p.valorUnitario || 0).toFixed(2).replace('.', ',')}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">R$ ${p.valorTotal.toFixed(2).replace('.', ',')}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="padding: 8px; text-align: center; border: 1px solid #ddd;">Nenhuma peça registrada</td></tr>';

    const osHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ordem de Serviço #${ordem.numeroOS}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 13px; color: #333; margin: 0; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #1e3a8a; }
          .row { display: flex; justify-content: space-between; margin-bottom: 15px; }
          .box { border: 1px solid #ccc; padding: 10px; border-radius: 4px; margin-bottom: 15px; }
          .box-title { font-weight: bold; background: #f3f4f6; padding: 6px; margin: -10px -10px 10px -10px; border-bottom: 1px solid #ccc; border-radius: 4px 4px 0 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background: #f3f4f6; font-weight: bold; text-align: left; padding: 6px; border: 1px solid #ddd; }
          .totals { font-size: 15px; }
          .signature { margin-top: 60px; display: flex; justify-content: space-around; }
          .sign-line { border-top: 1px solid #000; width: 40%; text-align: center; padding-top: 5px; }
          @media print { body { padding: 0; margin: 10mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml}
          <h1>${config.nomeLoja || 'PHONE CENTER'}</h1>
          <p style="margin: 5px 0 0 0;">Assistência Técnica Especializada</p>
          <h2 style="margin: 10px 0 0 0;">ORDEM DE SERVIÇO Nº ${ordem.numeroOS}</h2>
        </div>
        <div class="row">
          <div style="width: 48%;">
            <div class="box">
              <div class="box-title">Dados do Cliente</div>
              <p style="margin:4px 0;"><strong>Nome:</strong> ${ordem.clienteNome}</p>
              <p style="margin:4px 0;"><strong>Data Entrada:</strong> ${new Date(ordem.dataEntrada).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div style="width: 48%;">
            <div class="box">
              <div class="box-title">Dados do Aparelho</div>
              <p style="margin:4px 0;"><strong>Modelo:</strong> ${ordem.aparelhoMarca} ${ordem.aparelhoModelo}</p>
              <p style="margin:4px 0;"><strong>IMEI/Série:</strong> ${ordem.imei || 'Não informado'}</p>
            </div>
          </div>
        </div>
        <div class="box"><div class="box-title">Relato do Problema / Defeito</div><p style="margin:0; white-space: pre-wrap;">${ordem.defeito}</p></div>
        <div class="box"><div class="box-title">Serviços Realizados</div><p style="margin:0; white-space: pre-wrap;">${ordem.servicosARealizarQuais || 'Em análise...'}</p></div>
        <div class="box">
          <div class="box-title">Peças e Valores Estimados</div>
          <table><thead><tr><th>Descrição da Peça/Serviço</th><th style="text-align: center;">Qtd</th><th style="text-align: right;">V. Unit</th><th style="text-align: right;">Total</th></tr></thead><tbody>${pecasHtml}</tbody></table>
          <div class="row totals"><div></div>
            <div style="width: 250px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;"><span>Peças:</span><span>R$ ${ordem.custoPecas.toFixed(2).replace('.', ',')}</span></div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;"><span>Mão de Obra:</span><span>R$ ${ordem.maoDeObra.toFixed(2).replace('.', ',')}</span></div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; border-top: 1px solid #000; padding-top: 5px;"><span>TOTAL:</span><span>R$ ${ordem.precoVenda.toFixed(2).replace('.', ',')}</span></div>
            </div>
          </div>
        </div>
        <div class="box"><div class="box-title">Termos de Serviço e Garantia</div><ul style="margin: 0; padding-left: 20px; font-size: 11px; line-height: 1.4;"><li>A garantia dos serviços prestados é de 90 dias, conforme Código de Defesa do Consumidor.</li><li>A garantia não cobre danos por mau uso, quedas, contato com líquidos ou abertura por terceiros.</li><li>Aparelhos não retirados após 90 dias da comunicação de conclusão poderão ser descartados ou vendidos para custear o serviço.</li></ul></div>
        <div class="signature"><div class="sign-line">Assinatura do Cliente<br><small>${ordem.clienteNome}</small></div><div class="sign-line">Técnico Responsável<br><small>${ordem.tecnicoNome || config.nomeLoja || 'Phone Center'}</small></div></div>
        <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(osHtml); printWindow.document.close(); } 
    else { alert("Por favor, permita pop-ups para gerar a ordem de serviço."); }
  };

  const handleGerarTermoRetirada = (ordem: OrdemServico) => {
    const logoHtml = config.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto 10px auto;" />` : '';
    
    const termoHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Termo de Retirada - OS #${ordem.numeroOS}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 14px; color: #333; margin: 0; padding: 40px; line-height: 1.6; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #1e3a8a; }
          .content { margin-bottom: 40px; text-align: justify; }
          .details { margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px; background: #f9fafb; }
          .signature-area { margin-top: 80px; text-align: center; }
          .sign-line { border-top: 1px solid #000; width: 60%; margin: 0 auto; padding-top: 5px; }
          @media print { body { padding: 0; margin: 15mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml}
          <h1>${config.nomeLoja || 'PHONE CENTER'}</h1>
          <h2 style="margin: 10px 0 0 0;">TERMO DE RETIRADA DE APARELHO</h2>
          <p style="margin: 5px 0 0 0;">Ordem de Serviço Nº ${ordem.numeroOS}</p>
        </div>
        <div class="content">
          <p>Eu, <strong>${ordem.clienteNome}</strong>, declaro ter recebido o aparelho descrito abaixo, o qual foi deixado para assistência técnica/orçamento na data de ${new Date(ordem.dataEntrada).toLocaleDateString('pt-BR')}.</p>
          <div class="details">
            <p style="margin: 5px 0;"><strong>Aparelho:</strong> ${ordem.aparelhoMarca} ${ordem.aparelhoModelo}</p>
            <p style="margin: 5px 0;"><strong>IMEI/Série:</strong> ${ordem.imei || 'Não informado'}</p>
            <p style="margin: 5px 0;"><strong>Serviços Realizados:</strong> ${ordem.servicosARealizarQuais || 'Não aplicável'}</p>
          </div>
          <p>Declaro que recebi o aparelho nas seguintes condições: testado, em perfeito estado de funcionamento (conforme os serviços contratados), ou nas mesmas condições em que foi deixado caso o serviço não tenha sido realizado.</p>
          <p>Estou ciente e de acordo com os termos de garantia fornecidos para os serviços executados (se houver), não havendo nada a reclamar no presente momento.</p>
          <p style="margin-top: 30px;">Data de retirada: ___ / ___ / ______</p>
        </div>
        <div class="signature-area"><div class="sign-line">Assinatura de <strong>${ordem.clienteNome}</strong></div><p style="font-size: 12px; color: #666; margin-top: 5px;">Documento de Identificação: _______________________</p></div>
        <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(termoHtml); printWindow.document.close(); } 
    else { alert("Por favor, permita pop-ups para gerar o termo."); }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por #OS, cliente, aparelho ou defeito..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData(INITIAL_FORM); setSelectedPecas([]); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova OS
        </Button>
      </div>

      {/* Formulário */}
      {showForm && (
        <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setFormData(INITIAL_FORM); setSelectedPecas([]); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Cliente *</label>
                <div className="flex gap-2">
                  <select
                    name="clienteId"
                    value={formData.clienteId}
                    onChange={(e) => handleSelectChange('clienteId', e.target.value)}
                    className="input-glass"
                  >
                    <option value="">Selecionar cliente</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={() => setShowModalNovoCliente(true)} className="bg-blue-600 hover:bg-blue-700" title="Adicionar Cliente">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Aparelho</label>
                <div className="flex gap-2">
                  <select
                    name="aparelhoId"
                    value={formData.aparelhoId}
                    onChange={(e) => handleSelectChange('aparelhoId', e.target.value)}
                    className="input-glass"
                  >
                    <option value="">Nenhum aparelho</option>
                    {aparelhos.filter(a => a.clienteId === formData.clienteId).map(a => (
                      <option key={a.id} value={a.id}>
                        {a.marca} {a.modelo}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={() => setShowModalNovoAparelho(true)} className="bg-blue-600 hover:bg-blue-700" title="Adicionar Aparelho">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Técnico com botão (+) */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Técnico Responsável</label>
                <select
                  name="tecnicoId"
                  value={formData.tecnicoId}
                  onChange={(e) => handleSelectChange('tecnicoId', e.target.value)}
                  className="input-glass"
                >
                  <option value="">Selecionar técnico</option>
                  {tecnicos.map(t => (
                    <option key={t.id} value={t.id}>{t.nome} {t.especialidade ? `(${t.especialidade})` : ''}</option>
                  ))}
                </select>
              </div>
              <Button type="button" size="sm" onClick={() => setShowModalNovaTecnico(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Defeito Relatado *</label>
              <textarea
                name="defeito"
                placeholder="Descreva o defeito..."
                value={formData.defeito}
                onChange={handleInputChange}
                rows={3}
                className="input-glass"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Serviços a Realizar</label>
              <textarea
                name="servicosARealizarQuais"
                placeholder="Quais serviços serão realizados..."
                value={formData.servicosARealizarQuais}
                onChange={handleInputChange}
                rows={3}
                className="input-glass"
              />
            </div>

            {/* Peças com botão (+) */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium">Peças Utilizadas</h4>
              
              <div className="flex gap-2">
                <select
                  value={pecaSelecionada}
                  onChange={(e) => setPecaSelecionada(e.target.value)}
                  className="input-glass flex-1"
                >
                  <option value="">Selecionar peça</option>
                  {pecas.filter(p => p.estoque > 0).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} - R$ {(p.vendaPeca / 100).toFixed(2)}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  value={quantidadePeca}
                  onChange={(e) => setQuantidadePeca(parseInt(e.target.value) || 1)}
                  placeholder="Qtd"
                  className="input-glass w-20"
                />

                <Button type="button" onClick={handleAddPeca} variant="outline">
                  Adicionar
                </Button>

                <Button type="button" size="sm" onClick={() => setShowModalNovaPeca(true)} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {selectedPecas.length > 0 && (
                <div className="space-y-2">
                  {selectedPecas.map(peca => (
                    <div key={peca.pecaId} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded border dark:border-slate-700">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{peca.pecaNome}</p>
                        <p className="text-xs text-gray-500">{peca.quantidade}x R$ {peca.valorUnitario.toFixed(2)} = R$ {peca.valorTotal.toFixed(2)}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemovePeca(peca.pecaId)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Mão de Obra (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  name="maoDeObra"
                  value={formData.maoDeObra}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="input-glass"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Valor Total (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  name="precoVenda"
                  value={formData.precoVenda}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="input-glass"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Prioridade</label>
                <select
                  name="prioridade"
                  value={formData.prioridade}
                  onChange={handleInputChange}
                  className="input-glass"
                >
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                  <option value="express">Express</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="input-glass"
                >
                  <option value="aguardando_pecas">Aguardando Peças</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="aguardando_retirada">Aguardando Retirada</option>
                  <option value="entregue">Entregue</option>
                </select>
              </div>
            </div>

            {/* Fotos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Fotos Entrada
                </label>
                <input type="file" multiple accept="image/*" onChange={(e) => handlePhotoUpload(e, 'entrada')} className="text-xs mb-2" />
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {formData.fotosEntrada?.map((foto, idx) => (
                    <img key={idx} src={foto} alt="Entrada" className="h-16 w-16 object-cover rounded border" />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Fotos Saída
                </label>
                <input type="file" multiple accept="image/*" onChange={(e) => handlePhotoUpload(e, 'saida')} className="text-xs mb-2" />
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {formData.fotosSaida?.map((foto, idx) => (
                    <img key={idx} src={foto} alt="Saída" className="h-16 w-16 object-cover rounded border" />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Observações</label>
              <textarea
                name="observacoes"
                placeholder="Observações adicionais..."
                value={formData.observacoes}
                onChange={handleInputChange}
                rows={2}
                className="input-glass"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-right text-lg font-semibold text-blue-900">
                Total Estimado: R$ {calcularTotal().toFixed(2)}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">{editingId ? 'Atualizar' : 'Criar'} OS</Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setFormData(INITIAL_FORM); setSelectedPecas([]); }}>
                Cancelar
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Modal Novo Cliente */}
      {showModalNovoCliente && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Novo Cliente</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowModalNovoCliente(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleCreateCliente} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nome *</label>
                  <input type="text" value={formNovoCliente.nome} onChange={(e) => setFormNovoCliente({...formNovoCliente, nome: e.target.value})} className="input-glass" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Telefone *</label>
                  <input type="tel" value={formNovoCliente.telefone} onChange={(e) => setFormNovoCliente({...formNovoCliente, telefone: e.target.value})} className="input-glass" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input type="email" value={formNovoCliente.email} onChange={(e) => setFormNovoCliente({...formNovoCliente, email: e.target.value})} className="input-glass" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">CPF</label>
                  <input type="text" value={formNovoCliente.cpf} onChange={(e) => setFormNovoCliente({...formNovoCliente, cpf: e.target.value})} className="input-glass" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModalNovoCliente(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">Salvar Cliente</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Novo Técnico */}
      {showModalNovaTecnico && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Novo Técnico</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowModalNovaTecnico(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleCreateTecnico} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nome *</label>
                  <input
                    type="text"
                    value={formNovaTecnico.nome}
                    onChange={(e) => setFormNovaTecnico({...formNovaTecnico, nome: e.target.value})}
                    placeholder="Nome del técnico"
                    className="input-glass"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Telefone *</label>
                  <input
                    type="tel"
                    value={formNovaTecnico.telefone}
                    onChange={(e) => setFormNovaTecnico({...formNovaTecnico, telefone: e.target.value})}
                    placeholder="(11) 98765-4321"
                    className="input-glass"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={formNovaTecnico.email}
                    onChange={(e) => setFormNovaTecnico({...formNovaTecnico, email: e.target.value})}
                    placeholder="email@example.com"
                    className="input-glass"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Especialidade</label>
                  <input
                    type="text"
                    value={formNovaTecnico.especialidade}
                    onChange={(e) => setFormNovaTecnico({...formNovaTecnico, especialidade: e.target.value})}
                    placeholder="Ex: Tela, Bateria, Placa"
                    className="input-glass"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModalNovaTecnico(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">Criar Técnico</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Nova Peça */}
      {showModalNovaPeca && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Nova Peça</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowModalNovaPeca(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleCreatePeca} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Código *</label>
                  <input
                    type="text"
                    value={formNovaPeca.codigoUnico}
                    onChange={(e) => setFormNovaPeca({...formNovaPeca, codigoUnico: e.target.value})}
                    placeholder="Código único"
                    className="input-glass"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Nome *</label>
                  <input
                    type="text"
                    value={formNovaPeca.nome}
                    onChange={(e) => setFormNovaPeca({...formNovaPeca, nome: e.target.value})}
                    placeholder="Nome da peça"
                    className="input-glass"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Custo (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formNovaPeca.custoPeca}
                      onChange={(e) => setFormNovaPeca({...formNovaPeca, custoPeca: e.target.value})}
                      placeholder="0.00"
                      className="input-glass"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Venda (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formNovaPeca.vendaPeca}
                      onChange={(e) => setFormNovaPeca({...formNovaPeca, vendaPeca: e.target.value})}
                      placeholder="0.00"
                      className="input-glass"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModalNovaPeca(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">Criar Peça</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Novo Aparelho (OS) */}
      {showModalNovoAparelho && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Novo Aparelho (Cliente)</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowModalNovoAparelho(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleCreateAparelho} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Marca *</label>
                    <input type="text" value={formNovoAparelho.marca} onChange={(e) => setFormNovoAparelho({...formNovoAparelho, marca: e.target.value})} className="input-glass" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Modelo *</label>
                    <input type="text" value={formNovoAparelho.modelo} onChange={(e) => setFormNovoAparelho({...formNovoAparelho, modelo: e.target.value})} className="input-glass" required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IMEI</label>
                  <input type="text" value={formNovoAparelho.imei} onChange={(e) => setFormNovoAparelho({...formNovoAparelho, imei: e.target.value})} className="input-glass" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cor</label>
                  <input type="text" value={formNovoAparelho.cor} onChange={(e) => setFormNovoAparelho({...formNovoAparelho, cor: e.target.value})} className="input-glass" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModalNovoAparelho(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">Salvar Aparelho</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

{/* Visualização Kanban com Drag & Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {Object.entries(ordensPorStatus).map(([statusKey, ordensStatus]) => {
            const statusInfo = STATUS_MAP[statusKey as keyof typeof STATUS_MAP];
            return (
              <StrictModeDroppable key={statusKey} droppableId={statusKey} type="ORDEN" isDropDisabled={false} isCombineEnabled={false} ignoreContainerClipping={false}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`bg-white/10 dark:bg-slate-900/50 backdrop-blur-md rounded-[2rem] p-4 border-2 transition-all min-h-96 ${
                      snapshot.isDraggingOver ? 'border-blue-400 bg-blue-50/20 dark:bg-blue-900/20' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-gray-200">
                      <span className="text-2xl">{statusInfo.emoji}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{statusInfo.label}</p>
                        <p className="text-xs text-gray-500">{ordensStatus.length} OS</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {ordensStatus.map((ordem, index) => (
                        <Draggable key={ordem.id} draggableId={`ordem-${ordem.id}`} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-3 border transition-all ${
                                snapshot.isDragging
                                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-300'
                                  : 'border-white/20 hover:border-blue-400'
                              } group cursor-move`}
                            >
                              <div className="flex gap-2 items-start">
                                <div {...provided.dragHandleProps} className="flex-shrink-0 pt-1">
                                  <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-2 gap-1">
                                    <div className="flex-1">
                                      <p className="font-bold text-sm text-blue-600">#{ordem.numeroOS}</p>
                                      <p className="text-xs text-gray-600 truncate">{ordem.clienteNome}</p>
                                      {ordem.tecnicoNome && <p className="text-xs text-blue-600">👨‍🔧 {ordem.tecnicoNome}</p>}
                                    </div>
                                    <Badge className={PRIORIDADE_MAP[ordem.prioridade].color} variant="secondary">
                                      {PRIORIDADE_MAP[ordem.prioridade].label}
                                    </Badge>
                                  </div>

                                  <p className="text-xs text-gray-700 line-clamp-2 mb-2">{ordem.defeito}</p>

                                  <div className="bg-gray-50 dark:bg-slate-900 p-2 rounded text-xs space-y-1 mb-3">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Peças:</span>
                                      <span className="font-medium">R$ {ordem.custoPecas.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Mão de obra:</span>
                                      <span className="font-medium">R$ {ordem.maoDeObra.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-blue-600 font-semibold">
                                      <span>Lucro:</span>
                                      <span>R$ {ordem.lucro.toFixed(2)}</span>
                                    </div>
                                  </div>

                                  {ordem.pecasUtilizadas.length > 0 && (
                                    <div className="text-xs mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                                      <p className="font-medium text-blue-900">{ordem.pecasUtilizadas.length} peça(s)</p>
                                    </div>
                                  )}

                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="sm" variant="outline" className="flex-1 text-green-600" onClick={() => openWhatsApp(ordem.clienteNome, ordem.numeroOS.toString())}>
                                      <MessageCircle className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-slate-600" onClick={() => handleGerarOSTermica(ordem)} title="Imprimir OS (Térmica)">
                                      <Printer className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-blue-600" onClick={() => handleGerarOSA4(ordem)} title="Imprimir OS (A4)">
                                      <FileText className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-amber-600" onClick={() => handleGerarTermoRetirada(ordem)} title="Termo de Retirada">
                                      <FileCheck className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(ordem)}>
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-red-600" onClick={() => handleDelete(ordem.id)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </StrictModeDroppable>
            );
          })}
        </div>

        {/* Lista de Entregues (Abaixo do Kanban) */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-800">
            <span className="text-2xl">🎉</span> Entregues / Finalizados
            <Badge variant="secondary" className="bg-purple-100 text-purple-800 ml-2">
              {ordensEntregues.length}
            </Badge>
          </h3>
          
          <StrictModeDroppable 
           droppableId="entregue" 
           type="ORDEN" 
           isDropDisabled={false}
           isCombineEnabled={false}
           ignoreContainerClipping={false}
          >

            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`bg-white/10 dark:bg-slate-900/50 backdrop-blur-md rounded-[2rem] p-4 border-2 transition-all min-h-[100px] ${
                  snapshot.isDraggingOver ? 'border-purple-400 bg-purple-50/20 dark:bg-purple-900/20' : 'border-white/10'
                }`}
              >
                <div className="space-y-2">
                  {ordensEntregues.map((ordem, index) => (
                    <Draggable key={ordem.id} draggableId={`ordem-${ordem.id}`} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-3 border transition-all flex flex-col sm:flex-row sm:items-center gap-4 ${
                            snapshot.isDragging
                              ? 'border-purple-500 shadow-lg ring-2 ring-purple-300'
                              : 'border-white/20 hover:border-purple-300'
                          } group`}
                        >
                          <div {...provided.dragHandleProps} className="flex-shrink-0 text-gray-400 cursor-move">
                            <GripVertical className="w-5 h-5" />
                          </div>

                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                            <div>
                              <p className="font-bold text-sm text-blue-600">#{ordem.numeroOS}</p>
                              <p className="text-xs text-gray-500">{new Date(ordem.dataEntrada).toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{ordem.clienteNome}</p>
                              <p className="text-xs text-gray-500">{ordem.aparelhoMarca} {ordem.aparelhoModelo}</p>
                            </div>
                            <div className="text-sm text-gray-600 line-clamp-1">
                              {ordem.defeito}
                            </div>
                            <div className="text-right sm:text-left">
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                Lucro: R$ {ordem.lucro.toFixed(2)}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end sm:justify-start">
                            <Button size="sm" variant="outline" className="text-green-600" onClick={() => openWhatsApp(ordem.clienteNome, ordem.numeroOS.toString())}>
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-slate-600" onClick={() => handleGerarOSTermica(ordem)} title="Imprimir OS (Térmica)">
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-blue-600" onClick={() => handleGerarOSA4(ordem)} title="Imprimir OS (A4)">
                              <FileText className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-amber-600" onClick={() => handleGerarTermoRetirada(ordem)} title="Termo de Retirada">
                              <FileCheck className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEdit(ordem)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(ordem.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
                {ordensEntregues.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-4">Arraste OS finalizadas para cá</p>
                )}
              </div>
            )}
          </StrictModeDroppable>
        </div>
      </DragDropContext>

      {ordensFiltradas.length === 0 && !showForm && (
        <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
          <p>Nenhuma ordem de serviço encontrada</p>
        </GlassCard>
      )}
    </div>
  );
}
