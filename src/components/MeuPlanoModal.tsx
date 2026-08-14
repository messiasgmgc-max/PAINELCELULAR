'use client';

import { useState } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  Upload, 
  Send, 
  Clock, 
  ShieldCheck, 
  X,
  Building2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface MeuPlanoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MeuPlanoModal({ isOpen, onClose }: MeuPlanoModalProps) {
  const { planData, loading, enviarSolicitacaoLiberacao, refetchPlan } = useStorePlan();
  const [copied, setCopied] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!isOpen) return null;

  const handleCopyPix = () => {
    navigator.clipboard.writeText(planData.chavePixCobranca);
    setCopied(true);
    toast.success('Chave Pix copiada com sucesso!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleUploadComprovante = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15000000) {
        toast.error('Arquivo muito grande. Envie uma imagem de até 15MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setComprovante(event.target?.result as string);
        toast.success('Comprovante anexado!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setEnviando(true);
      await enviarSolicitacaoLiberacao(comprovante || undefined, observacao || undefined);
      toast.success('Solicitação de liberação enviada com sucesso ao Super Admin!');
      setComprovante(null);
      setObservacao('');
      refetchPlan();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar comprovante.');
    } finally {
      setEnviando(false);
    }
  };

  const getStatusBadge = () => {
    switch (planData.planoStatus) {
      case 'ativo':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-3 py-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Plano Ativo
          </Badge>
        );
      case 'pendente':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-3 py-1 flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> Pagamento Pendente
          </Badge>
        );
      case 'vencido':
      case 'bloqueado':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs px-3 py-1 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> Assinatura Suspensa / Bloqueada
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6">
      {/* Overlay com Blur */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Card do Modal */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 z-10 flex flex-col max-h-[90vh]">
        
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Meu Plano & Mensalidade
              </h2>
              <p className="text-xs text-slate-400">Informações da assinatura da loja e liberação de acesso</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-6 scrollbar-soft">
          
          {/* Card Status da Loja */}
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">{planData.nomeLoja}</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Mensalidade: <span className="font-bold text-emerald-400">R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')} / mês</span>
              </p>
              {planData.dataVencimento && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> Vencimento: <span className="font-bold text-slate-200">{new Date(planData.dataVencimento).toLocaleDateString('pt-BR')}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              {getStatusBadge()}
              {planData.solicitacaoStatus === 'pendente_aprovacao' && (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 font-medium">
                  ⏳ Solicitação em análise pelo Super Admin
                </span>
              )}
            </div>
          </div>

          {/* Dados Pix para Pagamento */}
          <div className="bg-slate-950/40 rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Dados para Pagamento Pix
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-auto truncate">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Chave Pix Oficial</p>
                <p className="text-sm font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</p>
              </div>
              <Button
                type="button"
                onClick={handleCopyPix}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto gap-2 bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar Chave Pix'}
              </Button>
            </div>
          </div>

          {/* Formulário de Envio de Comprovante */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" /> Confirmar Pagamento & Solicitar Liberação
              </h4>
              <p className="text-xs text-slate-400">
                Anexe o comprovante Pix abaixo para o Super Admin analisar e liberar o acesso imediatamente.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Botão Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-medium">Comprovante de Pagamento (Imagem / Print)</label>
                <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 hover:bg-blue-500/5 transition">
                  {comprovante ? (
                    <div className="flex flex-col items-center p-2 text-center">
                      <img src={comprovante} alt="Preview" className="h-14 w-auto object-contain rounded mb-1" />
                      <span className="text-[11px] text-emerald-400 font-semibold">Comprovante Anexado ✓</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-2">
                      <Upload className="w-6 h-6 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-300 font-medium">Clique para selecionar imagem</span>
                      <span className="text-[10px] text-slate-500">PNG, JPG ou PDF</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                </label>
              </div>

              {/* Observações */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-medium">Observações / Identificação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Pagamento referente ao mês de Agosto feito via conta titular João..."
                  className="w-full h-28 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={enviando}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-blue-500/20 gap-2 cursor-pointer"
            >
              {enviando ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar Comprovante e Solicitar Liberação
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
