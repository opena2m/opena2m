import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface Props { schema: Record<string, unknown>; depth?: number }

export default function SchemaDocViewer({ schema, depth = 0 }: Props) {
  return <div className={clsx('font-mono text-xs', depth > 0 && 'ml-4 border-l border-[var(--c-border)] pl-3 mt-1')}>
    {Object.entries((schema as any).properties ?? {}).map(([key, val]: [string, any]) => (
      <SchemaProperty key={key} name={key} prop={val} required={(schema as any).required?.includes(key)} depth={depth} />
    ))}
  </div>
}

function SchemaProperty({ name, prop, required, depth }: { name:string; prop:any; required?:boolean; depth:number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = prop.type === 'object' && prop.properties
  const typeColor: Record<string,string> = { string:'text-blue-400', integer:'text-emerald-400', number:'text-emerald-400', boolean:'text-amber-400', array:'text-violet-400', object:'text-orange-400' }

  return (
    <div className="py-0.5">
      <div className="flex items-start gap-2 cursor-pointer hover:bg-[var(--c-surface)] rounded px-1 py-0.5 -mx-1" onClick={()=>hasChildren&&setOpen(v=>!v)}>
        <span className="w-3 flex-shrink-0 mt-0.5 text-[var(--c-dim)]">
          {hasChildren ? (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : null}
        </span>
        <span className="text-[var(--c-text)] font-semibold">{name}</span>
        {required && <span className="text-[var(--c-red)] text-[9px] mt-0.5">*</span>}
        <span className={clsx('text-[10px]', typeColor[prop.type] ?? 'text-slate-400')}>{prop.type}</span>
        {prop.enum && <span className="text-[9px] text-[var(--c-dim)]">({prop.enum.join(' | ')})</span>}
        {prop.format && <span className="text-[9px] text-[var(--c-dim)]">format:{prop.format}</span>}
        {prop.minimum !== undefined && <span className="text-[9px] text-[var(--c-dim)]">min:{prop.minimum}</span>}
        {prop.maximum !== undefined && <span className="text-[9px] text-[var(--c-dim)]">max:{prop.maximum}</span>}
        {prop.default !== undefined && <span className="text-[9px] text-[var(--c-dim)]">default:{JSON.stringify(prop.default)}</span>}
      </div>
      {prop.description && <p className="text-[10px] text-[var(--c-dim)] ml-5 -mt-0.5">{prop.description}</p>}
      {hasChildren && open && <SchemaDocViewer schema={prop} depth={depth + 1} />}
    </div>
  )
}
