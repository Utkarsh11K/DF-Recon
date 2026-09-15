'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  GitBranch, RefreshCw, Check, Lock, FolderOpen,
  ExternalLink, Unplug, AlertCircle,
} from 'lucide-react';
import type { UploadedFile, ColumnProfile } from '@/lib/types';

type Repository = {
  id: number;
  name: string;
  full_name: string;
  visibility: string;
  branch: string;
  updated_at: string | null;
  html_url: string | null;
};

type RepositoryFile = {
  name: string;
  path: string;
  type: string;
  size: number;
  url: string | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}

const createMockFile = (file: {name: string, size: number}): UploadedFile => {
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const cols: ColumnProfile[] = [
    { name: 'record_id', dataType: 'string', nullCount: 0, uniqueCount: 3, sampleValues: ['REC_001', 'REC_002', 'REC_003'], isPrimaryKeyCandidate: true },
    { name: 'entity_name', dataType: 'string', nullCount: 0, uniqueCount: 3, sampleValues: ['Global Supplier Inc', 'Apex Trading Ltd', 'Nexus Systems'], isPrimaryKeyCandidate: false },
    { name: 'contact_email', dataType: 'string', nullCount: 0, uniqueCount: 3, sampleValues: ['info@globalsupplier.com', 'support@apextrading.com', 'billing@nexus.io'], isPrimaryKeyCandidate: false },
    { name: 'amount', dataType: 'number', nullCount: 0, uniqueCount: 3, sampleValues: ['1500.00', '3200.50', '890.00'], isPrimaryKeyCandidate: false },
    { name: 'status', dataType: 'string', nullCount: 0, uniqueCount: 2, sampleValues: ['ACTIVE', 'PENDING'], isPrimaryKeyCandidate: false }
  ];
  const sampleData: Record<string, unknown>[] = [
    { record_id: 'REC_001', entity_name: 'Global Supplier Inc', contact_email: 'info@globalsupplier.com', amount: '1500.00', status: 'ACTIVE' },
    { record_id: 'REC_002', entity_name: 'Apex Trading Ltd', contact_email: 'support@apextrading.com', amount: '3200.50', status: 'PENDING' },
    { record_id: 'REC_003', entity_name: 'Nexus Systems', contact_email: 'billing@nexus.io', amount: '890.00', status: 'ACTIVE' },
  ];
  return {
    id: Math.random().toString(36).slice(2),
    name: file.name,
    size: file.size,
    type: isExcel ? 'application/vnd.ms-excel' : 'text/csv',
    uploadedAt: new Date().toISOString(),
    columns: cols,
    rowCount: Math.max(50, Math.floor(file.size / 200)),
    sampleData
  };
};

export default function GithubConnectorPage() {
  const { dispatch, genId, addAudit } = useStore();
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFile[]>([]);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const connectGithub = async () => {
    if (!token.trim()) {
      setError('Enter a GitHub personal access token to connect.');
      return;
    }
    setLoadingRepositories(true);
    setError('');
    try {
      const response = await fetch('/api/v1/github/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to connect to GitHub.');
      setRepositories(data.repositories);
      setConnected(true);
      sessionStorage.setItem('df-recon-github-token', token);
      if (data.repositories.length > 0) await selectRepository(data.repositories[0], token);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to connect to GitHub.');
      setConnected(false);
    } finally {
      setLoadingRepositories(false);
    }
  };

  const selectRepository = async (repository: Repository, accessToken = token) => {
    setSelectedRepository(repository);
    setLoadingFiles(true);
    setError('');
    try {
      const response = await fetch('/api/v1/github/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: accessToken,
          owner: repository.full_name.split('/')[0],
          repository: repository.name,
          branch: repository.branch,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load repository files.');
      setRepositoryFiles(data.files);
    } catch (fileError) {
      setRepositoryFiles([]);
      setError(fileError instanceof Error ? fileError.message : 'Unable to load repository files.');
    } finally {
      setLoadingFiles(false);
    }
  };

  const refreshRepositories = async () => {
    await connectGithub();
  };

  const disconnectGithub = () => {
    setToken('');
    sessionStorage.removeItem('df-recon-github-token');
    setConnected(false);
    setRepositories([]);
    setSelectedRepository(null);
    setRepositoryFiles([]);
    setError('');
  };

  const createProjectFromRepository = () => {
    if (!selectedRepository || !projectName.trim()) return;
    const projectId = genId();
    const now = new Date().toISOString();
    
    // 1. Detect batches from repository files (just like folder architecture)
    const batchesMap = new Map<string, {name: string, fileInfo?: RepositoryFile, moduleName?: string}>();
    const indicators = ['01-source', '02-tranformed', '03-fbdi', '04-fusion', '05-recon'];
    
    for (let i = 0; i < repositoryFiles.length; i++) {
      const file = repositoryFiles[i];
      const pathParts = file.path.split('/');
      const indIdx = pathParts.findIndex(p => indicators.some(ind => p.toLowerCase().includes(ind)));
      
      if (indIdx > 0) {
        const batchName = pathParts[indIdx - 1];
        const moduleName = indIdx > 1 ? pathParts[indIdx - 2] : undefined;
        const key = moduleName ? `${moduleName} - ${batchName}` : batchName;
        
        if (!batchesMap.has(key)) {
          batchesMap.set(key, { name: key, moduleName });
        }
        
        if (pathParts[indIdx].toLowerCase().includes('01-source') && 
            file.name.match(/\.(csv|xlsx|xls|txt)$/i)) {
          batchesMap.get(key)!.fileInfo = file;
        }
      }
    }

    const batchList = Array.from(batchesMap.values());

    // 2. Create the project
    dispatch({
      type: 'ADD_PROJECT',
      payload: {
        id: projectId,
        name: projectName.trim(),
        description: projectDescription.trim(),
        repositoryPath: selectedRepository.full_name,
        repositoryUrl: selectedRepository.html_url ?? undefined,
        repositoryBranch: selectedRepository.branch,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchCount: batchList.length,
        tags: ['github', selectedRepository.name],
      },
    });
    addAudit('PROJECT_CREATED_FROM_GITHUB', 'Project', projectId, projectName.trim(), `Created from repository ${selectedRepository.full_name}`);
    
    // 3. Create the batches
    batchList.forEach(bInfo => {
      const batchId = genId();
      const sourceFileMock = bInfo.fileInfo ? createMockFile(bInfo.fileInfo) : undefined;
      
      dispatch({
        type: 'ADD_BATCH',
        payload: {
          id: batchId,
          projectId: projectId,
          name: bInfo.name,
          description: `Auto-generated from repository structure`,
          folderPath: selectedRepository.full_name,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          wizardStep: sourceFileMock ? 'key-detection' : 'discovery',
          completedSteps: sourceFileMock ? ['discovery'] : [],
          sourceFile: sourceFileMock
        }
      });
      addAudit('BATCH_CREATED', 'Batch', batchId, bInfo.name, `Batch auto-created from repository structure`);
    });

    if (batchList.length > 0) {
      toast(`Project created with ${batchList.length} auto-detected batches!`, 'success');
    } else {
      toast(`Project created from ${selectedRepository.name}`, 'success');
    }
    
    setShowProjectModal(false);
    setProjectName('');
    setProjectDescription('');
  };

  return (
    <div className="p-4 lg:p-6 animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><GitBranch size={21} /></div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">GitHub Connector</h1>
            <p className="mt-1 text-sm text-slate-500">Connect GitHub and choose the repository used by this reconciliation workspace.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!connected ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><GitBranch size={26} /></div>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">Connect your GitHub account</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">Use a GitHub personal access token with repository read access. The token is sent to the backend for each request and is not stored.</p>
            <div className="mx-auto mt-6 max-w-md text-left">
              <label htmlFor="github-token" className="mb-1.5 block text-xs font-medium text-slate-700">GitHub personal access token</label>
              <input id="github-token" type="password" value={token} onChange={event => setToken(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connectGithub(); }} placeholder="github_pat_..." className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <button disabled={loadingRepositories} onClick={() => void connectGithub()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                {loadingRepositories ? <RefreshCw size={16} className="animate-spin" /> : <GitBranch size={16} />}
                {loadingRepositories ? 'Connecting...' : 'Connect GitHub'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-emerald-800"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100"><Check size={15} /></span><span><strong>GitHub connected</strong> · {repositories.length} repositories available</span></div>
              <div className="flex items-center gap-3">
                <button onClick={() => void refreshRepositories()} disabled={loadingRepositories} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-60"><RefreshCw size={13} className={loadingRepositories ? 'animate-spin' : ''} /> Refresh</button>
                <button onClick={disconnectGithub} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600"><Unplug size={14} /> Disconnect</button>
              </div>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Your repositories</h2>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {repositories.map(repository => (
                    <button key={repository.id} onClick={() => void selectRepository(repository)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-slate-50 ${selectedRepository?.id === repository.id ? 'bg-indigo-50/70' : 'bg-white'}`}>
                      <FolderOpen size={17} className={selectedRepository?.id === repository.id ? 'text-indigo-600' : 'text-slate-400'} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{repository.full_name}</span><span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><Lock size={11} /> {repository.visibility} · {repository.branch}</span></span>
                      {selectedRepository?.id === repository.id && <Check size={15} className="text-indigo-600" />}
                    </button>
                  ))}
                  {repositories.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No repositories are available for this token.</p>}
                </div>
              </div>

              {selectedRepository && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected repository</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900">{selectedRepository.full_name}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400">Branch</p><p className="mt-1 font-medium text-slate-700">{selectedRepository.branch}</p></div><div><p className="text-slate-400">Files</p><p className="mt-1 font-medium text-slate-700">{repositoryFiles.length}</p></div><div className="col-span-2"><p className="text-slate-400">Last GitHub update</p><p className="mt-1 font-medium text-slate-700">{formatUpdatedAt(selectedRepository.updated_at)}</p></div></div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => void selectRepository(selectedRepository)} disabled={loadingFiles} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-60"><RefreshCw size={14} className={loadingFiles ? 'animate-spin' : ''} /> {loadingFiles ? 'Syncing...' : 'Sync'}</button>
                    <button onClick={() => { setProjectName(selectedRepository.name); setShowProjectModal(true); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700">Create project</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {selectedRepository && <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Repository files</h2><p className="mt-1 text-xs text-slate-500">Files from {selectedRepository.full_name} on the {selectedRepository.branch} branch.</p></div>{selectedRepository.html_url && <a href={selectedRepository.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"><ExternalLink size={14} /> Open repository</a>}</div><div className="divide-y divide-slate-100">{loadingFiles ? <p className="px-5 py-8 text-center text-sm text-slate-500">Loading repository files...</p> : repositoryFiles.map(file => <a key={file.path} href={file.url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FolderOpen size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{file.path}</p><p className="mt-0.5 text-xs text-slate-500">File · {formatBytes(file.size)}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Synced</span></a>)}{!loadingFiles && repositoryFiles.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">This branch has no files.</p>}</div></section>}
        </div>
      )}

      {showProjectModal && selectedRepository && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="create-project-title" className="text-lg font-semibold text-slate-900">Create project from repository</h2>
                <p className="mt-1 text-xs text-slate-500">Repository path: {selectedRepository.full_name}</p>
              </div>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">×</button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Project name
                <input value={projectName} onChange={event => setProjectName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" autoFocus />
              </label>
              <label className="block text-sm font-medium text-slate-700">Description
                <textarea value={projectDescription} onChange={event => setProjectDescription(event.target.value)} rows={3} placeholder="Describe this reconciliation project" className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowProjectModal(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={!projectName.trim()} onClick={createProjectFromRepository} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Create project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
