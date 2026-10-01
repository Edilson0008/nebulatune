import { useEffect, useRef, useState } from 'react'
import { ACCENTS, resolveAccent } from '../settings'
import { Cover } from './Cover.jsx'
import { nf } from '../lib/format.js'
import { PERIOD_LABELS, getAchievements, playsInPeriod } from '../lib/stats.js'
import { reduzirAvatar } from '../lib/avatar.js'

export function Profile({ settings, api, library, onPlay, petStats }) {
  const avatarInputRef = useRef(null)
  const [statsPeriod, setStatsPeriod] = useState('week')
  const [salvandoFoto, setSalvandoFoto] = useState(false)
  // A foto que a pessoa acabou de escolher. Serve de rede de segurança: se uma
  // sincronização velha sobrescrever ela, reassentamos a escolhida (tentando
  // algumas vezes) em vez de deixar a foto voltar sozinha.
  const escolhidaRef = useRef(null)
  const tentativasRef = useRef(0)

  const displayName = settings.userName.trim() || 'Seu nome'

  const initials = settings.userName
    ? settings.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'NT'
    : 'NT'

  // A foto é reduzida antes de guardar: ela aparece pequena na tela, mas é a
  // mesma que vai para o servidor e para a lista de amigos. A original dentro
  // do localStorage só pesaria.
  const handleAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSalvandoFoto(true)
    try {
      const mini = await reduzirAvatar(file)
      if (mini) {
        escolhidaRef.current = mini
        tentativasRef.current = 0
        api.setAvatar(mini)
      }
    } finally {
      setSalvandoFoto(false)
    }
  }

  const removerFoto = () => {
    escolhidaRef.current = null
    api.setAvatar('')
  }

  useEffect(() => {
    const escolhida = escolhidaRef.current
    if (!escolhida || settings.avatar === escolhida) return
    if (tentativasRef.current >= 3) return
    tentativasRef.current += 1
    api.setAvatar(escolhida)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.avatar])

  const mostPlayed = library
    .filter((t) => playsInPeriod(t, statsPeriod) > 0)
    .sort((a, b) => playsInPeriod(b, statsPeriod) - playsInPeriod(a, statsPeriod))

  const totalPlaysPeriod = mostPlayed.reduce((acc, t) => acc + playsInPeriod(t, statsPeriod), 0)

  const [achOpen, setAchOpen] = useState(false)
  const achievements = getAchievements(library, petStats?.touches || 0)
  const achUnlocked = achievements.filter((a) => a.done).length

  return (
    <section className="view">
      <h1 className="greeting">Perfil</h1>

      <div className="settings-card profile-avatar-card">
        <div className="profile-photo-block">
          <div className="profile-avatar-wrap">
            {settings.avatar ? (
              <img className="profile-avatar" src={settings.avatar} alt="Foto de perfil" />
            ) : (
              <div className="profile-avatar profile-avatar-placeholder">{initials}</div>
            )}
          </div>
          <div className="profile-avatar-actions">
            <button className="btn-primary" disabled={salvandoFoto} onClick={() => avatarInputRef.current?.click()}>
              {salvandoFoto ? 'Salvando…' : settings.avatar ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {settings.avatar && (
              <button className="btn-ghost" onClick={removerFoto}>
                Remover foto
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleAvatar}
          />
        </div>
        <div className="profile-identity">
          <span className="profile-identity-name">{displayName}</span>
          <span className="profile-identity-sub">
            {settings.avatar ? 'Seu perfil no NebulaTune' : 'Adicione uma foto e um nome para completar seu perfil'}
          </span>
          <textarea
            className="profile-bio"
            value={settings.bio || ''}
            onChange={(e) => api.setBio(e.target.value)}
            placeholder="Escreva uma descrição sobre você…"
            maxLength={160}
            rows={2}
            aria-label="Descrição do perfil"
          />
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Nome</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Seu nome</span>
            <span className="settings-desc">Aparece no botão, na saudação e no perfil.</span>
          </div>
          <input
            className="settings-input"
            value={settings.userName}
            onChange={(e) => api.setUserName(e.target.value)}
            placeholder="Seu nome"
            maxLength={24}
          />
        </div>
      </div>

      {petStats && (
        <div className="settings-card">
          <h2 className="section-title">Seu gatinho 🐾</h2>
          <div className="pet-mood-line">
            {petStats.touches > 15 && petStats.hearts > 4
              ? 'Muito mimado — vive no carinho!'
              : petStats.sleeps > 10
                ? 'Dorminhoco profissional!'
                : petStats.scares > 3
                  ? 'Leva susto, mas continua sorrindo!'
                  : 'Feliz no seu cantinho. 🐱'}
          </div>
          {library.some((t) => t.fav) && (
            <div className="pet-fav-row">
              <span className="pet-fav-label">Favoritas dele:</span>
              <div className="pet-cover-row">
                {library
                  .filter((t) => t.fav)
                  .slice(0, 8)
                  .map((t) => (
                    <Cover key={t.id} colors={t.cover} image={t.coverUrl} size={34} radius={9} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="settings-card">
        <button className="ach-head" onClick={() => setAchOpen((v) => !v)} aria-expanded={achOpen}>
          <span className="ach-head-main">
            <span className="section-title">Conquistas</span>
            <span className="lib-sub">{achUnlocked} de {achievements.length} desbloqueadas</span>
          </span>
          <svg className={`ach-arrow ${achOpen ? 'open' : ''}`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {achOpen && (
          <div className="ach-grid">
            {achievements.map((a) => (
              <div className={`ach ${a.done ? 'on' : ''}`} key={a.id}>
                <span className="ach-icon">{a.icon}</span>
                <span className="ach-main">
                  <span className="ach-name">{a.name}</span>
                  <span className="ach-bar"><span className="ach-fill" style={{ width: `${a.pct}%` }} /></span>
                </span>
                <span className="ach-prog">{a.done ? '✓' : `${a.shown}/${a.need}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card">
        <h2 className="section-title">Cor de destaque</h2>
        <p className="lib-sub">Atual: {resolveAccent(settings).name}</p>
        <div className="settings-row">
          <div className="swatch-grid">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <button
                key={key}
                className={`swatch ${settings.accent === key ? 'active' : ''}`}
                style={{ '--sw': a.accent }}
                onClick={() => api.setAccent(key)}
                title={a.name}
                aria-label={a.name}
              />
            ))}
            <label
              className={`swatch swatch-custom ${settings.accent === 'custom' ? 'active' : ''}`}
              style={settings.accent === 'custom' && settings.customAccent ? { '--sw': settings.customAccent } : undefined}
              title="Escolher minha cor"
              aria-label="Escolher minha cor"
            >
              <span aria-hidden="true">🎨</span>
              <input
                type="color"
                className="sr-only"
                value={/^#[0-9a-f]{6}$/i.test(settings.customAccent || '') ? settings.customAccent : '#8b5cf6'}
                onChange={(e) => api.setCustomAccent(e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Estatísticas de reprodução</h2>
        <div className="settings-row">
          <div className="stats-tabs" role="tablist" aria-label="Período das estatísticas">
            {PERIOD_LABELS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={statsPeriod === key}
                className={`stats-tab ${statsPeriod === key ? 'active' : ''}`}
                onClick={() => setStatsPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="stats-summary">
          <span>
            <strong>{nf(totalPlaysPeriod)}</strong> reproduções {statsPeriod === 'all' ? 'no total' : `neste ${statsPeriod === 'week' ? 'período' : statsPeriod}`}
          </span>
        </div>
        <div className="settings-row">
          <h3 className="stats-list-title">
            Mais tocadas{statsPeriod === 'all' ? '' : ` na ${PERIOD_LABELS.find(([k]) => k === statsPeriod)?.[1]?.toLowerCase()}`}
          </h3>
          {mostPlayed.length ? (
            <div className="most-played">
              {mostPlayed.map((t, i) => {
                const n = playsInPeriod(t, statsPeriod)
                return (
                  <button key={t.id} className="most-played-row" onClick={() => onPlay?.(t.id)}>
                    <span className="most-played-num">{i + 1}</span>
                    <Cover colors={t.cover} image={t.coverUrl} size={38} />
                    <span className="most-played-main">
                      <span className="track-title">{t.title}</span>
                      <span className="track-artist">{t.artist}</span>
                    </span>
                    <span className="most-played-count">
                      {n} {n === 1 ? 'vez' : 'vezes'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="settings-desc">As músicas que você mais tocar vão aparecendo aqui.</p>
          )}
        </div>
      </div>
    </section>
  )
}
