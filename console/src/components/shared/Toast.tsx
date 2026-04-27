import { useToastStore } from '@/store/toast'
import { CheckCircle, AlertTriangle, Info, XCircle, X } from 'lucide-react'
import { clsx } from 'clsx'

const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info }
const COLORS = { success:'border-emerald-800 bg-emerald-950/90 text-emerald-300', error:'border-red-800 bg-red-950/90 text-red-300', warning:'border-amber-800 bg-amber-950/90 text-amber-300', info:'border-blue-800 bg-blue-950/90 text-blue-300' }

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{maxWidth:360}}>
      {toasts.map(t => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={clsx('flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur pointer-events-auto animate-fade-in', COLORS[t.kind])}>
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="flex-1 text-xs font-medium">{t.message}</p>
            {t.action && <button onClick={t.action.onClick} className="text-xs underline opacity-80 hover:opacity-100 whitespace-nowrap">{t.action.label}</button>}
            <button onClick={()=>removeToast(t.id)} className="opacity-60 hover:opacity-100 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )
      })}
    </div>
  )
}
