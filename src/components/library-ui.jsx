import { memo, useEffect, useState } from 'react'
import { APP_VERSION } from '../app-config'
import { featuredCovers } from '../data/tracks'
import { Cover } from './Cover.jsx'
import { CHANGELOG } from '../data/changelog.js'
import { formatTime } from '../lib/format.js'
import { agruparPorPasta, faixasDaPasta } from '../lib/importFolders.js'

export const QuickTrackGrid = memo(function QuickTrackGrid({ title = '', tracks, onPlay }) {
  if (!tracks || tracks.length === 0) return null
  return (
    <div className="quick-section">
      {title ? <h2 className="section-title">{title}</h2> : null}
      <div className="quick-grid">
        {tracks.map((t) => (
          <button className="quick-card" key={t.id} onClick={() => onPlay(t.id)} tabIndex={0}>
            <span className="quick-cover">
              <Cover colors={t.cover} image={t.coverUrl} size={48} radius={12} />
            </span>
            <span className="quick-meta">
              <span className="quick-title">{t.title}</span>
              <span className="quick-artist">{t.artist || '—'}</span>
            </span>
            <span className="quick-play">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

export function Sidebar({ view, setView, onPickFiles }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Cover colors={featuredCovers[0]} size={36} radius={10} />
        <span className="brand-name">Nebula<span>Tune</span></span>
      </div>

      <nav className="nav">
        <button className={`nav-item ${view === 'inicio' ? 'active' : ''}`} onClick={() => setView('inicio')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" />
          </svg>
          Início
        </button>
        <button className={`nav-item ${view === 'perfil' ? 'active' : ''}`} onClick={() => setView('perfil')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Perfil
        </button>
        <button className={`nav-item ${view === 'biblioteca' ? 'active' : ''}`} onClick={() => setView('biblioteca')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Sua Biblioteca
        </button>
        <button className={`nav-item ${view === 'favoritas' ? 'active' : ''}`} onClick={() => setView('favoritas')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Favoritas
        </button>
        <button className={`nav-item ${view === 'online' ? 'active' : ''}`} onClick={() => setView('online')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
          </svg>
          Online
        </button>
        <button className={`nav-item ${view === 'equalizador' ? 'active' : ''}`} onClick={() => setView('equalizador')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
            <path d="M1 14h6M9 8h6M17 16h6" />
          </svg>
          Equalizador
        </button>
        <button className={`nav-item ${view === 'configuracoes' ? 'active' : ''}`} onClick={() => setView('configuracoes')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Configurações
        </button>
      </nav>

      <button className="add-files" onClick={onPickFiles}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Adicionar músicas
      </button>

      <div className="playlists">
        <p className="section-label">DICA</p>
        <p className="sidebar-hint">
          Arraste arquivos de música para qualquer lugar da tela ou use o botão acima.
        </p>
      </div>

      <div className="sidebar-footer">
        <span>♫ Sua música, no cosmos</span>
        <span className="sidebar-version">NebulaTune v{APP_VERSION}</span>
        <a className="sidebar-download" href="./apk/nebulatune.apk" download="NebulaTune.apk">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Baixar o aplicativo
        </a>
      </div>
    </aside>
  )
}

export function NameModal({ title, initial = '', placeholder, onSave, onClose }) {
  const [v, setV] = useState(initial)

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

  const submit = (e) => {
    e.preventDefault()
    const n = v.trim()
    if (!n) return
    onSave(n)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <form onSubmit={submit}>
          <label className="modal-field">
            <span>{placeholder || 'Nome'}</span>
            <input value={v} onChange={(e) => setV(e.target.value)} maxLength={60} autoFocus />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={!v.trim()}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ChangelogModal({ onClose }) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal changelog-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Novidades e correções</h3>
        <div className="changelog-list">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-head">
                <span className="changelog-version">Versão {entry.version}</span>
                <span className="changelog-date">{entry.date}</span>
              </div>
              <ul className="changelog-items">
                {entry.items.map((item, i) => (
                  <li key={i} className={`changelog-item ${item.type}`}>
                    <span className="changelog-tag">
                      {item.type === 'correcao' ? 'Correção' : 'Novo'}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlaylistPicker({ playlists, track, onCreate, onAdd, onClose }) {
  const [name, setName] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !track) return
    const id = onCreate(n)
    if (id) onAdd(id, track.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Adicionar à playlist</h3>
        {track && (
          <p className="modal-text">
            {track.title} — {track.artist}
          </p>
        )}
        <form onSubmit={submit} className="playlist-new-form">
          <label className="modal-field">
            <span>Nova playlist</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da nova playlist" maxLength={60} autoFocus />
          </label>
          <button className="btn-primary" type="submit" disabled={!name.trim()}>
            Criar e adicionar
          </button>
        </form>
        <div className="playlist-picker-list">
          {playlists.length === 0 && (
            <p className="modal-text">Você ainda não tem playlists.</p>
          )}
          {playlists.map((p) => (
            <button key={p.id} className="playlist-picker-row" onClick={() => { onAdd(p.id, track.id); onClose() }}>
              <span className="playlist-picker-name">{p.name}</span>
              <span className="playlist-picker-count">{p.trackIds.length} músicas</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export function TrackPicker({ tracks, playlist, onAdd, onAddMany, onClose }) {
  const options = (tracks || []).filter(
    (t) => !playlist?.trackIds?.includes(t.id),
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Adicionar música a {playlist?.name || 'playlist'}</h3>
        {options.length > 0 && (
          <button className="btn-ghost" onClick={() => onAddMany?.(playlist.id, options.map((t) => t.id))}>
            Adicionar todas ({options.length})
          </button>
        )}
        <div className="playlist-picker-list track-picker-list">
          {options.length === 0 && (
            <p className="modal-text">Todas as músicas já estão nesta playlist.</p>
          )}
          {options.map((t) => (
            <button key={t.id} className="playlist-picker-row" onClick={() => onAdd(playlist.id, t.id)}>
              <Cover colors={t.cover} image={t.coverUrl} size={36} radius={7} />
              <span className="playlist-picker-name">{t.title}</span>
              <span className="playlist-picker-count">{t.artist}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeviceImport({ tracks, selection, onToggle, onSelectAll, importing, onImport, onClose }) {
  const todas = tracks || []
  // `pasta` = null significa "escolhendo a pasta". Um caminho significa "dentro
  // desta pasta". Nenhum estado -> mostra as musicas direto (APK antigo, que
  // ainda nao devolve a pasta, e a web).
  const [pasta, setPasta] = useState(null)
  const { pastas, temPasta } = agruparPorPasta(todas)
  const escolhendoPasta = temPasta && pasta === null
  // pasta === null -> tela de escolha. '' -> "Todas as músicas". O resto -> a
  // pasta escolhida. Sem os tres casos separados, "Todas" viraria lista vazia.
  const list = pasta === null || pasta === '' ? todas : faixasDaPasta(todas, pasta)
  const pastaAtual = pastas.find((p) => p.caminho === pasta)
  // Quantas das músicas DESTA pasta estão marcadas. A contagem vem da lista
  // que está na tela, não do total do aparelho: quem escolhe uma pasta para
  // pegar as músicas dela não quer a resposta contando o resto do celular.
  const marcadasDaLista = list.filter((t) => selection?.[t.id]).length
  const todasMarcadas = list.length > 0 && marcadasDaLista === list.length
  // O total geral, para o botão de importar. Aqui continua valendo o aparelho
  // inteiro de propósito: quem marcou músicas em duas pastas espera levar as
  // duas, e é este número que diz quantas vão entrar.
  const totalSelecionadas = Object.values(selection || {}).filter(Boolean).length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal device-import-modal" onClick={(e) => e.stopPropagation()}>
        {escolhendoPasta ? (
          <>
            <h3 className="modal-title">Escolher pasta</h3>
            <p className="modal-text">
              {todas.length} {todas.length === 1 ? 'música' : 'músicas'} em {pastas.length}{' '}
              {pastas.length === 1 ? 'pasta' : 'pastas'}. Entre numa pasta para ver só o que está nela.
            </p>
            <div className="playlist-picker-list device-import-list">
              <button className="playlist-picker-row device-import-folder" onClick={() => setPasta('')}>
                <span className="playlist-picker-name">Todas as músicas</span>
                <span className="playlist-picker-count">{todas.length}</span>
              </button>
              {pastas.map((p) => (
                <button
                  key={p.caminho}
                  className="playlist-picker-row device-import-folder"
                  onClick={() => setPasta(p.caminho)}
                >
                  <span className="playlist-picker-name">
                    <span className="device-import-folder-ico" aria-hidden="true">📁</span>
                    {p.nome}
                  </span>
                  <span className="playlist-picker-count">{p.total}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" disabled={importing} onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="modal-title">
              {temPasta ? (
                <button
                  type="button"
                  className="device-import-back"
                  onClick={() => setPasta(null)}
                  disabled={importing}
                >
                  ← {pastaAtual ? pastaAtual.nome : 'Todas as músicas'}
                </button>
              ) : (
                'Músicas do aparelho'
              )}
            </h3>
            <p className="modal-text">
              {list.length} {list.length === 1 ? 'música encontrada' : 'músicas encontradas'}. Selecione
              as que deseja importar.
            </p>
            <div className="device-import-controls">
              <label className="device-import-all">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={(e) => onSelectAll(e.target.checked, list)}
                />
                Selecionar todas desta pasta ({list.length})
              </label>
              <span className="device-import-count">{totalSelecionadas} selecionadas</span>
            </div>
            <div className="playlist-picker-list device-import-list">
              {list.length === 0 && <p className="modal-text">Nenhuma música encontrada aqui.</p>}
              {list.map((t) => (
                <button key={t.id} className="playlist-picker-row" onClick={() => onToggle(t.id)}>
                  <input
                    type="checkbox"
                    checked={!!selection[t.id]}
                    onChange={() => onToggle(t.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="playlist-picker-name">{t.title}</span>
                  <span className="playlist-picker-count">
                    {t.artist}
                    {t.duration ? ` · ${formatTime(t.duration)}` : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" disabled={importing} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                disabled={importing || totalSelecionadas === 0}
                onClick={onImport}
              >
                {importing
                  ? 'Importando…'
                  : `Importar${totalSelecionadas ? ` ${totalSelecionadas}` : ''} música${totalSelecionadas !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
