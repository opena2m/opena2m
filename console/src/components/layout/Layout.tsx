import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Briefcase, ShieldAlert, Monitor,
  Package, FileText, DollarSign, ScrollText, Settings,
  Activity, Cpu,
} from 'lucide-react'
import { clsx } from 'clsx'
import { gw, type JobList } from '@/lib/api'

interface NavItem { to: string; icon: React.FC<{ className?: string }>; label: string; badge?: number }

function SidebarLink({ to, icon: Icon, label, badge }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-brand-600/20 text-brand-400 font-medium'
            : 'text-slate-400 hover:text-slate-100 hover:bg-surface-700',
        )
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const { data: runningJobs } = useQuery({
    queryKey: ['jobs', 'running'],
    queryFn: () => gw.listJobs({ state: 'EXECUTING', page_size: 1 }),
    refetchInterval: 5000,
    select: (d: JobList) => d.total,
  })
  const { data: auditingJobs } = useQuery({
    queryKey: ['jobs', 'auditing'],
    queryFn: () => gw.listJobs({ state: 'AUDITING', page_size: 1 }),
    refetchInterval: 5000,
    select: (d: JobList) => d.total,
  })
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => gw.health(),
    refetchInterval: 30000,
  })

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col bg-surface-800 border-r border-surface-600">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-surface-600">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">OpenA2M</span>
          <span className="ml-auto">
            <span className={clsx(
              'w-2 h-2 rounded-full inline-block',
              health ? 'bg-emerald-400' : 'bg-red-400'
            )} title={health ? 'Gateway online' : 'Gateway offline'} />
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink to="/jobs" icon={Briefcase} label="Jobs" badge={runningJobs} />
          <SidebarLink to="/review" icon={ShieldAlert} label="Review" badge={auditingJobs} />
          <div className="my-2 border-t border-surface-600" />
          <SidebarLink to="/devices" icon={Monitor} label="Devices" />
          <SidebarLink to="/domains" icon={Package} label="Domains" />
          <div className="my-2 border-t border-surface-600" />
          <SidebarLink to="/policies" icon={FileText} label="Policies" />
          <SidebarLink to="/budgets" icon={DollarSign} label="Budgets" />
          <SidebarLink to="/audit" icon={ScrollText} label="Audit Log" />
          <div className="my-2 border-t border-surface-600" />
          <SidebarLink to="/settings" icon={Settings} label="Settings" />
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-surface-600">
          <div className="flex items-center gap-2 px-2 py-1">
            <Activity className="w-3 h-3 text-slate-500" />
            <span className="text-xs text-slate-500">AIMP 1.0.0-draft · L3</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex items-center px-6 border-b border-surface-600 bg-surface-800 gap-4">
          <div className="flex-1" />
          <span className="text-xs text-slate-500 font-mono">OpenA2M Console v0.1</span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
