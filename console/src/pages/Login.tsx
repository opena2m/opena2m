import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn, Key, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import { useT } from '@/i18n'

// ── Auth helpers ──────────────────────────────────────────────────────────────

const TOKEN_STORAGE_KEY = 'opena2m_token'
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? ''

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  return !!loadToken()
}

// ── Component ─────────────────────────────────────────────────────────────────

type LoginMode = 'token' | 'oidc'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const t = useT()
  const theme = useSettingsStore(s => s.theme)

  const [mode, setMode]         = useState<LoginMode>('token')
  const [tokenInput, setToken]  = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Handle OIDC callback: ?code=... or ?token=... from gateway redirect
  useEffect(() => {
    const code  = searchParams.get('code')
    const token = searchParams.get('token')

    if (token) {
      // Gateway exchanged code → token and redirected with ?token=...
      saveToken(token)
      navigate('/dashboard', { replace: true })
      return
    }

    if (code) {
      // Exchange code for token via gateway callback endpoint
      setLoading(true)
      const params = new URLSearchParams({ code })
      const state = searchParams.get('state')
      if (state) params.set('state', state)

      fetch(`${GATEWAY_URL}/v1/auth/callback?${params}`)
        .then(r => {
          if (!r.ok) throw new Error(`Auth callback failed: ${r.status}`)
          return r.json()
        })
        .then((data: { access_token?: string; token?: string }) => {
          const tok = data.access_token ?? data.token
          if (!tok) throw new Error('No token in callback response')
          saveToken(tok)
          navigate('/dashboard', { replace: true })
        })
        .catch((err: Error) => {
          setError(err.message)
          setLoading(false)
        })
    }
  }, [searchParams, navigate])

  // If already authenticated, skip straight to dashboard
  useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard', { replace: true })
  }, [navigate])

  // ── Token form submit ────────────────────────────────────────────────────

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tok = tokenInput.trim()
    if (!tok) { setError('Token is required.'); return }
    setError(null)
    setLoading(true)

    try {
      // Verify token by hitting /healthz with the supplied bearer
      const r = await fetch(`${GATEWAY_URL}/healthz`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!r.ok && r.status === 401) {
        throw new Error('Invalid token — gateway rejected it.')
      }
      // Any other status (including 200, 503) we accept — the token itself is valid
      saveToken(tok)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof Error) setError(err.message)
      else setError('Login failed — check gateway URL and token.')
    } finally {
      setLoading(false)
    }
  }

  // ── OIDC redirect ────────────────────────────────────────────────────────

  function handleOIDCLogin() {
    const redirect = `${window.location.origin}/login`
    const loginUrl = `${GATEWAY_URL}/v1/auth/login?redirect_uri=${encodeURIComponent(redirect)}`
    window.location.href = loginUrl
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && !error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--c-bg)', color: 'var(--c-text)',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Loader2 style={{ width: 32, height: 32, color: 'var(--c-accent)', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--c-dim)', fontSize: 13 }}>Authenticating…</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--c-bg)', color: 'var(--c-text)',
      fontFamily: 'var(--font-mono)', padding: '24px',
    }}>
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
        <div style={{
          width: 36, height: 36, background: 'var(--c-accent)', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)',
        }}>A2M</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--c-text)' }}>
          Open<span style={{ color: 'var(--c-accent)' }}>A2M</span>
        </span>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 12, padding: '32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: 'var(--c-text)' }}>
          Sign in to the console
        </h1>
        <p style={{ fontSize: 12, color: 'var(--c-dim)', margin: '0 0 24px' }}>
          AIMP Operator Console · v0.2.0
        </p>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--c-border)',
          marginBottom: 24, gap: 0,
        }}>
          {(['token', 'oidc'] as LoginMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                color: mode === m ? 'var(--c-accent)' : 'var(--c-dim)',
                borderBottom: mode === m ? '2px solid var(--c-accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {m === 'token' ? '🔑 API Token' : '🔒 SSO / OIDC'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
            background: 'var(--c-red-glow, rgba(239,68,68,0.1))',
            border: '1px solid var(--c-red, #ef4444)', borderRadius: 6,
            marginBottom: 20, fontSize: 12, color: 'var(--c-red, #ef4444)',
          }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Token mode */}
        {mode === 'token' && (
          <form onSubmit={handleTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Bearer Token
              </label>
              <div style={{ position: 'relative' }}>
                <Key style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  width: 13, height: 13, color: 'var(--c-dim)',
                }} />
                <input
                  type="password"
                  value={tokenInput}
                  onChange={e => setToken(e.target.value)}
                  placeholder="dev-token"
                  autoFocus
                  autoComplete="current-password"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px 9px 30px',
                    background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                    borderRadius: 6, color: 'var(--c-text)', fontSize: 13,
                    fontFamily: 'var(--font-mono)', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
                />
              </div>
              <p style={{ fontSize: 11, color: 'var(--c-dim)', marginTop: 5 }}>
                Dev default: <code style={{ color: 'var(--c-accent)' }}>dev-token</code>
                {' '}(set in gateway env <code>AIMP_DEV_TOKEN</code>)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'var(--c-accent)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)',
                opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              {loading
                ? <><Loader2 style={{ width: 14, height: 14 }} /> Signing in…</>
                : <><LogIn style={{ width: 14, height: 14 }} /> Sign in</>
              }
            </button>
          </form>
        )}

        {/* OIDC mode */}
        {mode === 'oidc' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--c-dim)', lineHeight: 1.6, margin: 0 }}>
              Sign in via your organisation's identity provider.
              The gateway must be configured with an OIDC issuer in{' '}
              <code style={{ color: 'var(--c-accent)', fontSize: 11 }}>AIMP_OIDC_ISSUER</code>.
            </p>

            <button
              onClick={handleOIDCLogin}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'var(--c-accent)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >
              <ExternalLink style={{ width: 14, height: 14 }} />
              Continue with SSO →
            </button>

            <div style={{
              fontSize: 11, color: 'var(--c-dim)', padding: '10px 12px',
              background: 'var(--c-bg)', border: '1px solid var(--c-border)',
              borderRadius: 6, lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--c-text)' }}>Gateway not configured?</strong><br />
              Use the <button
                onClick={() => setMode('token')}
                style={{ color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, textDecoration: 'underline' }}
              >API Token</button> tab to sign in with a bearer token instead.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--c-dim)', textAlign: 'center', lineHeight: 1.8 }}>
        <a
          href="https://github.com/opena2m/opena2m"
          target="_blank" rel="noreferrer"
          style={{ color: 'var(--c-dim)', textDecoration: 'none' }}
        >
          OpenA2M — Apache-2.0
        </a>
        {' · '}
        <a
          href="/landing"
          style={{ color: 'var(--c-dim)', textDecoration: 'none' }}
        >
          About AIMP
        </a>
      </div>
    </div>
  )
}
