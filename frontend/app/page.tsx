'use client';

import React, { useState } from 'react';
import { 
  LayoutGrid, 
  FolderKanban, 
  GitCompare, 
  History, 
  Sparkles, 
  Moon, 
  UploadCloud, 
  FileText, 
  Table, 
  Search, 
  BarChart2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  ArrowLeft,
  Database,
  Plus
} from 'lucide-react';

interface SheetInfo {
  sheet_name: string;
  record_count: number;
  column_count: number;
  columns: string[];
}

interface FileInfo {
  file_name: string;
  file_extension: string;
  file_size_bytes: number;
  is_supported: boolean;
  file_type: string;
  delimiter?: string;
  encoding?: string;
  sheet_count: number;
  sheets: SheetInfo[];
}

interface ValidationStep {
  step_number: number;
  step_name: string;
  status: string;
  message: string;
  details: Record<string, any>;
}

interface ValidationReport {
  folder_path: string;
  folder_exists: boolean;
  has_supported_file: boolean;
  overall_status: string;
  file_info?: FileInfo;
  validation_steps: ValidationStep[];
  record_count: number;
  duplicate_records_count: number;
  null_values_summary: Record<string, number>;
  missing_required_columns: string[];
  execution_time_ms: number;
}

interface DiscoveryResponse {
  batch_id: string;
  source_file_info?: FileInfo;
  target_file_info?: FileInfo;
  source_validation_report?: ValidationReport;
  target_validation_report?: ValidationReport;
  overall_status: string;
}

export default function ConversionWizardPage() {
  const [activeMainStep, setActiveMainStep] = useState(1); // 1: Discovery
  const [activeSubStep, setActiveSubStep] = useState(1);   // 1: Upload Files, 2: File & Sheet Detection

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [discoveryData, setDiscoveryData] = useState<DiscoveryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSourceFile(e.target.files[0]);
    }
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setTargetFile(e.target.files[0]);
    }
  };

  const handleDiscover = async () => {
    if (!sourceFile && !targetFile) {
      setErrorMessage('Please upload at least a Source File or a Target Extract File to proceed.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('batch_id', 'Batch_001');
    if (sourceFile) formData.append('source_file', sourceFile);
    if (targetFile) formData.append('target_file', targetFile);

    try {
      let res = await fetch('/api/v1/discovery/upload-and-detect', {
        method: 'POST',
        body: formData,
      });

      // Fallback if proxy rewrite fails or port differs
      if (!res.ok && res.status >= 500) {
        try {
          const directRes = await fetch('http://localhost:8000/api/v1/discovery/upload-and-detect', {
            method: 'POST',
            body: formData,
          });
          if (directRes.ok) {
            res = directRes;
          }
        } catch (e) {
          // ignore fallback error
        }
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}: ${res.statusText}`);
      }

      const data: DiscoveryResponse = await res.json();
      setDiscoveryData(data);
      setActiveSubStep(2); // Automatically switch to File & Sheet Detection tab!
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload and discover files.');
    } finally {
      setIsLoading(false);
    }
  };

  const mainSteps = [
    'Discovery',
    'Key Detection',
    'Rules & Quality',
    'Exclusions',
    'Mapping',
    'Pre-Load',
    'Reconciliation',
    'Report Export'
  ];

  const subSteps = [
    { id: 1, label: '1. Upload Files', icon: UploadCloud },
    { id: 2, label: '2. File & Sheet Detection', icon: Table },
    { id: 3, label: '3. Schema Discovery', icon: Search },
    { id: 4, label: '4. Data Profiling', icon: BarChart2 }
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 shrink-0">
        <div>
          {/* LOGO */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center bg-gradient-to-tr from-blue-700 to-indigo-500 justify-center text-white shadow-md shadow-blue-500/20">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-none text-base">FusionConvert</h1>
              <span className="text-xs text-slate-400 font-medium">Reconciliation Platform</span>
            </div>
          </div>

          {/* NAV LINKS */}
          <nav className="space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
              <LayoutGrid className="w-4 h-4 text-slate-400" />
              Dashboard
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
              <FolderKanban className="w-4 h-4 text-slate-400" />
              Projects & Batches
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-100/80 transition">
              <GitCompare className="w-4 h-4 text-blue-600" />
              Conversion Wizard
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
              <History className="w-4 h-4 text-slate-400" />
              Audit Trail
            </a>
          </nav>
        </div>

        {/* SIDEBAR FOOTER */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-100/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-slate-700">AI Assistant</span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white uppercase tracking-wider">PRO</span>
          </div>

          <button className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1">
            <Moon className="w-3.5 h-3.5" />
            Light Mode
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP HEADER */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Step-by-Step Conversion Wizard</h2>
            <p className="text-xs text-slate-500 mt-0.5">Batch: <span className="font-semibold text-slate-700">Batch 001 - Customer Accounts</span> <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 font-semibold text-[10px]">DRAFT</span></p>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition shadow-sm">
              <FolderKanban className="w-3.5 h-3.5" />
              TEST (TEST)
            </button>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg hover:bg-slate-50 transition shadow-sm">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Load Demo Sample
            </button>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition shadow-md shadow-blue-500/20">
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </header>

        {/* CONTENT BODY */}
        <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* MAIN 8-STEPPER BAR */}
          <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-sm flex items-center justify-between overflow-x-auto">
            {mainSteps.map((step, index) => {
              const stepNum = index + 1;
              const isActive = stepNum === activeMainStep;
              return (
                <button
                  key={step}
                  onClick={() => setActiveMainStep(stepNum)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {stepNum}
                  </span>
                  {step}
                </button>
              );
            })}
          </div>

          {/* DISCOVERY SUB-STEPPER BAR */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex items-center gap-4">
            {subSteps.map((sub, idx) => {
              const Icon = sub.icon;
              const isActive = sub.id === activeSubStep;
              return (
                <React.Fragment key={sub.id}>
                  <button
                    onClick={() => setActiveSubStep(sub.id)}
                    className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {sub.label}
                  </button>
                  {idx < subSteps.length - 1 && (
                    <span className="text-slate-300 font-bold">&gt;</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* ERROR ALERT */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SUB-STEP 1: UPLOAD FILES */}
          {activeSubStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SOURCE FILE UPLOAD CARD */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <FileText className="w-5 h-5 text-slate-700" />
                      <h3 className="font-bold text-slate-900 text-base">Source File Upload</h3>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Upload source data file (.xlsx, .xls, .csv)</p>

                    <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                      <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-blue-600 mb-3 transition" />
                      <span className="text-xs font-medium text-slate-600 group-hover:text-blue-600 transition">
                        {sourceFile ? sourceFile.name : 'Drag & Drop Source File or Browse'}
                      </span>
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv,.txt,.dat,.zip,.json,.xml" 
                        onChange={handleSourceChange}
                        className="hidden" 
                      />
                    </label>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>{sourceFile ? `${(sourceFile.size / 1024).toFixed(1)} KB` : 'No file uploaded.'}</span>
                    {sourceFile && <span className="font-semibold text-emerald-600">File Selected ✓</span>}
                  </div>
                </div>

                {/* TARGET EXTRACT UPLOAD CARD */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <Database className="w-5 h-5 text-slate-700" />
                      <h3 className="font-bold text-slate-900 text-base">Fusion Target Extract Upload</h3>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Upload Oracle Fusion/BIP target extract (.xlsx, .xls, .csv)</p>

                    <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                      <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-blue-600 mb-3 transition" />
                      <span className="text-xs font-medium text-slate-600 group-hover:text-blue-600 transition">
                        {targetFile ? targetFile.name : 'Drag & Drop Target Extract or Browse'}
                      </span>
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv,.txt,.dat,.zip,.json,.xml" 
                        onChange={handleTargetChange}
                        className="hidden" 
                      />
                    </label>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>{targetFile ? `${(targetFile.size / 1024).toFixed(1)} KB` : 'No file uploaded.'}</span>
                    {targetFile && <span className="font-semibold text-emerald-600">File Selected ✓</span>}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleDiscover}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-xl shadow-md shadow-blue-500/20 transition"
                >
                  <Search className="w-4 h-4" />
                  {isLoading ? 'Discovering & Profiling Files...' : 'Discover & Profile Files'}
                </button>
              </div>
            </div>
          )}

          {/* SUB-STEP 2: FILE & SHEET DETECTION */}
          {activeSubStep === 2 && (
            <div className="space-y-6">
              {discoveryData ? (
                <>
                  {/* DETECTED FILES GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* SOURCE FILE DETAILS */}
                    {discoveryData.source_file_info && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Source File: {discoveryData.source_file_info.file_name}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">SOURCE</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Format</span>
                            <span className="font-semibold text-slate-800 uppercase">{discoveryData.source_file_info.file_extension}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Size</span>
                            <span className="font-semibold text-slate-800">{(discoveryData.source_file_info.file_size_bytes / 1024).toFixed(1)} KB</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Sheets Detected</span>
                            <span className="font-semibold text-slate-800">{discoveryData.source_file_info.sheet_count}</span>
                          </div>
                        </div>

                        {/* SHEETS LIST */}
                        <div className="space-y-2 pt-2">
                          <h5 className="text-xs font-bold text-slate-700">Detected Sheets:</h5>
                          {discoveryData.source_file_info.sheets.map((s) => (
                            <div key={s.sheet_name} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                                <span>Sheet: {s.sheet_name}</span>
                                <span className="text-slate-500">{s.record_count} rows | {s.column_count} cols</span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                Headers: {s.columns.slice(0, 5).join(', ')}{s.columns.length > 5 ? '...' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* TARGET FILE DETAILS */}
                    {discoveryData.target_file_info && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <Database className="w-4 h-4 text-purple-600" />
                            Target Extract: {discoveryData.target_file_info.file_name}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">TARGET EXTRACT</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Format</span>
                            <span className="font-semibold text-slate-800 uppercase">{discoveryData.target_file_info.file_extension}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Size</span>
                            <span className="font-semibold text-slate-800">{(discoveryData.target_file_info.file_size_bytes / 1024).toFixed(1)} KB</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px]">Sheets Detected</span>
                            <span className="font-semibold text-slate-800">{discoveryData.target_file_info.sheet_count}</span>
                          </div>
                        </div>

                        {/* SHEETS LIST */}
                        <div className="space-y-2 pt-2">
                          <h5 className="text-xs font-bold text-slate-700">Detected Sheets:</h5>
                          {discoveryData.target_file_info.sheets.map((s) => (
                            <div key={s.sheet_name} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                                <span>Sheet: {s.sheet_name}</span>
                                <span className="text-slate-500">{s.record_count} rows | {s.column_count} cols</span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                Headers: {s.columns.slice(0, 5).join(', ')}{s.columns.length > 5 ? '...' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* VALIDATION EXECUTION CHAIN TABLE */}
                  {discoveryData.source_validation_report && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-sm">Data Validation Execution Chain Report</h4>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          discoveryData.source_validation_report.overall_status === 'PASS'
                            ? 'bg-emerald-100 text-emerald-700'
                            : discoveryData.source_validation_report.overall_status === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          STATUS: {discoveryData.source_validation_report.overall_status}
                        </span>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="p-3">Step</th>
                              <th className="p-3">Validation Check</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Details / Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {discoveryData.source_validation_report.validation_steps.map((step) => (
                              <tr key={step.step_number} className="hover:bg-slate-50">
                                <td className="p-3 font-semibold text-slate-500">Step {step.step_number}</td>
                                <td className="p-3 font-semibold text-slate-900">{step.step_name}</td>
                                <td className="p-3">
                                  {step.status === 'PASS' && (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                      <CheckCircle2 className="w-4 h-4" /> PASS
                                    </span>
                                  )}
                                  {step.status === 'WARNING' && (
                                    <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                                      <AlertTriangle className="w-4 h-4" /> WARNING
                                    </span>
                                  )}
                                  {step.status === 'FAIL' && (
                                    <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                      <XCircle className="w-4 h-4" /> FAIL
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-600">{step.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
                  No files profiled yet. Please go to <span className="font-semibold text-blue-600">1. Upload Files</span> and click <span className="font-semibold text-blue-600">Discover & Profile Files</span>.
                </div>
              )}
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              onClick={() => setActiveSubStep((prev) => Math.max(1, prev - 1))}
              disabled={activeSubStep === 1}
              className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 disabled:opacity-40 px-4 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>

            <button
              onClick={() => setActiveSubStep((prev) => Math.min(4, prev + 1))}
              className="flex items-center gap-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-xl shadow-md shadow-blue-500/20 transition"
            >
              Next Stage
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
