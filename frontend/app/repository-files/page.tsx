'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/lib/store';
import {
  ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen,
  GitBranch, Search, MoreHorizontal, RefreshCw, Code2, AlertCircle,
  Plus, Save, X, GitCommit,
} from 'lucide-react';

type GitHubFile = {
  name: string;
  path: string;
  type: 'file';
  size: number;
  url: string | null;
};

type FilePreview = {
  kind: 'text' | 'table' | 'workbook';
  content?: string;
  columns?: string[];
  rows?: Record<string, string>[];
  sheets?: { name: string; columns: string[]; rows: Record<string, string>[]; total_rows?: number }[];
};

type WorkbookSheet = { name: string; columns: string[]; rows: Record<string, string>[]; total_rows?: number };

type RepositoryNode = {
  name: string;
  kind: 'folder' | 'file';
  path: string;
  size?: number;
  url?: string | null;
  children?: RepositoryNode[];
};

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTree(files: GitHubFile[]): RepositoryNode[] {
  const root: RepositoryNode[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    let parentPath = '';
    parts.forEach((part, index) => {
      const path = parentPath ? `${parentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = current.find(item => item.name === part);
      if (!node) {
        node = isFile
          ? { name: part, kind: 'file', path, size: file.size, url: file.url }
          : { name: part, kind: 'folder', path, children: [] };
        current.push(node);
      }
      if (!isFile) current = node.children ?? [];
      parentPath = path;
    });
  }
  const sortNodes = (nodes: RepositoryNode[]) => {
    nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1);
    nodes.forEach(node => node.children && sortNodes(node.children));
  };
  sortNodes(root);
  return root;
}

function DataTablePreview({ columns, rows, totalRows }: { columns: string[]; rows: Record<string, string>[]; totalRows?: number }) {
  return <div className="overflow-auto rounded-md border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-slate-100"><tr>{columns.map(column => <th key={column} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">{columns.map(column => <td key={column} className="max-w-xs whitespace-nowrap px-3 py-2 text-slate-700">{row[column] ?? ''}</td>)}</tr>)}</tbody></table><p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Showing {rows.length}{totalRows && totalRows > rows.length ? ` of ${totalRows}` : ''} rows</p></div>;
}

function WorkbookPreview({ sheets }: { sheets: { name: string; columns: string[]; rows: Record<string, string>[]; total_rows?: number }[] }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  return <div>{sheets.length > 1 && <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">{sheets.map((item, index) => <button key={item.name} onClick={() => setActiveSheet(index)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium ${activeSheet === index ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.name}</button>)}</div>}{sheet ? <DataTablePreview columns={sheet.columns} rows={sheet.rows} totalRows={sheet.total_rows} /> : <p className="text-sm text-slate-500">This workbook has no readable sheets.</p>}</div>;
}

export default function RepositoryFilesPage() {
  const { state } = useStore();
  const projectsWithRepositories = state.projects.filter(project => project.repositoryPath);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [token, setToken] = useState('');
  const [branches, setBranches] = useState<{ name: string; protected: boolean }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [newPath, setNewPath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedProject = useMemo(() => {
    return projectsWithRepositories.find(project => project.id === selectedProjectId) ?? projectsWithRepositories[0];
  }, [projectsWithRepositories, selectedProjectId]);
  const tree = useMemo(() => buildTree(files), [files]);
  const selectedFile = files.find(file => file.path === selectedPath);

  const loadRepositoryFiles = async (project = selectedProject, accessToken = token, branch = selectedBranch || project?.repositoryBranch || 'main') => {
    if (!project?.repositoryPath || !accessToken) return;
    const [owner, repository] = project.repositoryPath.split('/');
    if (!owner || !repository) {
      setError('The selected project has an invalid repository path.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/github/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken, owner, repository, branch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load files from GitHub.');
      setFiles(data.files ?? []);
      setSelectedPath(data.files?.[0]?.path ?? '');
      const folders: Record<string, boolean> = {};
      for (const file of data.files ?? []) {
        const parts = file.path.split('/');
        parts.slice(0, -1).reduce((path: string, part: string) => {
          const nextPath = path ? `${path}/${part}` : part;
          folders[nextPath] = true;
          return nextPath;
        }, '');
      }
      setOpenFolders(folders);
    } catch (loadError) {
      setFiles([]);
      setSelectedPath('');
      setError(loadError instanceof Error ? loadError.message : 'Unable to load files from GitHub.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sessionToken = sessionStorage.getItem('df-recon-github-token') ?? '';
    setToken(sessionToken);
    setSelectedBranch('');
    if (sessionToken && selectedProject) {
      void loadBranches(selectedProject, sessionToken);
    }
  // The project identity controls which repository is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  const loadBranches = async (project = selectedProject, accessToken = token) => {
    if (!project?.repositoryPath || !accessToken) return;
    const [owner, repository] = project.repositoryPath.split('/');
    try {
      const response = await fetch('/api/v1/github/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: accessToken, owner, repository, branch: project.repositoryBranch ?? 'main' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load branches.');
      setBranches(data.branches ?? []);
      const preferredBranch = project.repositoryBranch ?? data.branches?.[0]?.name;
      const branch = data.branches?.some((item: { name: string }) => item.name === preferredBranch) ? preferredBranch : data.branches?.[0]?.name;
      setSelectedBranch(branch ?? 'main');
      if (branch) void loadRepositoryFiles(project, accessToken, branch);
    } catch (branchError) {
      setError(branchError instanceof Error ? branchError.message : 'Unable to load branches.');
    }
  };

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
    setSelectedPath('');
    setPreview(null);
    void loadRepositoryFiles(selectedProject, token, branch);
  };

  const saveFile = async (path: string, content: string, workbook: WorkbookSheet[] | null = null) => {
    if (!selectedProject?.repositoryPath || !token || !selectedBranch || !commitMessage.trim()) return;
    const [owner, repository] = selectedProject.repositoryPath.split('/');
    setSaving(true);
    setError('');
    try {
      let workbookPayload = workbook;
      if (!workbookPayload && /\.(xlsx|xls)$/i.test(path)) {
        try {
          workbookPayload = JSON.parse(content) as WorkbookSheet[];
        } catch {
          throw new Error('Excel edits must remain valid workbook JSON.');
        }
      }
      const response = await fetch('/api/v1/github/write-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, owner, repository, branch: selectedBranch, path, content: workbookPayload ? '' : content, workbook: workbookPayload, message: commitMessage.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to commit file.');
      setCommitMessage('');
      setEditing(false);
      setShowCreate(false);
      await loadRepositoryFiles(selectedProject, token, selectedBranch);
      setSelectedPath(path);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to commit file.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedFile || !selectedProject?.repositoryPath || !token) {
      setFileContent('');
      setPreview(null);
      return;
    }
    const [owner, repository] = selectedProject.repositoryPath.split('/');
    const controller = new AbortController();
    setLoadingContent(true);
    fetch('/api/v1/github/file-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        owner,
        repository,
        branch: selectedBranch || selectedProject.repositoryBranch || 'main',
        path: selectedFile.path,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Unable to preview this file.');
        setPreview(data);
        setFileContent(data.kind === 'workbook' ? JSON.stringify(data.sheets ?? [], null, 2) : data.content ?? '');
      })
      .catch(contentError => {
        if (contentError instanceof Error && contentError.name !== 'AbortError') {
          setPreview(null);
          setFileContent(`Unable to preview this file: ${contentError.message}`);
        }
      })
      .finally(() => setLoadingContent(false));
    return () => controller.abort();
  }, [selectedFile, selectedProject, token]);

  const renderTree = (nodes: RepositoryNode[], depth = 0): ReactNode => nodes.map(node => {
    const isOpen = openFolders[node.path] ?? false;
    if (node.kind === 'folder') {
      return <div key={node.path}>
        <button onClick={() => setOpenFolders(current => ({ ...current, [node.path]: !current[node.path] }))} className="flex w-full items-center gap-1.5 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50" style={{ paddingLeft: `${10 + depth * 17}px` }}>
          {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
          {isOpen ? <FolderOpen size={15} className="text-amber-500" /> : <Folder size={15} className="text-amber-500" />}
          <span className="font-medium">{node.name}</span><span className="ml-auto mr-3 text-[10px] text-slate-400">{node.children?.length ?? 0}</span>
        </button>
        {isOpen && node.children && renderTree(node.children, depth + 1)}
      </div>;
    }
    return <button key={node.path} onClick={() => setSelectedPath(node.path)} className={`group flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs hover:bg-blue-50 ${selectedPath === node.path ? 'bg-blue-100 text-blue-800' : 'text-slate-600'}`} style={{ paddingLeft: `${29 + depth * 17}px` }}>
      <FileCode2 size={14} className={selectedPath === node.path ? 'text-blue-600' : 'text-slate-400'} /><span className="truncate">{node.name}</span>
    </button>;
  });

  return <div className="flex h-full min-h-[calc(100vh-112px)] flex-col bg-slate-100 p-3 lg:p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-slate-500"><span>Repository</span><ChevronRight size={13} /><span className="font-medium text-slate-800">{selectedProject?.name ?? 'Select a project'}</span><ChevronRight size={13} /><span className="font-medium text-slate-800">Repository Files</span></div>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">Project
        <select value={selectedProject?.id ?? ''} onChange={event => { setSelectedProjectId(event.target.value); }} className="min-w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500">
          <option value="">Select project</option>{projectsWithRepositories.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
    </div>

    {!selectedProject ? <section className="flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white shadow-sm"><div className="max-w-md px-6 text-center"><FolderOpen size={34} className="mx-auto text-slate-300" /><h1 className="mt-3 text-lg font-semibold text-slate-800">No connected repository</h1><p className="mt-2 text-sm text-slate-500">Create a project from the GitHub Connector first.</p></div></section> : <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs"><GitBranch size={14} className="text-blue-600" /><span className="font-semibold text-slate-800">{selectedProject.repositoryPath}</span><select value={selectedBranch || selectedProject.repositoryBranch || 'main'} onChange={event => handleBranchChange(event.target.value)} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] outline-none" disabled={!branches.length}>{branches.length ? branches.map(branch => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? ' (protected)' : ''}</option>) : <option>{selectedProject.repositoryBranch ?? 'main'}</option>}</select><span className="text-slate-400">{loading ? 'Loading...' : `${files.length} files`}</span><button onClick={() => void loadBranches()} disabled={loading || !token} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Sync</button><button onClick={() => { setNewPath(''); setCommitMessage(''); setShowCreate(true); }} disabled={!token} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] text-white disabled:opacity-50"><Plus size={12} /> New file</button></div>
      {error && <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle size={14} />{error}{!token && <a href="/github-connector" className="ml-auto font-medium underline">Reconnect GitHub</a>}</div>}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 lg:w-64 lg:border-b-0 lg:border-r"><div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><FolderOpen size={14} className="text-amber-500" /> Explorer <Search size={13} className="ml-auto text-slate-400" /><MoreHorizontal size={14} className="text-slate-400" /></div><div className="max-h-[calc(100vh-255px)] overflow-auto py-1">{loading ? <p className="px-3 py-6 text-center text-xs text-slate-500">Loading actual repository files...</p> : renderTree(tree)}</div></aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col"><div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs"><FileCode2 size={14} className="text-blue-600" /><span className="font-medium text-slate-700">{selectedPath || 'No file selected'}</span>{selectedFile && <><span className="text-slate-400">·</span><span className="text-slate-400">{formatBytes(selectedFile.size)}</span></>}{selectedFile && <button onClick={() => { setDraftContent(fileContent); setCommitMessage(`Update ${selectedFile.path}`); setEditing(true); }} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-white"><Code2 size={12} /> Edit</button>}</div><div className="flex-1 overflow-auto bg-white p-4">{selectedFile ? <><div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 text-xs text-slate-500"><Code2 size={14} className="text-slate-400" /> {selectedProject.repositoryPath}/{selectedFile.path}{selectedFile.url && <a href={selectedFile.url} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:underline">Open on GitHub</a>}</div>{loadingContent ? <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">Loading actual file content...</div> : editing ? <div className="space-y-3"><textarea value={draftContent} onChange={event => setDraftContent(event.target.value)} className="min-h-[360px] w-full rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none" /><div className="flex flex-wrap items-center gap-2"><input value={commitMessage} onChange={event => setCommitMessage(event.target.value)} placeholder="Commit message" className="min-w-64 flex-1 rounded border border-slate-200 px-3 py-2 text-xs" /><button onClick={() => void saveFile(selectedFile.path, draftContent)} disabled={saving || !commitMessage.trim()} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><Save size={13} /> {saving ? 'Committing...' : 'Commit changes'}</button><button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-2 text-xs"><X size={13} /> Cancel</button></div></div> : preview?.kind === 'workbook' ? <WorkbookPreview sheets={preview.sheets ?? []} /> : preview?.kind === 'table' ? <DataTablePreview columns={preview.columns ?? []} rows={preview.rows ?? []} /> : <pre className="overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700"><code>{fileContent}</code></pre>}</> : <p className="text-sm text-slate-500">Select a file from the Explorer.</p>}</div></main>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500"><span>{selectedProject.repositoryBranch ?? 'main'}</span><span>GitHub API</span><span className="ml-auto">{files.length} actual files</span></div>
    </section>}
    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-repository-file"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="new-repository-file" className="text-lg font-semibold text-slate-900">Create file</h2><p className="mt-1 text-xs text-slate-500">Create and commit a file on the {selectedBranch || 'selected'} branch.</p></div><button onClick={() => setShowCreate(false)} aria-label="Close"><X size={18} className="text-slate-400" /></button></div><div className="mt-4 space-y-3"><input value={newPath} onChange={event => setNewPath(event.target.value)} placeholder="Folder/path/file.txt" className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" /><textarea value={draftContent} onChange={event => setDraftContent(event.target.value)} placeholder="File content" className="min-h-48 w-full rounded border border-slate-200 p-3 font-mono text-xs outline-none focus:border-indigo-500" /><div className="flex items-center gap-2"><GitCommit size={15} className="text-slate-400" /><input value={commitMessage} onChange={event => setCommitMessage(event.target.value)} placeholder="Commit message" className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" /></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="rounded border border-slate-200 px-3 py-2 text-sm">Cancel</button><button onClick={() => void saveFile(newPath.trim(), draftContent)} disabled={saving || !newPath.trim() || !commitMessage.trim()} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={14} /> {saving ? 'Committing...' : 'Create and commit'}</button></div></div></div>}
  </div>;
}
