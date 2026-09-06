'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FileText, ShieldCheck, CheckCircle2, KeyRound, Building2, UploadCloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DadosFiscaisLoja } from '@/lib/fiscal/types';

interface Props {
  lojaId?: string;
}

export function ConfiguracaoFiscalSection({ lojaId }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  // Estado das configurações fiscais
  const [dados, setDados] = useState<DadosFiscaisLoja>({
    ativo: false,
    focus_token: '',
    ambiente: 'homologacao',
    cnpj: '',
    inscricao_estadual: '',
    razao_social: '',
    nome_fantasia: '',
    regime_tributario: '1',
    id_csc: '1',
    csc: '',
    serie_nfce: '1',
    numero_nfce_atual: 1,
    serie_nfe: '1',
    numero_nfe_atual: 1,
    cfop_padrao_nfce: '5102',
    cfop_padrao_nfe: '5102',
    ncm_padrao_smartphones: '8517.13.00',
    ncm_padrao_acessorios: '8517.79.00',
    emitir_automatico_pdv: false,
    enviar_danfe_email_cliente: true,
    certificado_nome: '',
    certificado_senha: ''
  });

  const [nomeArquivoCert, setNomeArquivoCert] = useState<string>('');

  useEffect(() => {
    if (!lojaId) return;

    const carregarConfig = async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/fiscal/config?lojaId=${lojaId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.config && Object.keys(json.config).length > 0) {
            setDados(prev => ({
              ...prev,
              ...json.config,
              regime_tributario: json.config.regime_tributario || '1',
              cfop_padrao_nfce: json.config.cfop_padrao_nfce || '5102',
              cfop_padrao_nfe: json.config.cfop_padrao_nfe || '5102',
              ncm_padrao_smartphones: json.config.ncm_padrao_smartphones || '8517.13.00',
              ncm_padrao_acessorios: json.config.ncm_padrao_acessorios || '8517.79.00',
              serie_nfce: json.config.serie_nfce || '1',
              serie_nfe: json.config.serie_nfe || '1'
            }));
            if (json.config.certificado_nome) {
              setNomeArquivoCert(json.config.certificado_nome);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar configurações fiscais:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarConfig();
  }, [lojaId]);

  const handleUploadCertificado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx') && !file.name.endsWith('.p12')) {
      toast.error('O certificado digital deve ser um arquivo no formato .pfx ou .p12');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('O arquivo do certificado deve ter menos de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setDados(prev => ({
        ...prev,
        certificado_nome: file.name,
        certificado_pfx_base64: base64,
        certificado_enviado: true
      }));
      setNomeArquivoCert(file.name);
      toast.success(`Certificado "${file.name}" carregado. Informe a senha e salve para concluir.`);
    };
    reader.readAsDataURL(file);
  };

  const handleSalvar = async () => {
    if (!lojaId) {
      toast.error('Identificador da loja não encontrado.');
      return;
    }

    if (dados.ativo) {
      if (!dados.cnpj || dados.cnpj.trim().length < 14) {
        toast.error('Informe um CNPJ válido para ativar a emissão fiscal.');
        return;
      }
      if (!dados.inscricao_estadual) {
        toast.error('Informe a Inscrição Estadual (IE) da loja.');
        return;
      }
    }

    setSalvando(true);
    try {
      const res = await fetch('/api/fiscal/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lojaId,
          dadosFiscais: dados
        })
      });

      if (!res.ok) {
        throw new Error('Falha ao salvar configurações');
      }

      toast.success('Configurações fiscais salvas com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      toast.error(err?.message || 'Erro ao salvar configurações fiscais.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <GlassCard className="p-8 text-center rounded-3xl">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
        <p className="text-sm text-muted-foreground">Carregando configurações fiscais...</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Status do Módulo */}
      <GlassCard className="p-6 rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  Emissão Fiscal Focus NFe (NFC-e / NF-e)
                  <Badge variant={dados.ativo ? 'default' : 'secondary'} className={dados.ativo ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
                    {dados.ativo ? 'Módulo Ativo' : 'Módulo Inativo'}
                  </Badge>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                    {dados.ambiente === 'producao' ? '🔴 Produção (SEFAZ Real)' : '🟡 Homologação (Testes)'}
                  </Badge>
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Emita NFC-e (modelo 65 para varejo no PDV) e NF-e (modelo 55 para atacado/empresas) sem travar o caixa.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <label htmlFor="modulo-ativo" className="text-sm font-medium cursor-pointer select-none">
              Ativar Emissão
            </label>
            <Switch
              id="modulo-ativo"
              checked={dados.ativo}
              onCheckedChange={(val) => setDados(prev => ({ ...prev, ativo: val }))}
            />
          </div>
        </div>
      </GlassCard>

      {/* Grid de Configurações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* 1. Credenciais da API Focus NFe e Certificado Digital */}
        <GlassCard className="p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <ShieldCheck className="w-4 h-4" /> 1. Autenticação & Certificado A1
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Ambiente SEFAZ</label>
              <select
                value={dados.ambiente}
                onChange={(e) => setDados(prev => ({ ...prev, ambiente: e.target.value as any }))}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="homologacao">Homologação (Ambiente de Testes SEFAZ)</option>
                <option value="producao">Produção (SEFAZ Oficial com Valor Fiscal)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium flex items-center justify-between mb-1">
                <span>Token Focus NFe (API Token)</span>
                <span className="text-[11px] text-muted-foreground font-normal">Opcional se configurado no servidor</span>
              </label>
              <Input
                type="password"
                placeholder="Ex: uo238u23u4923u4238..."
                className="h-9 rounded-xl font-mono text-xs"
                value={dados.focus_token || ''}
                onChange={(e) => setDados(prev => ({ ...prev, focus_token: e.target.value }))}
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <label className="text-xs font-semibold flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" /> Certificado Digital A1 (.pfx ou .p12)
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="cert-file"
                  accept=".pfx,.p12"
                  className="hidden"
                  onChange={handleUploadCertificado}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl text-xs gap-1.5 border-dashed"
                  onClick={() => document.getElementById('cert-file')?.click()}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  {nomeArquivoCert ? 'Alterar Certificado' : 'Selecionar Arquivo .pfx'}
                </Button>

                {nomeArquivoCert && (
                  <span className="text-xs text-emerald-400 font-mono truncate max-w-[200px]">
                    ✓ {nomeArquivoCert}
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] block mb-1">Senha do Certificado A1</label>
                <Input
                  type="password"
                  placeholder="Senha cadastrada no .pfx"
                  className="h-8 rounded-xl text-xs"
                  value={dados.certificado_senha || ''}
                  onChange={(e) => setDados(prev => ({ ...prev, certificado_senha: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 2. Dados Cadastrais da Empresa Emissora */}
        <GlassCard className="p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <Building2 className="w-4 h-4" /> 2. Dados Fiscais da Empresa
          </h4>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">CNPJ da Loja</label>
                <Input
                  placeholder="00.000.000/0000-00"
                  className="h-9 rounded-xl text-xs"
                  value={dados.cnpj || ''}
                  onChange={(e) => setDados(prev => ({ ...prev, cnpj: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Inscrição Estadual (IE)</label>
                <Input
                  placeholder="Ex: 123456789"
                  className="h-9 rounded-xl text-xs"
                  value={dados.inscricao_estadual || ''}
                  onChange={(e) => setDados(prev => ({ ...prev, inscricao_estadual: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Razão Social</label>
                <Input
                  placeholder="Razão Social LTDA"
                  className="h-9 rounded-xl text-xs"
                  value={dados.razao_social || ''}
                  onChange={(e) => setDados(prev => ({ ...prev, razao_social: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Nome Fantasia</label>
                <Input
                  placeholder="Phone Center"
                  className="h-9 rounded-xl text-xs"
                  value={dados.nome_fantasia || ''}
                  onChange={(e) => setDados(prev => ({ ...prev, nome_fantasia: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">Regime Tributário</label>
              <select
                value={dados.regime_tributario}
                onChange={(e) => setDados(prev => ({ ...prev, regime_tributario: e.target.value as any }))}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="1">1 - Simples Nacional (Microempresa / EPP)</option>
                <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>
          </div>
        </GlassCard>

        {/* 3. Parâmetros SEFAZ para NFC-e e NF-e */}
        <GlassCard className="p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <FileText className="w-4 h-4" /> 3. Parâmetros SEFAZ & Numeração
          </h4>

          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-xs font-semibold text-blue-300 block">NFC-e (Varejo / PDV)</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] block mb-1">ID do CSC SEFAZ</label>
                  <Input
                    placeholder="Ex: 1 ou 000001"
                    className="h-8 rounded-xl text-xs font-mono"
                    value={dados.id_csc || ''}
                    onChange={(e) => setDados(prev => ({ ...prev, id_csc: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] block mb-1">Código de Segurança (CSC)</label>
                  <Input
                    type="password"
                    placeholder="Código alfanumérico SEFAZ"
                    className="h-8 rounded-xl text-xs font-mono"
                    value={dados.csc || ''}
                    onChange={(e) => setDados(prev => ({ ...prev, csc: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] block mb-1">Série NFC-e</label>
                  <Input
                    placeholder="1"
                    className="h-8 rounded-xl text-xs"
                    value={dados.serie_nfce || '1'}
                    onChange={(e) => setDados(prev => ({ ...prev, serie_nfce: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] block mb-1">Próximo Número NFC-e</label>
                  <Input
                    type="number"
                    className="h-8 rounded-xl text-xs"
                    value={dados.numero_nfce_atual || 1}
                    onChange={(e) => setDados(prev => ({ ...prev, numero_nfce_atual: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-xs font-semibold text-purple-300 block">NF-e (Atacado / Modelo 55)</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] block mb-1">Série NF-e</label>
                  <Input
                    placeholder="1"
                    className="h-8 rounded-xl text-xs"
                    value={dados.serie_nfe || '1'}
                    onChange={(e) => setDados(prev => ({ ...prev, serie_nfe: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] block mb-1">Próximo Número NF-e</label>
                  <Input
                    type="number"
                    className="h-8 rounded-xl text-xs"
                    value={dados.numero_nfe_atual || 1}
                    onChange={(e) => setDados(prev => ({ ...prev, numero_nfe_atual: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 4. Tributação Padrão & Automação PDV */}
        <GlassCard className="p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <CheckCircle2 className="w-4 h-4" /> 4. Tributação Padrão & Automação PDV
          </h4>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">NCM Smartphones</label>
                <Input
                  placeholder="8517.13.00"
                  className="h-8 rounded-xl text-xs font-mono"
                  value={dados.ncm_padrao_smartphones || '8517.13.00'}
                  onChange={(e) => setDados(prev => ({ ...prev, ncm_padrao_smartphones: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">NCM Acessórios/Peças</label>
                <Input
                  placeholder="8517.79.00"
                  className="h-8 rounded-xl text-xs font-mono"
                  value={dados.ncm_padrao_acessorios || '8517.79.00'}
                  onChange={(e) => setDados(prev => ({ ...prev, ncm_padrao_acessorios: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">CFOP Padrão Varejo</label>
                <Input
                  placeholder="5102"
                  className="h-8 rounded-xl text-xs font-mono"
                  value={dados.cfop_padrao_nfce || '5102'}
                  onChange={(e) => setDados(prev => ({ ...prev, cfop_padrao_nfce: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">CFOP Padrão Atacado</label>
                <Input
                  placeholder="5102"
                  className="h-8 rounded-xl text-xs font-mono"
                  value={dados.cfop_padrao_nfe || '5102'}
                  onChange={(e) => setDados(prev => ({ ...prev, cfop_padrao_nfe: e.target.value }))}
                />
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold cursor-pointer select-none" htmlFor="auto-pdv">
                    Emissão Automática no PDV
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Ao finalizar uma venda no caixa, dispara a emissão de NFC-e em segundo plano.
                  </p>
                </div>
                <Switch
                  id="auto-pdv"
                  checked={dados.emitir_automatico_pdv}
                  onCheckedChange={(val) => setDados(prev => ({ ...prev, emitir_automatico_pdv: val }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold cursor-pointer select-none" htmlFor="danfe-email">
                    Enviar DANFE no E-mail do Cliente
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Anexa a nota fiscal em PDF ao recibo enviado para o e-mail do comprador.
                  </p>
                </div>
                <Switch
                  id="danfe-email"
                  checked={dados.enviar_danfe_email_cliente}
                  onCheckedChange={(val) => setDados(prev => ({ ...prev, enviar_danfe_email_cliente: val }))}
                />
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Botão de Salvar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <Button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="h-10 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 shadow-lg shadow-blue-500/20"
        >
          {salvando ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Salvar Configurações Fiscais
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
