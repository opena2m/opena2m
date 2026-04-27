import { Link } from 'react-router-dom'
import { useT } from '@/i18n'

export default function NotFound() {
  const t = useT()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <p className="text-[80px] font-bold text-[var(--c-border)] leading-none" style={{fontFamily:'var(--font-display)'}}>404</p>
      <h1 className="text-xl font-bold text-[var(--c-text)]">{t.notFound.title}</h1>
      <p className="text-[var(--c-dim)] text-sm">{t.notFound.desc}</p>
      <Link to="/dashboard" className="btn btn-primary mt-2">{t.notFound.back}</Link>
    </div>
  )
}
