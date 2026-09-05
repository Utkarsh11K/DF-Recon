'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Wand2, ClipboardList,
  ChevronLeft, ChevronRight, Layers, Zap,
  BarChart3, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const navItems = [
  { href: '/',           label: 'Home',              icon: LayoutDashboard, section: 'main' },
  { href: '/dashboard',  label: 'Dashboard',         icon: BarChart3,       section: 'main' },
  { href: '/projects',   label: 'Projects',          icon: FolderKanban,    section: 'main' },
  { href: '/batches',    label: 'Batches',           icon: Layers,          section: 'main' },
  { href: '/wizard',     label: 'Conversion Wizard', icon: Wand2,           section: 'tools' },
  { href: '/audit',      label: 'Audit Trail',       icon: ClipboardList,   section: 'tools' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        onClick={onMobileClose}
        title={collapsed ? label : undefined}
        className={cn(
          'sidebar-nav-item',
          'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200',
          collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
          active
            ? 'active bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/25'
            : 'text-slate-400 hover:text-white hover:bg-white/6'
        )}
      >
        {/* Active indicator glow */}
        {active && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500"
            style={{ zIndex: -1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          />
        )}
        <Icon size={16} className={cn('shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
        {!collapsed && (
          <span className="truncate">{label}</span>
        )}
        {!collapsed && active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80"
          />
        )}
      </Link>
    );
  };

  const content = (
    <div className={cn(
      'flex flex-col h-full transition-all duration-300 ease-in-out',
      'bg-slate-950 border-r border-slate-800/50',
      collapsed ? 'w-[60px]' : 'w-64'
    )}>

      {/* ── Logo ── */}
      <div className={cn(
        'flex items-center border-b border-slate-800/60 shrink-0',
        collapsed ? 'justify-center px-0 py-4' : 'gap-3 px-5 py-4'
      )}>
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shrink-0 shadow-lg shadow-indigo-500/30">
          <Zap size={15} className="text-white" strokeWidth={2.5} />
          {/* pulse ring */}
          <div className="absolute inset-0 rounded-lg bg-indigo-500 opacity-40 animate-pulse" style={{ animationDuration: '3s' }} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-none tracking-tight">DF-Recon</p>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5 tracking-wide uppercase">Enterprise Platform</p>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <p className="px-4 mb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            Workspace
          </p>
        )}
        <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {navItems.filter(i => i.section === 'main').map(item => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>

        {!collapsed && (
          <p className="px-4 mt-5 mb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            Tools
          </p>
        )}
        {collapsed && <div className="my-3 mx-3 h-px bg-slate-800/60" />}
        <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {navItems.filter(i => i.section === 'tools').map(item => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div className={cn(
        'shrink-0 border-t border-slate-800/50',
        collapsed ? 'px-2 py-3' : 'px-3 py-3'
      )}>
        {/* Collapse toggle */}
        <div className={cn('hidden lg:flex', collapsed ? 'justify-center' : 'justify-end')}>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Version pill */}
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-slate-600">v2.0.0 · Enterprise</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex h-screen sticky top-0 shrink-0 z-30">
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onMobileClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex lg:hidden"
              initial={{ x: -264 }} animate={{ x: 0 }} exit={{ x: -264 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
