import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cover } from './Cover.jsx'
import { formatTime } from '../lib/format.js'

// A biblioteca inteira era desenhada de uma vez: 1.000 musicas viravam 23.000
// nos de DOM, e o React leva segundos para montar isso (e mais uns segundos
// para redesenhar quando a musica que toca muda). Num celular fraco e o
// suficiente para a tela parecer travada — e piora a cada musica que o
// usuario adiciona. Aqui a lista e desenhada em pedacos: comeca com o
// suficiente para preencher qualquer tela e vai acrescentando conforme o
// usuario rola para baixo. O `content-visibility: auto` no CSS cuida do
// desenho; aqui o cuidado e com o React nao criar o DOM inteiro.
const POR_PAGINA = 40
const MARGEM_PX = 700

function acharRolagem(el) {
  // Sem `getComputedStyle` nao da para saber quem rola: devolve null e a lista
  // fica no comportamento antigo (tudo desenhado), que e melhor do que nada.
  if (typeof getComputedStyle !== 'function') return null
  let alvo = el?.parentElement
  while (alvo) {
    const estilo = getComputedStyle(alvo)
    if (/(auto|scroll)/.test(estilo.overflowY) && alvo.scrollHeight > alvo.clientHeight) return alvo
    alvo = alvo.parentElement
  }
  return null
}

export const TrackList = memo(function TrackList({
  tracks,
  currentId,
  onSelect,
  onRemove,
  onToggleFavorite,
  onQueueNext,
  onQueueAdd,
  onSearchOnline,
  onEdit,
  onShare,
  onShareCard,
  onOpenSource,
  onAddToPlaylist,
}) {
  const listaRef = useRef(null)
  const [janela, setJanela] = useState({ lista: tracks, mostradas: POR_PAGINA })

  // Outra lista (busca, filtro): volta para o comeco. Ajustar durante o render
  // em vez de dentro de um efeito evita um render inteiro a mais.
  if (janela.lista !== tracks) setJanela({ lista: tracks, mostradas: POR_PAGINA })
  const mostradas = janela.mostradas
  const mais = useCallback(
    () => setJanela((j) => (j.mostradas >= tracks.length ? j : { ...j, mostradas: j.mostradas + POR_PAGINA })),
    [tracks.length],
  )

  useEffect(() => {
    const lista = listaRef.current
    if (!lista) return undefined
    const rolagem = acharRolagem(lista)
    if (!rolagem) return undefined

    const talvezMais = () => {
      const { scrollTop, clientHeight, scrollHeight } = rolagem
      // Sem altura medivel nao da para saber onde esta o fim: nesse caso
      // mantem a lista como esta, que e o comportamento antigo.
      if (!clientHeight || !scrollHeight) return
      if (scrollTop + clientHeight < scrollHeight - MARGEM_PX) return
      mais()
    }

    rolagem.addEventListener('scroll', talvezMais, { passive: true })
    talvezMais()
    return () => rolagem.removeEventListener('scroll', talvezMais)
  }, [tracks.length, mais])

  const visiveis = tracks.length > mostradas ? tracks.slice(0, mostradas) : tracks
  const [openMenu, setOpenMenu] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!openMenu) return undefined
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setOpenMenu(null)
        setShareOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [openMenu])

  // Posiciona o menu DENTRO da tela: mede o próprio tamanho, escolhe abrir
  // pra cima ou pra baixo e nunca deixa a borda passar do limite.
  useLayoutEffect(() => {
    if (!openMenu || !menuPos) return
    const el = menuRef.current
    if (!el) return
    const vw = window.innerWidth || 0
    const vh = window.innerHeight || 0
    const mw = el.offsetWidth
    const mh = el.offsetHeight
    const anchorTop = menuPos.anchorTop
    const anchorBottom = menuPos.anchorBottom
    const left = Math.max(8, Math.min(menuPos.left, vw - mw - 8))
    const fitsDown = anchorBottom + 4 + mh <= vh - 8
    const fitsUp = anchorTop - 4 - mh >= 8
    const up = fitsDown ? false : (fitsUp ? true : anchorBottom + 4 + mh > vh - 8)
    const top = up ? Math.max(8, anchorTop - 4 - mh) : Math.min(vh - mh - 8, anchorBottom + 4)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.classList.remove('up')
  }, [openMenu, menuPos, shareOpen])

  const closeMenu = () => {
    setOpenMenu(null)
    setShareOpen(false)
  }
  const toggleMenu = (t, e) => {
    if (openMenu === t) {
      closeMenu()
      return
    }
    const r = e?.currentTarget?.getBoundingClientRect()
    if (r) {
      setMenuPos({
        anchorTop: r.top,
        anchorBottom: r.bottom,
        left: r.right - 4,
      })
    } else {
      setMenuPos(null)
    }
    setOpenMenu(t)
  }

  return (
    <div className="track-list" ref={listaRef}>
      {visiveis.map((t, i) => (
        <div
          key={t.id}
          className={`track-row ${t.id === currentId ? 'active' : ''}`}
          onDoubleClick={() => onSelect(t.id)}
        >
          <span className="track-num">
              {t.id === currentId ? (
                <span className="track-eq" aria-label="Tocando agora">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                i + 1
              )}
            </span>
          <Cover colors={t.cover} image={t.coverUrl} size={40} />
          <div className="track-main">
            <span className="track-title">{t.title}</span>
            <span className="track-artist">{t.artist}</span>
          </div>
          <span className="track-album">{t.album}</span>
          {t.audioMissing && (
            <span
              className="track-noaudio"
              title="Esta música está na biblioteca, mas o arquivo de som não foi encontrado neste aparelho"
            >
              sem áudio
            </span>
          )}
          <span className="track-duration">{t.duration ? formatTime(t.duration) : '--:--'}</span>
          {onToggleFavorite && (
            <button
              className={`row-fav ${t.fav ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(t.id)
              }}
              aria-label={t.fav ? 'Desfavoritar' : 'Favoritar'}
              aria-pressed={t.fav}
            >
              {t.fav ? (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
            </button>
          )}
          {onRemove && (
            <button
              className="row-remove"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(t.id)
              }}
              aria-label="Remover"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
          <button
            className={`row-more ${openMenu === t.id ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleMenu(t.id, e)
            }}
            aria-label="Mais opções"
            aria-expanded={openMenu === t.id}
            title="Mais opções"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            </svg>
          </button>
          <button
            className="row-play"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(t.id)
            }}
            aria-label="Tocar"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          {openMenu === t.id &&
            menuPos &&
            createPortal(
              <div
                className="row-menu"
                style={{ left: menuPos.left, top: (menuPos.anchorBottom || 0) + 4 }}
                ref={menuRef}
              >
              {!shareOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShareOpen(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                    <path d="m16 6-4-4-4 4" />
                    <path d="M12 2v13" />
                  </svg>
                  Compartilhar
                </button>
              )}
              {shareOpen && (
                <>
                  <button
                    className="row-menu-title row-menu-back"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShareOpen(false)
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5" />
                      <path d="m12 19-7-7 7-7" />
                    </svg>
                    Voltar
                  </button>
                  <button
                    className="row-menu-sub"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeMenu()
                      onShare?.(t)
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="row-menu-sub-text">
                      <span className="row-menu-label">Enviar a música</span>
                      <span className="row-menu-desc">arquivo com a capa junto</span>
                    </span>
                  </button>
                  <button
                    className="row-menu-sub"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeMenu()
                      onShareCard?.(t)
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 5h18v14H3z" />
                      <path d="M3 9h18M8 13h6" />
                    </svg>
                    <span className="row-menu-sub-text">
                      <span className="row-menu-label">Enviar cartão</span>
                      <span className="row-menu-desc">imagem com a capa e o nome</span>
                    </span>
                  </button>
                </>
              )}
              {!shareOpen && (
              <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onQueueNext?.(t.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 5v14l11-7z" />
                  <path d="M13 2v5" />
                </svg>
                Tocar a seguir
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onQueueAdd?.(t.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 6h13M8 12h13M8 18h13" />
                  <path d="M3 6h.01M3 12h.01M3 18h.01" />
                  <path d="M18 9v6M15 12h6" />
                </svg>
                Adicionar à fila
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onAddToPlaylist?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h7M13.5 6h7.5" />
                  <path d="M3 12h7M13.5 12h7.5" />
                  <path d="M3 18h7M10 18h4" />
                  <path d="M18 15v6M15 18h6" />
                </svg>
                Adicionar à playlist
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onSearchOnline?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Buscar no Online
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onEdit?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Editar informações
              </button>
              {onOpenSource && t.externalUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeMenu()
                    onOpenSource(t.externalUrl)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                  </svg>
                  Abrir página original
                </button>
              )}
              {onRemove && (
                <button
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeMenu()
                    onRemove(t.id)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Remover da biblioteca
                </button>
              )}
              </>
              )}
              </div>,
              document.body,
            )}
        </div>
      ))}
    </div>
  )
})

export function TrackEdit({ track, onSave, onClose }) {
  const [title, setTitle] = useState(track.title || '')
  const [artist, setArtist] = useState(track.artist || '')
  const [album, setAlbum] = useState(track.album || '')

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
    onSave({
      title: title.trim() || track.title || 'Desconhecida',
      artist: artist.trim() || track.artist || 'Desconhecido',
      album: album.trim() || track.album || '',
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Editar informações</h3>
        <form onSubmit={submit}>
          <label className="modal-field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="modal-field">
            <span>Artista</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} />
          </label>
          <label className="modal-field">
            <span>Álbum</span>
            <input value={album} onChange={(e) => setAlbum(e.target.value)} maxLength={120} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
