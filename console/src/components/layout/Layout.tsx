import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { LayoutDashboard, Briefcase, ShieldAlert, Monitor, Package, FileText, DollarSign, ScrollText, Settings, Menu, X, Cpu, Activity, Search } from 'lucide-react'
import { ModeSwitcher, LangSwitcher, ThemeSwitcher } from '@/components/shared'
import { useT } from '@/i18n'
import { listJobs, getHealth } from '@/lib/dataLayer'
import { useSettingsStore } from '@/store/settings'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation(); const navigate = useNavigate()
  const t = useT(); const mode = useSettingsStore(s => s.mode)

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768) setOpen(false); if (window.innerWidth < 1100) setCollapsed(true); else setCollapsed(false) }
    fn(); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn)
  }, [])

  // Cmd-K search shortcut
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); (document.querySelector('.topbar-search input') as HTMLElement)?.focus() } }
    document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn)
  }, [])

  const { data: health } = useQuery({ queryKey: ['health', mode], queryFn: getHealth, refetchInterval: 30000 })
  const { data: running } = useQuery({ queryKey: ['jobs-running', mode], queryFn: () => listJobs({ state: 'EXECUTING', page_size: 1 }), refetchInterval: 5000 })
  const { data: auditing } = useQuery({ queryKey: ['jobs-auditing', mode], queryFn: () => listJobs({ state: 'AUDITING', page_size: 1 }), refetchInterval: 5000 })

  const runningCount = (running as any)?.total ?? 0
  const auditingCount = (auditing as any)?.total ?? 0

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t.nav.dashboard },
    { to: '/jobs',      icon: Briefcase,        label: t.nav.jobs,    badge: runningCount },
    { to: '/review',    icon: ShieldAlert,      label: t.nav.review,  badge: auditingCount, urgent: auditingCount > 0 },
    null,
    { to: '/devices',   icon: Monitor,          label: t.nav.devices },
    { to: '/domains',   icon: Package,          label: t.nav.domains },
    null,
    { to: '/policies',  icon: FileText,         label: t.nav.policies },
    { to: '/budgets',   icon: DollarSign,       label: t.nav.budgets },
    { to: '/audit',     icon: ScrollText,       label: t.nav.audit },
    null,
    { to: '/settings',  icon: Settings,         label: t.nav.settings },
  ]

  const SidebarContent = () => (
    <>
      <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-[var(--c-border)] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[var(--c-accent)] flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
          <Cpu className="w-4 h-4 text-white" />
        </div>
        {!collapsed && <span style={{fontFamily:'var(--font-display)',fontWeight:700}} className="text-[15px] text-[var(--c-text)] tracking-tight flex-1 cursor-pointer" onClick={() => navigate('/')}>Open<span className="text-[var(--c-accent)]">A2M</span></span>}
        <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', health ? 'bg-[var(--c-green)] animate-pulse-dot' : 'bg-[var(--c-red)]')}
          title={health ? t.dashboard.gatewayOnline : t.dashboard.gatewayOffline} />
        <button className="md:hidden text-[var(--c-dim)] ml-1" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item, i) => {
          if (!item) return <div key={i} className="my-2 border-t border-[var(--c-border-dim)]" />
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => clsx('flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-all', collapsed && 'justify-center', isActive ? 'bg-[var(--c-accent-glow)] text-[var(--c-accent)] font-medium' : 'text-[var(--c-dim)] hover:text-[var(--c-text)] hover:bg-[rgba(255,255,255,0.03)]')}
              title={collapsed ? item.label : undefined}>
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.badge != null && item.badge > 0 && (
                <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center', item.urgent ? 'bg-amber-500 text-black' : 'bg-[var(--c-accent)] text-white')}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
      {!collapsed && (
        <div className="px-3 py-3 border-t border-[var(--c-border-dim)] space-y-2">
          <ModeSwitcher />
          <div className="flex items-center justify-between px-1">
            <ThemeSwitcher />
            <span className="text-[10px] text-[var(--c-dim)] opacity-60">AIMP 1.0-draft · L3</span>
            <LangSwitcher />
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {open && <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}

      {/* Desktop sidebar */}
      <aside className={clsx('hidden md:flex flex-col flex-shrink-0 bg-[var(--c-surface)] border-r border-[var(--c-border)] h-full transition-all duration-200', collapsed ? 'w-[56px]' : 'w-[220px]')}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer sidebar */}
      <aside className={clsx('md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[220px] bg-[var(--c-surface)] border-r border-[var(--c-border)] transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full')}>
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-[52px] flex items-center px-4 md:px-5 border-b border-[var(--c-border)] bg-[var(--c-surface)] gap-3 flex-shrink-0">
          <button className="md:hidden btn btn-ghost p-1.5" onClick={() => setOpen(true)}><Menu className="w-4 h-4" /></button>
          <button className="hidden md:block btn btn-ghost p-1.5" onClick={() => setCollapsed(c => !c)} title={t.layout.toggleSidebar}><Menu className="w-4 h-4" /></button>

          {/* Search */}
          <div className="topbar-search flex-1 max-w-sm relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-dim)]" />
            <input className="input pl-9 text-xs h-8" placeholder={t.layout.searchPlaceholder} />
          </div>

          <div className="flex-1" />

          {/* Gateway health pill */}
          <div className={clsx('hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border', health ? 'bg-emerald-950/40 border-emerald-900/40 text-emerald-400' : 'bg-red-950/40 border-red-900/40 text-red-400')}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', health ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400')} />
            AIMP 1.0.0-draft
          </div>

          {/* HITL alert button */}
          {auditingCount > 0 && (
            <button className="btn btn-amber text-xs" onClick={() => navigate('/review')}>
              ⚠ {auditingCount} Needs Review
            </button>
          )}

          <ThemeSwitcher />
          {/* Back to landing */}
          <button className="btn btn-ghost text-xs hidden md:flex" onClick={() => navigate('/')}>← Landing</button>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>

        {/* Footer version pill */}
        <div className="px-6 py-1.5 border-t border-[var(--c-border-dim)] flex items-center justify-end">
          <span className="text-[9px] text-[var(--c-dim)] mono opacity-40">console v0.1.0 · gateway v0.1.0</span>
        </div>
      </div>
    </div>
  )
}
