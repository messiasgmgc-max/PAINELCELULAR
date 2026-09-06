'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  X, 
  Phone, 
  DollarSign, 
  FileText, 
  MapPin, 
  Save, 
  Loader2, 
  Building2,
  CreditCard,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NovoClienteAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  clienteParaEditar?: any | null;
  onSuccess: () => void;
}

export function NovoClienteAtacadoModal({
  isOpen,
  onClose,
  lojaId,
  clienteParaEditar,
  onSuccess
}: NovoClienteAtacadoModalProps) {
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [limiteCredito, setLimiteCredito] = useState('');
  const [saldoDevedor, setSaldoDevedor] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [cidade, setCidade] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (clienteParaEditar) {
      setNome(clienteParaEditar.nome || '');
      setWhatsapp(clienteParaEditar.whatsapp || clienteParaEditar.telefone || '');
      setLimiteCredito(clienteParaEditar.limiteCredito ? String(clienteParaEditar.limiteCredito) : '');
      setSaldoDevedor(clienteParaEditar.saldoDevedor !== undefined ? String(clienteParaEditar.saldoDevedor) : '');
      setCpfCnpj(clienteParaEditar.cpfCnpj || '');
      setCidade(clienteParaEditar.cidade || '');
      setChavePix(clienteParaEditar.chavePix || '');
      setObservacoes(clienteParaEditar.observacoes || '');
    } else {
      setNome('');
      setWhatsapp('');
      setLimiteCredito('');
      setSaldoDevedor('0');
      setCpfCnpj('');
      setCidade('');
      setChavePix('');
      setObservacoes('');
    }
  }, [clienteParaEditar, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error('Informe o nome do lojista ou cliente de atacado');
      return;
    }

    if (!lojaId) {
      toast.error('Loja não identificada');
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        id: clienteParaEditar?.id || undefined,
        lojaId,
        nome: nome.trim(),
        whatsapp: whatsapp.replace(/\D/g, ''),
        telefone: whatsapp.replace(/\D/g, ''),
        limiteCredito: limiteCredito ? parseFloat(limiteCredito.replace(',', '.')) : 0,
        saldoDevedor: saldoDevedor ? parseFloat(saldoDevedor.replace(',', '.')) : 0,
        cpfCnpj: cpfCnpj.trim() || undefined,
        cidade: cidade.trim() || undefined,
        chavePix: chavePix.trim() || undefined,
        observacoes: observacoes.trim() || undefined
      };

      const res = await fetch('/api/atacado/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar cliente');

      toast.success(data.mensagem || 'Cliente salvo com sucesso!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar cliente de atacado');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {clienteParaEditar ? 'Editar Cliente de Atacado' : 'Novo Cliente de Atacado / Lojista'}
              </h3>
              <p className="text-xs text-slate-400">
                Cadastre o contato e WhatsApp para o bot poder cobrar e enviar listas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto scrollbar-soft">
          
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" /> Nome do Lojista / Cliente *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Lucas Imports, Daniel Celulares..."
              className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* WhatsApp & Telefone */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp com DDD (Fundamental para o Bot)
              </span>
              {whatsapp && (
                <a
                  href={`https://wa.me/55${whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" /> Testar Zap
                </a>
              )}
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ex: 31999999999 (somente números)"
              className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <p className="text-[10px] text-slate-500">
              O bot de cobrança automática e extratos usará este número para enviar mensagens.
            </p>
          </div>

          {/* Limite de Crédito & Saldo Devedor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Limite Fiado (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={limiteCredito}
                onChange={(e) => setLimiteCredito(e.target.value)}
                placeholder="0,00"
                className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-rose-400" /> Saldo Devedor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={saldoDevedor}
                onChange={(e) => setSaldoDevedor(e.target.value)}
                placeholder="0,00"
                className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-rose-400 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 font-mono font-bold"
              />
            </div>
          </div>

          {/* CPF / CNPJ & Cidade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> CPF ou CNPJ
              </label>
              <input
                type="text"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" /> Cidade / Região
              </label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: São Paulo, BH..."
                className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Observações Internas
            </label>
            <textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Paga sempre às sextas; pega apenas iPhones Pro Max..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 text-xs border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="h-10 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-600/20 gap-2 cursor-pointer"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {clienteParaEditar ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}
