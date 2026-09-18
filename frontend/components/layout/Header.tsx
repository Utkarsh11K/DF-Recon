'use client';
import { Menu, Zap, Sparkles, Trash2, Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { useState, useEffect } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserSession } from '@/lib/types';

const pageTitles: Record<string, { title: string; sub: string }> = {
  '/':           { title: 'Home',             sub: 'Overview & activity' },
  '/dashboard':  { title: 'Dashboard',        sub: 'Migration projects & quick start' },
  '/projects':   { title: 'Projects',         sub: 'Manage reconciliation projects' },
  '/batches':    { title: 'Batches',          sub: 'Data batch management' },
  '/wizard':     { title: 'Conversion Wizard',sub: 'Step-by-step reconciliation' },
  '/repository-files': { title: 'Repository Files', sub: 'Project repository explorer' },
  '/audit':      { title: 'Audit Trail',      sub: 'Activity log & history' },
};

interface HeaderProps { onMenuClick: () => void; }

export function Header({ onMenuClick }: HeaderProps) {
  const { loadDemo, clearWorkspace, state } = useStore();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dfrecon_user');
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser({
          user_id: 'usr_default',
          name: 'Deepti Tiwari',
          email: 'deepti@dfrecon.io',
          role: 'Reconciliation Lead',
          token: 'dfrecon_tok_default',
          authenticated_at: new Date().toISOString(),
        });
      }
    } catch {}
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('dfrecon_user');
    setUser(null);
    setUserMenuOpen(false);
    toast('Logged out successfully', 'info');
    router.push('/login');
  };

  const pageInfo = Object.entries(pageTitles).find(([k]) =>
    k === '/' ? pathname === '/' : pathname.startsWith(k)
  )?.[1] ?? { title: 'DF-Recon', sub: '' };

  const hasData = state.projects.length > 0 || state.batches.length > 0;

  const handleLoadDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => {
      loadDemo();
      setLoadingDemo(false);
      toast('Demo workspace loaded', 'success');
    }, 600);
  };

  const handleClearWorkspace = () => {
    clearWorkspace();
    setConfirmClear(false);
    toast('Workspace cleared', 'info');
  };

  return (
    <>
      <header className="sticky top-0 z-20 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm shadow-slate-900/[0.04]">
        <div className="flex items-center h-full px-4 lg:px-6 gap-3">

          {/* Mobile hamburger */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Zap size={13} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-slate-900">DF-Recon</span>
          </div>

          {/* Page title — desktop */}
          <div className="hidden lg:block">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
              >
                <h1 className="text-sm font-semibold text-slate-900 leading-tight">{pageInfo.title}</h1>
                {pageInfo.sub && (
                  <p className="text-xs text-slate-400 leading-tight mt-0.5">{pageInfo.sub}</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex-1" />

          {/* Right-side actions */}
          <div className="flex items-center gap-1.5">

            {/* Load Demo */}
            <Button
              variant="outline"
              size="sm"
              icon={loadingDemo
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}><Sparkles size={13} /></motion.div>
                : <Sparkles size={13} />
              }
              onClick={handleLoadDemo}
              loading={loadingDemo}
              className="hidden sm:inline-flex text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300"
            >
              Load Demo
            </Button>

            {/* Clear Workspace */}
            {hasData && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setConfirmClear(true)}
                className="hidden sm:inline-flex text-slate-400 hover:text-red-500 hover:bg-red-50"
              >
                Clear
              </Button>
            )}

            {/* Notification bell */}
            <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={16} />
              {state.auditEntries.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
              )}
            </button>

            {/* User avatar & dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-slate-100 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-700 leading-none truncate max-w-[120px]">
                    {user?.name || 'Deepti Tiwari'}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5 truncate max-w-[120px]">
                    {user?.role || 'Recon Lead'}
                  </p>
                </div>
                <ChevronDown size={12} className="text-slate-400 group-hover:text-slate-600 transition-colors hidden sm:block" />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-xl z-50 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-gray-100 mb-1">
                      <p className="font-semibold text-slate-900">{user?.name || 'Deepti Tiwari'}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user?.email || 'deepti@dfrecon.io'}</p>
                      <span className="inline-block mt-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {user?.role || 'Reconciliation Lead'}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push('/dashboard');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 text-left font-medium"
                    >
                      <User size={14} className="text-slate-400" />
                      Dashboard Profile
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 text-left font-semibold"
                    >
                      <LogOut size={14} className="text-rose-500" />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile demo button */}
            <button
              onClick={handleLoadDemo}
              className="sm:hidden p-2 rounded-lg hover:bg-slate-100 text-indigo-600 transition-colors"
              aria-label="Load demo data"
            >
              <Sparkles size={16} />
            </button>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClearWorkspace}
        title="Clear Workspace"
        message="This will permanently delete all projects, batches, files, rules, and reconciliation data. This action cannot be undone."
        confirmLabel="Clear Everything"
        variant="danger"
      />
    </>
  );
}
