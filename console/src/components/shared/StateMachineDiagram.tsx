import { clsx } from 'clsx'
import type { JobState } from '@/lib/api'

const STATES: { id: JobState; x: number; y: number; terminal?: boolean }[] = [
  { id: 'PENDING',    x: 60,  y: 40  },
  { id: 'QUOTED',     x: 200, y: 40  },
  { id: 'LOCKED',     x: 340, y: 40  },
  { id: 'EXECUTING',  x: 340, y: 130 },
  { id: 'AUDITING',   x: 200, y: 130 },
  { id: 'FULFILLING', x: 340, y: 220 },
  { id: 'COMPLETED',  x: 200, y: 220, terminal: true },
  { id: 'ABORTED',    x: 60,  y: 220, terminal: true },
  { id: 'FAILED',     x: 60,  y: 130, terminal: true },
]

const EDGES = [
  ['PENDING','QUOTED'],['QUOTED','LOCKED'],['LOCKED','EXECUTING'],
  ['EXECUTING','AUDITING'],['AUDITING','EXECUTING'],
  ['EXECUTING','FULFILLING'],['FULFILLING','COMPLETED'],
  ['EXECUTING','COMPLETED'],
  ['PENDING','ABORTED'],['QUOTED','ABORTED'],['LOCKED','ABORTED'],
  ['EXECUTING','ABORTED'],['AUDITING','ABORTED'],['FULFILLING','ABORTED'],
  ['EXECUTING','FAILED'],['LOCKED','FAILED'],
]

const STATE_COLOR: Record<string, string> = {
  PENDING:'#64748b', QUOTED:'#3b82f6', LOCKED:'#6366f1',
  EXECUTING:'#10b981', AUDITING:'#f59e0b', FULFILLING:'#14b8a6',
  COMPLETED:'#34d399', ABORTED:'#f43f5e', FAILED:'#ef4444',
}

export default function StateMachineDiagram({ currentState, compact = false }: { currentState?: string; compact?: boolean }) {
  const W = 460, H = compact ? 200 : 270
  const scale = compact ? 0.7 : 1
  const sx = (x: number) => (x + 30) * scale
  const sy = (y: number) => (y + 10) * scale
  const RX = compact ? 28 : 40, RY = 14

  return (
    <svg viewBox={`0 0 ${W * scale} ${H * scale}`} className="w-full" style={{ maxHeight: compact ? 140 : 200 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L0,6 L6,3z" fill="#374357" />
        </marker>
        <marker id="arrow-act" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L0,6 L6,3z" fill="#4f8ef7" />
        </marker>
      </defs>
      {/* Edges */}
      {EDGES.map(([from, to]) => {
        const f = STATES.find(s => s.id === from)!
        const t = STATES.find(s => s.id === to)!
        const isCurrent = from === currentState || to === currentState
        const x1 = sx(f.x), y1 = sy(f.y), x2 = sx(t.x), y2 = sy(t.y)
        return <line key={`${from}-${to}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isCurrent ? '#4f8ef7' : '#1f2a3d'} strokeWidth={isCurrent ? 1.5 : 1}
          markerEnd={`url(#${isCurrent ? 'arrow-act' : 'arrow'})`} />
      })}
      {/* Nodes */}
      {STATES.map(s => {
        const isCurrent = s.id === currentState
        const color = STATE_COLOR[s.id] ?? '#64748b'
        const cx = sx(s.x), cy = sy(s.y)
        return (
          <g key={s.id}>
            <ellipse cx={cx} cy={cy} rx={RX} ry={RY}
              fill={isCurrent ? color + '22' : '#111827'}
              stroke={isCurrent ? color : s.terminal ? '#374357' : '#1f2a3d'}
              strokeWidth={isCurrent ? 2 : 1}
              strokeDasharray={s.terminal ? '3,2' : undefined}
            />
            {isCurrent && <ellipse cx={cx} cy={cy} rx={RX+4} ry={RY+3} fill="none" stroke={color} strokeWidth={0.5} opacity={0.4} />}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
              fill={isCurrent ? color : '#647193'}
              fontSize={compact ? 7 : 8} fontFamily="var(--font-mono)" fontWeight={isCurrent ? 600 : 400}>
              {s.id}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
