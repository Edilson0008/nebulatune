import { useEffect, useState } from 'react'
import {
  accountConfigured,
  getRecovery,
  getSession,
  onAccount,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../lib/account'
import { getSyncStatus, syncNow } from '../lib/sync'

function horaCurta(ts) {
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function AccountModal({ onClose }) {
  const session = getSession()
  const link = getRecovery()
  // Veio do e-mail de recuperação: já abre pedindo a nova senha.
  const [mode, setMode] = useState(link ? 'newpass' : 'signin')
  const [email, setEmail] = useState(link && !link.erro ? link.email || '' : '')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [doneMsg, setDoneMsg] = useState('')
  const [status, setStatus] = useState(() => getSyncStatus())
  const [syncing, setSyncing] = useState(false)

  // Reage sozinho quando a sessão muda (login, senha trocada pelo link).
  const [, tick] = useState(0)
  useEffect(() => onAccount(() => tick((n) => n + 1)), [])

  const runSync = async () => {
    if (syncing) return
    setSyncing(true)
    const res = await syncNow()
    setSyncing(false)
    setStatus(getSyncStatus())
    if (res.ok) {
      setDoneMsg('Sincronizado! Seus dados foram atualizados.')
    } else if (res.reason === 'not-logged') {
      setError('Sessão não encontrada. Saia e entre na conta de novo.')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setDoneMsg('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')
    setDoneMsg('')

    if (mode === 'newpass') {
      if (pass.length < 6) {
        setError('A senha precisa ter pelo menos 6 caracteres.')
        return
      }
      if (pass !== pass2) {
        setError('As senhas não conferem.')
        return
      }
      setLoading(true)
      const res = await updatePassword(pass)
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPass('')
      setPass2('')
      setDoneMsg('Senha trocada! Você já está conectado e tudo sincronizou.')
      return
    }

    if (mode === 'signin') {
      if (!email.trim() || !pass) {
        setError('Preencha email e senha.')
        return
      }
      setLoading(true)
      const res = await signIn(email, pass)
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDoneMsg('Login feito! Suas coisas serão sincronizadas.')
      return
    }

    if (mode === 'signup') {
      if (!email.trim() || !pass) {
        setError('Preencha email e senha.')
        return
      }
      if (pass.length < 6) {
        setError('A senha precisa ter pelo menos 6 caracteres.')
        return
      }
      if (pass !== pass2) {
        setError('As senhas não conferem.')
        return
      }
      setLoading(true)
      const res = await signUp(email, pass)
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.needsConfirm) {
        setDoneMsg(`Conta criada! Confirme pelo link que enviamos para ${res.email}.`)
      } else {
        setDoneMsg('Conta criada e login feito! Suas coisas serão sincronizadas.')
      }
      return
    }

    // recuperar
    if (!email.trim()) {
      setError('Digite seu email para receber o link.')
      return
    }
    setLoading(true)
    const res = await resetPassword(email)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDoneMsg('Enviamos um link para esse email. Abra para redefinir a senha.')
  }

  const isLogged = Boolean(session && session.user)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal account-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Minha conta</h3>

        {!accountConfigured() ? (
          <p className="account-note">
            A conta ainda não foi ativada nesta versão do app. Assim que o criador
            configurar, você poderá entrar e sincronizar suas coisas.
          </p>
        ) : isLogged ? (
          <div className="account-logged">
            <div className="account-email">
              <span className="account-avatar">✦</span>
              <span className="account-email-text">
                <strong>{session.user.email}</strong>
                <small>Conectado — tudo sincroniza sozinho.</small>
              </span>
            </div>
            {status && (
              <p className={status.ok ? 'account-done' : 'account-error'}>
                {status.message}
                {status.at ? ` (${horaCurta(status.at)})` : ''}
              </p>
            )}
            <p className="account-note">
              Não precisa apertar nada: ao entrar, o app já busca tudo e continua
              sozinho. O botão é só para forçar na hora.
            </p>
            <div className="account-sync-row">
              <button type="button" className="btn-primary" onClick={runSync} disabled={syncing}>
                {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
              </button>              <button
                type="button"
                className="btn-ghost account-logout"
                onClick={async () => {
                  await signOut()
                  onClose()
                }}
              >
                Sair da conta
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="account-form">
            {mode !== 'forgot' && (
              <label className="modal-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </label>
            )}
            {mode === 'newpass' ? (
              <>
                {link && link.erro ? (
                  <p className="account-error">{link.erro}</p>
                ) : (
                  <p className="account-note">
                    Escolha a nova senha da sua conta
                    {email ? ` (${email})` : ''}.
                  </p>
                )}
                <label className="modal-field">
                  <span>Nova senha</span>
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                </label>
                <label className="modal-field">
                  <span>Confirmar nova senha</span>
                  <input
                    type="password"
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : mode === 'forgot' ? (
              <label className="modal-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </label>
            ) : (
              <>
                <label className="modal-field">
                  <span>Senha</span>
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </label>
                {mode === 'signup' && (
                  <label className="modal-field">
                    <span>Confirmar senha</span>
                    <input
                      type="password"
                      value={pass2}
                      onChange={(e) => setPass2(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                )}
              </>
            )}

            {error && <p className="account-error">{error}</p>}
            {doneMsg && <p className="account-done">{doneMsg}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Fechar
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? 'Aguarde…'
                  : mode === 'signin'
                    ? 'Entrar'
                    : mode === 'signup'
                      ? 'Criar conta'
                      : mode === 'newpass'
                        ? 'Salvar nova senha'
                        : 'Enviar link'}
              </button>
            </div>

            {mode === 'signin' && (
              <div className="account-switch">
                <button type="button" className="account-link" onClick={() => switchMode('signup')}>
                  Ainda não tem conta? Criar uma
                </button>
                <button type="button" className="account-link" onClick={() => switchMode('forgot')}>
                  Esqueceu a senha?
                </button>
              </div>
            )}
            {mode === 'signup' && (
              <button type="button" className="account-link account-switch" onClick={() => switchMode('signin')}>
                Já tem conta? Entrar
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className="account-link account-switch" onClick={() => switchMode('signin')}>
                Lembrou a senha? Entrar
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}