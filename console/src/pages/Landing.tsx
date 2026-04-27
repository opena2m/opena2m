import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '@/store/settings'
import { useT } from '@/i18n'

export default function Landing() {
  const navigate = useNavigate()
  const t = useT()
  const isDark = useSettingsStore(s => s.theme) === 'dark'
  const enter = () => navigate('/dashboard')

  const VERBS = [
    { icon: '🔍', v: 'discover', desc: 'What is available, and what can it do? Returns a structured capability document for every registered device.' },
    { icon: '💬', v: 'quote',    desc: 'How much will this cost, how long will it take, and are you allowed to ask? Budget reservation at quote time.' },
    { icon: '▶',  v: 'execute',  desc: 'Do it. Kicks off the nine-state job machine with policy enforcement, approval tokens, and HITL checkpoints.' },
    { icon: '📡', v: 'telemetry',desc: 'What is happening right now? Signed sensor streams, media snapshots, and AI vision verdicts — live via SSE.' },
    { icon: '⏹', v: 'abort',    desc: 'Stop. Abort primacy: supersedes every other in-flight state transition. Returns device to safe state.' },
  ]
  const PERSONAS = [
    { icon: '🏭', title: 'Fab Operators',    desc: 'One console for device inventory, live supervision, HITL review, budgets, and audit. No custom integration per machine.' },
    { icon: '🔌', title: 'Machine Vendors',  desc: 'Write one AIMP adapter, get policy, audit, budgets, and HITL for free. ~300 LOC for a minimal adapter.' },
    { icon: '🤖', title: 'Agent Developers', desc: 'Five verbs through MCP. Same error vocabulary across every gateway. Predictable costs. Structured telemetry.' },
    { icon: '📋', title: 'Compliance & Legal',desc: 'Signed audit bundle with ed25519 hash-chain. Verifiable offline. Named human decisions with evidence.' },
  ]

  return (
    <div style={{ fontFamily: 'var(--font-mono)', background: 'var(--c-bg)', color: 'var(--c-text)', minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: 'var(--c-accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>A2M</div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--c-text)' }}>Open<span style={{ color: 'var(--c-accent)' }}>A2M</span></span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {[[t.landing.docs,'https://docs.aimp.dev'],['Spec','https://github.com/your-org/opena2m/blob/main/WHITEPAPER.md'],[t.landing.github,'https://github.com/your-org/opena2m']].map(([l,h])=><a key={l} href={h} style={{color:'var(--c-dim)',textDecoration:'none',fontSize:13}}>{l}</a>)}
            <span style={{ background: 'var(--c-accent-glow)', color: 'var(--c-accent)', padding: '2px 8px', borderRadius: 4, fontSize: 10, border: '1px solid var(--c-accent)', fontWeight: 600 }}>AIMP 1.0.0-draft</span>
          </div>
          <button onClick={enter} style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Open Console →</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 20, padding: '4px 14px', marginBottom: 24, fontSize: 11 }}>
            <span style={{ color: 'var(--c-green)' }}>⚡</span>
            <span style={{ color: 'var(--c-dim)' }}>Reference Implementation · Apache-2.0</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 20px', color: 'var(--c-text)' }}>
            The open gateway between<br />
            <span style={{ color: 'var(--c-accent)' }}>AI agents</span> and<br />
            physical machines.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--c-dim)', lineHeight: 1.7, margin: '0 0 36px', maxWidth: 560 }}>
            OpenA2M is the reference implementation of the AI-to-Machine Protocol (AIMP) —
            a gateway, operator console, adapter SDK, and two end-to-end scenarios that turn
            agent cognition into real physical work with full audit, budget, and human oversight.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={enter} style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              Try the Console Demo →
            </button>
            <a href="https://github.com/your-org/opena2m/blob/main/WHITEPAPER.md" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
              Read the Whitepaper
            </a>
            <a href="https://github.com/your-org/opena2m" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: 'var(--c-dim)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Verbs */}
      <Section title={t.landing.verbsTitle} sub={t.landing.verbsSub}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {VERBS.map(v => (
            <div key={v.v} style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{v.icon}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--c-accent)', marginBottom: 6 }}>{v.v}</div>
              <div style={{ fontSize: 12, color: 'var(--c-dim)', lineHeight: 1.65 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Architecture */}
      <Section title={t.landing.archTitle} sub={t.landing.archSub} tinted>
        <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '24px 28px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9, maxWidth: 600 }}>
          {[
            [null, '         AI Agent (MCP client)', 'var(--c-amber)'],
            [null, '               │', null],
            [null, '               ▼ MCP', null],
            [null, '       ┌──────────────┐', null],
            [null, '       │  MCP Bridge  │', 'var(--c-accent)'],
            [null, '       └──────┬───────┘', null],
            [null, '              │ AIMP REST', null],
            [null, '              ▼', null],
            [null, 'Console ──▶ Gateway ──▶ Adapters ──▶ Machines', null],
            [null, '              │              │', null],
            [null, '              ▼              ▼', null],
            [null, '       Audit Log      Telemetry Stream', null],
          ].map(([, text, color], i) => (
            <div key={i} style={{ color: color ?? 'var(--c-dim)', whiteSpace: 'pre' }}>{text}</div>
          ))}
        </div>
      </Section>

      {/* Scenarios */}
      <Section title={t.landing.scenariosTitle} sub={t.landing.scenariosSub}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
          {[
            { color: '#1d4ed8', border: '#1e3a8a', icon: '🖨', title: 'Poster to Doorstep', tier: 'routine tier', tags: ['routine tier', 'L3'], desc: 'Agent renders an A3 poster, calls quote, gets $18.20 back, calls execute. Gateway runs the 6-step policy chain, reserves budget, transitions LOCKED→EXECUTING→FULFILLING→COMPLETED. FedEx webhook arrives at FULFILLING. Operator watches without touching a thing.' },
            { color: '#b45309', border: '#78350f', icon: '⚙', title: 'Gear With a Human In The Loop', tags: ['restricted tier', 'HITL', 'L3'], desc: 'Design agent produces G-code. Policy classifies as restricted. Agent obtains approval token, calls execute with mid-build pause at 50%. Vision model runs spaghetti detection. At 50%, job enters AUDITING. Operator reviews camera image and sensors, presses Continue. Signed decision logged forever.' },
          ].map(s => (
            <div key={s.title} style={{ background: `${s.color}11`, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>{s.title}</div>
              <p style={{ fontSize: 12, color: 'var(--c-dim)', lineHeight: 1.7, marginBottom: 12 }}>{s.desc}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.tags.map(tag => <span key={tag} style={{ background: `${s.color}22`, color: isDark ? (s.color === '#1d4ed8' || s.color === '#2563eb' ? '#93c5fd' : '#fcd34d') : (s.color === '#2563eb' || s.color === '#1d4ed8' ? '#1e40af' : '#92400e'), border: `1px solid ${s.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>{tag}</span>)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Personas */}
      <Section title={t.landing.personasTitle} sub={t.landing.personasSub} tinted>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {PERSONAS.map(p => (
            <div key={p.title} style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{p.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--c-text)' }}>{p.title}</div>
              <div style={{ fontSize: 12, color: 'var(--c-dim)', lineHeight: 1.65 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Quick start */}
      <Section title={t.landing.quickstartTitle} sub={t.landing.quickstartSub} center>
        <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '20px 24px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2.1, maxWidth: 560, margin: '0 auto' }}>
          <div style={{ color: 'var(--c-dim)' }}># clone and start</div>
          <div><span style={{ color: 'var(--c-accent)' }}>git clone</span> <span style={{ color: 'var(--c-dim)' }}>https://github.com/your-org/opena2m.git</span></div>
          <div><span style={{ color: 'var(--c-accent)' }}>make dev-up</span>     <span style={{ color: 'var(--c-dim)' }}># postgres + redis + minio + gateway + console</span></div>
          <div><span style={{ color: 'var(--c-accent)' }}>make seed</span>       <span style={{ color: 'var(--c-dim)' }}># register cloudprint-sim-1 + fdm-sim-1</span></div>
          <div />
          <div style={{ color: 'var(--c-dim)' }}># then drive it</div>
          <div><span style={{ color: 'var(--c-accent)' }}>open</span> http://localhost:3000   <span style={{ color: 'var(--c-dim)' }}># ← Operator Console</span></div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button onClick={enter} style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            Try the Console Demo →
          </button>
        </div>
      </Section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--c-border)', padding: '24px', marginTop: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--c-dim)' }}>OpenA2M v0.1.0 · Apache-2.0 · Targeting AIMP 1.0.0-draft</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[[t.landing.docs,'https://docs.aimp.dev'],['Spec','https://github.com/your-org/opena2m/blob/main/WHITEPAPER.md'],[t.landing.github,'https://github.com/your-org/opena2m'],['Whitepaper','https://github.com/your-org/opena2m/blob/main/WHITEPAPER.md']].map(([l,h])=><a key={l} href={h} target="_blank" rel="noreferrer" style={{color:'var(--c-dim)',textDecoration:'none',fontSize:11}}>{l}</a>)}
          </div>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, sub, children, tinted, center }: { title:string; sub?:string; children:React.ReactNode; tinted?:boolean; center?:boolean }) {
  return (
    <div style={{ background: tinted ? 'var(--c-surface)' : 'transparent', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '64px 0', marginBottom: -1 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ textAlign: center ? 'center' : undefined, marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 700, margin: '0 0 8px', color: 'var(--c-text)' }}>{title}</h2>
          {sub && <p style={{ fontSize: 13, color: 'var(--c-dim)', maxWidth: center ? 480 : undefined, margin: center ? '0 auto' : undefined }}>{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
