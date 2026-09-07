'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Search,
  Check,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NovoClienteAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  clienteParaEditar?: any | null;
  /** Lista de vendas do banco — usada para sugerir nomes já existentes */
  vendas?: any[];
  /** Lista consolidada de vendas de atacado */
  vendasAtacado?: any[];
  /** Lojistas que já possuem fiado/dívida ou histórico */
  lojistasDevedores?: any[];
  onSuccess: () => void;
}

export function NovoClienteAtacadoModal({
  isOpen,
  onClose,
  lojaId,
  clienteParaEditar,
  vendas = [],
  vendasAtacado = [],
  lojistasDevedores = [],
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

  // Estado do autocomplete
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extrai nomes únicos de compradores a partir de vendasBanco, vendasAtacado e lojistasDevedores
  const nomesExistentes = React.useMemo(() => {
    const nomes = new Set<string>();

    // 1. Devedores consolidados (ex: "CL", "GR")
    for (const dev of lojistasDevedores) {
      const n = dev.lojistaNome || dev.nome;
      if (n && typeof n === 'string' && n.trim().length > 0 && n.trim() !== 'Não Informado' && n.trim() !== 'Lojista / Revenda') {
        nomes.add(n.trim());
      }
    }

    // 2. Vendas de atacado processadas (inclui as do estoque com tag BAIXA_ESTOQUE)
    for (const va of vendasAtacado) {
      const comp = va.comprador;
      if (comp && typeof comp === 'string' && comp.trim().length > 0 && comp.trim() !== 'Não Informado' && comp.trim() !== 'Lojista / Revenda') {
        nomes.add(comp.trim());
      }
    }

    // 3. Vendas brutas do banco
    for (const v of vendas) {
      const candidatos = [
        v.comprador,
        v.nome_comprador,
        v.nomeComprador,
        v.cliente,
        v.clienteNome,
        v.nome_cliente,
        v.raw?.comprador,
        v.raw?.nome_comprador,
      ];
      if (Array.isArray(v.itens)) {
        for (const it of v.itens) {
          candidatos.push(it.comprador, it.nome_comprador, it.nomeComprador, it.clienteNome);
        }
      }
      for (const c of candidatos) {
        if (c && typeof c === 'string' && c.trim().length > 0 && c.trim() !== 'Não Informado' && c.trim() !== 'Lojista / Revenda') {
          nomes.add(c.trim());
        }
      }
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vendas, vendasAtacado, lojistasDevedores]);

  // Filtra sugestões conforme o nome digitado ou exibe todas se campo estiver em branco
  const atualizarSugestoes = useCallback((valor: string) => {
    const v = valor.trim().toLowerCase();
    if (!v) {
      // Se não digitou nada, exibe todas as opções disponíveis
      setSugestoes(nomesExistentes);
      setDropdownAberto(nomesExistentes.length > 0);
      return;
    }
    const filtradas = nomesExistentes.filter(n => n.toLowerCase().includes(v));
    setSugestoes(filtradas);
    setDropdownAberto(filtradas.length > 0);
  }, [nomesExistentes]);

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setNome(valor);
    atualizarSugestoes(valor);
  };

  const selecionarSugestao = (nomeSelecionado: string) => {
    setNome(nomeSelecionado);
    setSugestoes([]);
    setDropdownAberto(false);

    // Se for um devedor conhecido, já preenche automaticamente o saldo devedor dele!
    const devedorEncontrado = lojistasDevedores.find(
      d => (d.lojistaNome || d.nome || '').trim().toLowerCase() === nomeSelecionado.trim().toLowerCase()
    );
    if (devedorEncontrado && devedorEncontrado.saldoDevedor > 0) {
      setSaldoDevedor(String(devedorEncontrado.saldoDevedor));
    }

    // Foca no próximo campo (WhatsApp)
    setTimeout(() => {
      const el = document.getElementById('atacado-whatsapp');
      el?.focus();
    }, 50);
  };

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setSugestoes([]);
    setDropdownAberto(false);
  }, [clienteParaEditar, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownAberto(false);

    if (!nome.trim()) {
      toast.error('Informe o nome do lojista ou cliente de atacado');
      return;
    }

    // Garante que o lojaId está disponível (não bloqueia com erro visual)
    const lojaIdFinal = lojaId?.trim();
    if (!lojaIdFinal) {
      toast.error('Sessão expirada. Recarregue a página e tente novamente.');
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        id: clienteParaEditar?.id || undefined,
        lojaId: lojaIdFinal,
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

  const nomeTrimmed = nome.trim();
  const isNovoNome = nomeTrimmed.length > 0 && !nomesExistentes.some(
    n => n.toLowerCase() === nomeTrimmed.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
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
          
          {/* Nome com autocomplete */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" /> Nome do Lojista / Cliente *
            </label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  required
                  value={nome}
                  onChange={handleNomeChange}
                  onFocus={() => atualizarSugestoes(nome)}
                  onClick={() => atualizarSugestoes(nome)}
                  placeholder="Digite para buscar ou criar novo..."
                  autoComplete="off"
                  className="w-full h-10 bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Badge "Novo" quando o nome não existe */}
              {isNovoNome && !dropdownAberto && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Novo cliente — será criado ao salvar</span>
                </div>
              )}

              {/* Dropdown de sugestões */}
              {dropdownAberto && sugestoes.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="px-3 py-1.5 border-b border-slate-800">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      Compradores com vendas registradas
                    </span>
                  </div>
                  <ul className="max-h-48 overflow-y-auto">
                    {sugestoes.map((sugestao, idx) => {
                      const isExato = sugestao.toLowerCase() === nomeTrimmed.toLowerCase();
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // evita blur no input antes do click
                              selecionarSugestao(sugestao);
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer text-left"
                          >
                            <span className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>{sugestao}</span>
                            </span>
                            {isExato && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {/* Opção de criar com o nome digitado (se não for exato match) */}
                  {!sugestoes.some(s => s.toLowerCase() === nomeTrimmed.toLowerCase()) && (
                    <div className="border-t border-slate-800">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setDropdownAberto(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-emerald-400 hover:bg-slate-800 transition cursor-pointer text-left"
                      >
                        <UserPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>Criar <strong>"{nome}"</strong> como novo cliente</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp */}
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
              id="atacado-whatsapp"
              type="tel"
              inputMode="tel"
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
