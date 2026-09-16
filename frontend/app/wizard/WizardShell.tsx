'use client';
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Key, ShieldCheck, FilterX, GitMerge,
  Eye, Activity, Download, CheckCircle2, ChevronRight,
  Database, Folder
} from 'lucide-react';
import type { WizardStep } from '@/lib/types';
import type { WizardContext } from './steps/shared';

import { StepDiscovery }     from './steps/StepDiscovery';
import { StepKeyDetection }  from './steps/StepKeyDetection';
import { StepRules }         from './steps/StepRules';
import { StepExclusions }    from './steps/StepExclusions';
import { StepMapping }       from './steps/StepMapping';
import { StepPreLoad }       from './steps/StepPreLoad';
import { StepReconciliation }from './steps/StepReconciliation';
import { StepExport }        from './steps/StepExport';

const WIZARD_STEPS: { id: WizardStep; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'discovery',      label: 'Discovery',      short: '1', icon: Upload },
  { id: 'key-detection',  label: 'Key Detection',  short: '2', icon: Key },
  { id: 'rules',          label: 'Rules & Quality', short: '3', icon: ShieldCheck },
  { id: 'exclusions',     label: 'Exclusions',     short: '4', icon: FilterX },
  { id: 'mapping',        label: 'Mapping',         short: '5', icon: GitMerge },
  { id: 'pre-load',       label: 'Pre-Load',        short: '6', icon: Eye },
  { id: 'reconciliation', label: 'Reconciliation',  short: '7', icon: Activity },
  { id: 'export',         label: 'Report Export',   short: '8', icon: Download },
];

export function WizardShell() {
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get('batchId');
  const { state, dispatch, addAudit } = useStore();

  // activeBatchId: prefer URL param so it works after store hydrates from localStorage
  const [activeBatchId, setActiveBatchId] = useState<string | null>(batchIdParam ?? null);
  const activeBatch = (activeBatchId ? state.batches.find(b => b.id === activeBatchId) : null) ?? null;

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    activeBatch?.wizardStep ?? 'discovery'
  );

  // ── Shared wizard context (data flowing step→step) ──────────────────────────
  const [wizardCtx, setWizardCtx] = useState<WizardContext>({
    sourceKey: activeBatch?.sourceKey ?? '',
    targetKey: activeBatch?.targetKey ?? '',
    keyConfidence: activeBatch?.keyConfidence ?? 0,
  });

  const patchCtx = useCallback((patch: Partial<WizardContext>) => {
    setWizardCtx(prev => ({ ...prev, ...patch }));
  }, []);

  // Sync currentStep once the store hydrates from localStorage
  useEffect(() => {
    if (activeBatch && currentStep === 'discovery' && activeBatch.wizardStep !== 'discovery') {
      setCurrentStep(activeBatch.wizardStep);
    }
  }, [activeBatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeBatch) {
      setWizardCtx({ sourceKey: activeBatch.sourceKey ?? '', targetKey: activeBatch.targetKey ?? '', keyConfidence: activeBatch.keyConfidence ?? 0 });
    }
  }, [activeBatch?.id]);

  const stepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  // Every step tab is always clickable
  const goToStep = useCallback((step: WizardStep) => setCurrentStep(step), []);

  const advanceStep = useCallback((batchId?: string) => {
    const id = batchId ?? activeBatchId;
    const next = WIZARD_STEPS[stepIndex + 1];
    if (!next) return;
    if (id) {
      const batch = state.batches.find(b => b.id === id);
      if (batch) {
        const completedSteps = Array.from(new Set([...batch.completedSteps, currentStep])) as WizardStep[];
        dispatch({
          type: 'UPDATE_BATCH',
          payload: {
            ...batch, wizardStep: next.id, completedSteps,
            status: next.id === 'export' ? 'completed' : 'in_progress',
            updatedAt: new Date().toISOString(),
          },
        });
        addAudit(
          `WIZARD_STEP_${currentStep.toUpperCase().replace(/-/g, '_')}`,
          'Batch', id, batch.name,
          `Completed step: ${WIZARD_STEPS[stepIndex].label}`
        );
      }
    }
    setCurrentStep(next.id);
  }, [activeBatchId, stepIndex, currentStep, state.batches, dispatch, addAudit]);

  const goBack = useCallback(() => {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev.id);
  }, [stepIndex]);

  const stepProps = {
    batch: activeBatch,
    onBatchCreated: (id: string) => setActiveBatchId(id),
    onAdvance: advanceStep,
    onBack: goBack,
    wizardCtx,
    onCtxChange: patchCtx,
  };

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  if (!activeBatchId || !activeBatch) {
    const availableBatches = state.batches.filter(b => b.projectId === selectedProjectId);
    
    return (
      <div className="flex-1 h-full bg-slate-50/50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md w-full"
        >
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-100 text-indigo-600 p-4 rounded-full">
              <Upload size={32} />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-800 text-center mb-2">Start Conversion</h2>
          <p className="text-sm text-slate-500 text-center mb-8">Please select a project and a specific batch to launch the conversion wizard.</p>
          
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">1. Select Project</label>
              <select 
                value={selectedProjectId} 
                onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedBatchId(''); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              >
                <option value="" disabled>-- Choose a Project --</option>
                {state.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div className={cn("transition-opacity duration-300", selectedProjectId ? "opacity-100" : "opacity-50 pointer-events-none")}>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">2. Select Batch</label>
              <select 
                value={selectedBatchId} 
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              >
                <option value="" disabled>-- Choose a Batch --</option>
                {availableBatches.map(b => (
                  <option key={b.id} value={b.id}>{b.name.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            
            <button 
              onClick={() => setActiveBatchId(selectedBatchId)}
              disabled={!selectedBatchId}
              className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-0.5 transition-all duration-200"
            >
              Open Wizard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* ── Top step progress bar — every tab always clickable ── */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {WIZARD_STEPS.map((step, idx) => {
            const isCompleted = activeBatch?.completedSteps.includes(step.id) ?? false;
            const isCurrent   = currentStep === step.id;
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer',
                    isCurrent   ? 'bg-indigo-600 text-white shadow-sm'
                    : isCompleted ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  {isCompleted && !isCurrent ? <CheckCircle2 size={13} /> : <step.icon size={13} />}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.short}</span>
                </button>
                {idx < WIZARD_STEPS.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
              </div>
            );
          })}
        </div>
        {activeBatch && (() => {
          const activeProject = state.projects.find(p => p.id === activeBatch.projectId);
          let base = activeBatch.path || activeBatch.folderPath || wizardCtx.folderPath || activeProject?.folderPath || 'LightSpeed/Wave 1D/Airetech';
          base = base.replace(/\\/g, '/').replace(/\/+$/, '');

          let mod = '';
          let ent = '';
          if (activeBatch.name.includes('/')) {
            const p = activeBatch.name.split('/');
            mod = p[0];
            ent = p[1] || '';
          } else if (activeBatch.name.includes('_')) {
            const m = activeBatch.name.match(/^(\d{2}_[^_]+(?:_[^_]+)*?)_(\d{2}_.+)$/);
            if (m) {
              mod = m[1];
              ent = m[2];
            } else {
              const parts = activeBatch.name.split('_');
              if (parts.length >= 3) {
                mod = `${parts[0]}_${parts[1]}`;
                ent = parts.slice(2).join('_');
              } else if (parts.length === 2) {
                mod = parts[0];
                ent = parts[1];
              } else {
                ent = activeBatch.name;
              }
            }
          } else {
            ent = activeBatch.name;
          }

          let full = base;
          if (mod && !full.includes(mod)) {
            full += `/${mod}`;
          }
          if (ent && !full.includes(ent)) {
            full += `/${ent}`;
          }
          const pathParts = full.split('/').filter(Boolean);

          return (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Database size={14} className="text-indigo-500" /> Physical Storage Architecture
                </h4>
                <div className="flex items-center gap-3">
                  {wizardCtx.sourceKey && (
                    <div className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm">
                      Key: <span className="font-mono text-indigo-600 ml-1">{wizardCtx.sourceKey}</span>
                      <span className="mx-1 text-slate-300">→</span>
                      <span className="font-mono text-violet-600">{wizardCtx.targetKey}</span>
                    </div>
                  )}
                  <div className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm flex items-center gap-1.5">
                    <span className="uppercase tracking-widest text-[9px] font-bold text-slate-400">Batch</span>
                    <span className="text-indigo-700 font-bold">{activeBatch.name}</span>
                  </div>
                </div>
              </div>
              
              {/* Folder Structure Visualization */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-700 whitespace-nowrap min-w-max">
                  <div className="flex items-center gap-1.5 opacity-90">
                    <Folder size={14} className="text-amber-500 shrink-0 fill-amber-100" />
                    <div className="flex items-center gap-1 overflow-x-auto">
                      {pathParts.map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded",
                            i === arr.length - 1 ? "font-bold text-indigo-700 bg-indigo-50 border border-indigo-200" :
                            i === arr.length - 2 ? "font-semibold text-amber-900 bg-amber-50/70" : "text-slate-600"
                          )}>
                            {part}
                          </span>
                          {i < arr.length - 1 && <span className="text-slate-300 font-sans">/</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-3">
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-sans font-medium transition-colors",
                      activeBatch.sourceFile ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"
                    )}>
                      <Folder size={13} className={activeBatch.sourceFile ? "text-emerald-600 fill-emerald-100" : "text-slate-400"} />
                      <span>01-Source</span>
                      {activeBatch.sourceFile && (
                        <span className="text-[10px] font-mono opacity-80 max-w-[130px] truncate" title={activeBatch.sourceFile.name}>
                          ({activeBatch.sourceFile.name})
                        </span>
                      )}
                    </div>

                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-sans font-medium transition-colors",
                      activeBatch.targetFile ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"
                    )}>
                      <Folder size={13} className={activeBatch.targetFile ? "text-emerald-600 fill-emerald-100" : "text-slate-400"} />
                      <span>04-Fusion</span>
                      {activeBatch.targetFile && (
                        <span className="text-[10px] font-mono opacity-80 max-w-[130px] truncate" title={activeBatch.targetFile.name}>
                          ({activeBatch.targetFile.name})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
          >
            {currentStep === 'discovery'      && <StepDiscovery      {...stepProps} />}
            {currentStep === 'key-detection'  && <StepKeyDetection   {...stepProps} />}
            {currentStep === 'rules'          && <StepRules          {...stepProps} />}
            {currentStep === 'exclusions'     && <StepExclusions     {...stepProps} />}
            {currentStep === 'mapping'        && <StepMapping        {...stepProps} />}
            {currentStep === 'pre-load'       && <StepPreLoad        {...stepProps} />}
            {currentStep === 'reconciliation' && <StepReconciliation {...stepProps} />}
            {currentStep === 'export'         && <StepExport         {...stepProps} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
