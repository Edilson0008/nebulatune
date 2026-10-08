import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_VERSION, SITE_URL } from '../app-config'
import { blobToDataUrl, dataUrlToBlob, pickRestorableTracks } from '../backup'
import { APK_URL, fetchLatestVersion, installUpdate, isNewer } from '../updater'
import { fmtBytes } from '../lib/format.js'
import { VizModeRow } from './viz-mode-row.jsx'

export function NavIcon({ name }) {
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5v9.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19.7z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    online: <><circle cx="12" cy="12" r="9" /><path d="M8.2 8.9a5.8 5.8 0 0 0 0 6.2M15.8 8.9a5.8 5.8 0 0 1 0 6.2" /><circle cx="12" cy="12" r="1.7" /></>,
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    library: <path d="M9 18V5l12-2v13" />,
    eq: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.7 5.7l1.4 1.4M17 17l1.4 1.4M18.3 5.7 17 7M7 17l-1.4 1.4" /></>,
    friends: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  )
}

export function ApkDownloadButton() {
  const [size, setSize] = useState(null)
  useEffect(() => {
    fetch('./apk/nebulatune.apk', { method: 'HEAD' })
      .then((res) => {
        const len = res.headers.get('content-length')
        if (len) setSize(Number(len))
      })
      .catch(() => {})
  }, [])
  return (
    <a className="btn-primary" href="./apk/nebulatune.apk" download="NebulaTune.apk">
      Baixar APK{size ? ` · ${fmtBytes(size)}` : ''}
    </a>
  )
}

export function SettingsView({ settings, api, library, isIOS, isAppInstalled, installEvt, onInstall, isNative, onImport, onShareApp, onOpenChangelog, onClearCache, cacheCleanMsg, onFreeSpace, freeSpaceMsg, account, onOpenAccount }) {
  const [storage, setStorage] = useState(null)
  const [exported, setExported] = useState(false)
  const [imported, setImported] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [latestVersion, setLatestVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateError, setUpdateError] = useState(false)
  const importInputRef = useRef(null)

  const updateHost = SITE_URL ? (() => {
    try {
      return new URL(SITE_URL).host
    } catch {
      return ''
    }
  })() : ''
  const updateReachable = !!updateHost && !['localhost', '127.0.0.1', '0.0.0.0'].some((h) => updateHost.startsWith(h))

  const checkUpdate = async () => {
    if (checking || updating) return
    setChecking(true)
    setUpdateMsg('')
    setUpdateError(false)
    try {
      const latest = await fetchLatestVersion()
      setLatestVersion(latest)
      if (!isNewer(latest, APP_VERSION)) {
        setUpdateMsg(`Você já está na versão mais recente (${APP_VERSION}).`)
        return
      }
      setUpdateMsg(`Nova versão ${latest} encontrada. Baixando…`)
      setUpdating(true)
      try {
        await installUpdate()
        setUpdateMsg('Download pronto! Confirme a instalação quando o Android pedir.')
      } catch {
        setUpdateError(true)
        setUpdateMsg(`Não consegui baixar automaticamente. Baixe em: ${APK_URL}`)
      } finally {
        setUpdating(false)
      }
    } catch {
      setUpdateError(true)
      setUpdateMsg('Não foi possível verificar agora. Tente de novo.')
    } finally {
      setChecking(false)
    }
  }

  const refreshStorage = useCallback(() => {
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => setStorage(est))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    refreshStorage()
  }, [refreshStorage])

  const exportLibrary = async () => {
    if (!library.length || exporting) return
    setExporting(true)
    try {
      const items = []
      let semAudio = 0
      for (const t of library) {
        if (!t.audioBlob) {
          semAudio += 1
          continue
        }
        items.push({
          id: t.id,
          sid: t.sid || '',
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: Math.round(t.duration || 0),
          cover: t.cover,
          fav: t.fav === true,
          plays: t.plays || 0,
          playDays: t.playDays || {},
          addedAt: t.addedAt || Date.now(),
          audioData: await blobToDataUrl(t.audioBlob),
          coverData: await blobToDataUrl(t.coverBlob),
          coverRemote: t.coverRemote || null,
        })
      }
      if (!items.length) {
        window.alert('Não dá para exportar: nenhuma música tem o arquivo de som neste aparelho. Importe as músicas de novo e tente novamente.')
        return
      }
      const data = {
        app: 'NebulaTune',
        type: 'backup-musicas',
        exportedAt: new Date().toISOString(),
        count: items.length,
        tracks: items,
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nebulatune-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setExported(true)
      setTimeout(() => setExported(false), 3500)
      if (semAudio > 0) {
        window.alert(`${semAudio} ${semAudio === 1 ? 'música ficou' : 'músicas ficaram'} de fora (sem arquivo de som neste aparelho). Exportadas: ${items.length}.`)
      }
    } finally {
      setExporting(false)
    }
  }

  const importLibraryFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || importing) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        const tracks = pickRestorableTracks(data)
        if (!tracks) {
          window.alert('Este arquivo não parece ser um backup do NebulaTune (músicas com som).')
          return
        }
        const now = Date.now()
        const restored = tracks
          .map((t, i) => {
            const audioBlob = dataUrlToBlob(t.audioData)
            const coverBlob = dataUrlToBlob(t.coverData)
            return {
              id: typeof t.id === 'string' && t.id ? t.id : `restore-${now}-${i}`,
              sid: typeof t.sid === 'string' && t.sid ? t.sid : '',
              title: t.title || 'Sem título',
              artist: t.artist || 'Desconhecido',
              album: t.album || '',
              duration: t.duration || 0,
              cover: Array.isArray(t.cover) ? t.cover : null,
              fav: t.fav === true,
              plays: t.plays || 0,
              playDays: t.playDays || {},
              addedAt: t.addedAt || now + i,
              audioBlob,
              coverBlob,
              coverRemote: t.coverRemote || null,
              src: URL.createObjectURL(audioBlob),
              coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : t.coverRemote || null,
            }
          })
          .filter((t) => t.audioBlob)
        if (!restored.length) {
          window.alert('Este backup não tem músicas para restaurar (nenhuma faixa com arquivo de som).')
          return
        }
        onImport(restored, null)
        setImported(true)
        setTimeout(() => setImported(false), 3500)
        refreshStorage()
      } catch (err) {
        window.alert('Não foi possível importar o backup: ' + (err.message || err))
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      setImporting(false)
      window.alert('Erro ao ler o arquivo.')
    }
    reader.readAsText(file)
  }

  return (
    <section className="view">
      <h1 className="greeting">Configurações</h1>

      <div className="settings-card">
        <h2 className="section-title">Minha conta</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">
              {account && account.user ? `Conectado como ${account.user.email}` : 'Entrar para sincronizar'}
            </span>
            <span className="settings-desc">
              {account && account.user
                ? 'Suas favoritas, mais ouvidas, gatinho e moedas ficam iguais em todos os aparelhos. As músicas continuam em cada aparelho.'
                : 'No mesmo aparelho ou em outro, entre com sua conta para não perder nada entre os aparelhos.'}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onOpenAccount}>
              {account && account.user ? 'Conta' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Aparência</h2>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Modo leve</span>
            <span className="settings-desc">Desliga fundo animado e efeitos para rodar liso em celular simples.</span>
          </div>
          <button
            className={`eq-switch ${settings.lowPower ? 'on' : ''}`}
            role="switch"
            aria-checked={!!settings.lowPower}
            onClick={() => api.setLowPower(!settings.lowPower)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Som do gatinho</span>
            <span className="settings-desc">Miado do bichinho ao tocar ou quando algo bom acontece.</span>
          </div>
          <button
            className={`eq-switch ${settings.petSound !== false ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.petSound !== false}
            onClick={() => api.setPetSound(!(settings.petSound !== false))}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Fundo animado</span>
            <span className="settings-desc">Estrelas pulsantes no fundo do app.</span>
          </div>
          <button
            className={`eq-switch ${settings.bgAnimated ? 'on' : ''}`}
            aria-checked={settings.bgAnimated}
            onClick={() => api.setBgAnimated(!settings.bgAnimated)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Cosmos animado</span>
            <span className="settings-desc">Nebulas e galáxias coloridas no fundo.</span>
          </div>
          <button
            className={`eq-switch ${settings.cosmosAnimated ? 'on' : ''}`}
            aria-checked={settings.cosmosAnimated}
            onClick={() => api.setCosmosAnimated(!settings.cosmosAnimated)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Efeitos ao ritmo</span>
            <span className="settings-desc">Capa pulsa com os graves, anel e flash nas batidas, capa em 3D e ondas nos botões.</span>
          </div>
          <button
            className={`eq-switch ${settings.fxReactive !== false ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.fxReactive !== false}
            onClick={() => api.set('fxReactive', settings.fxReactive === false)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Cores vivas</span>
            <span className="settings-desc">As cores do tema mudam sozinhas, em ciclo.</span>
          </div>
          <button
            className={`eq-switch ${settings.rainbow ? 'on' : ''}`}
            role="switch"
            aria-checked={!!settings.rainbow}
            onClick={() => api.set('rainbow', !settings.rainbow)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <VizModeRow />
      </div>

      <div className="settings-card">
        <h2 className="section-title">Online</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Buscar capas na internet</span>
            <span className="settings-desc">
              Procura a capa no iTunes ao adicionar músicas.
            </span>
          </div>
          <button
            className={`eq-switch ${settings.fetchCovers ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.fetchCovers}
            onClick={() => api.setFetchCovers(!settings.fetchCovers)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Dados</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Armazenamento</span>
            <span className="settings-desc">
              {storage
                ? `${fmtBytes(storage.usage)} usados de ${fmtBytes(storage.quota)} disponíveis.`
                : 'Calculando…'}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={refreshStorage}>
              Atualizar
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Exportar backup</span>
            <span className="settings-desc">
              {library.length
                ? `Suas ${library.length} ${library.length === 1 ? 'música' : 'músicas'} num arquivo só, COM o som e a capa. É assim que elas viajam de aparelho (na nuvem elas nunca sobem). Configurações, gatinho e playlists não entram — esses vão pela sua conta.`
                : 'Nenhuma música para exportar ainda.'}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={exportLibrary} disabled={exporting}>
              {exporting ? 'Exportando…' : exported ? 'Exportado ✓' : 'Exportar backup'}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Importar backup</span>
            <span className="settings-desc">
              Adiciona as músicas do arquivo (COM o som e a capa) às que já existem. Configurações, gatinho e playlists não são tocados aqui — vêm pela sua conta.
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={() => importInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importando…' : imported ? 'Importado ✓' : 'Importar backup'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={importLibraryFile}
            />
          </div>
        </div>
      </div>
    <div className="settings-card">
        <h2 className="section-title">Aplicativo</h2>
        {isNative ? (
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Atualizar o app</span>
              <span className="settings-desc">
                Versão instalada: {APP_VERSION}.
                {latestVersion
                  ? ` Última disponível: ${latestVersion}.`
                  : ' Toque em Atualizar para verificar se há uma versão nova.'}
              </span>
              {updateMsg && (
                <span className={`settings-note${updateError ? ' settings-note-error' : ''}`}>
                  {updateMsg}
                </span>
              )}
            </div>
            {updateReachable && (
              <div className="settings-actions">
                <button className="btn-primary" onClick={checkUpdate} disabled={checking || updating}>
                  {checking ? 'Verificando…' : updating ? 'Baixando…' : 'Atualizar'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="settings-row">
              <div className="settings-info">
                <span className="settings-label">Instalar no dispositivo</span>
                <span className="settings-desc">
                  {isIOS
                    ? 'No Safari use Compartilhar e toque em "Adicionar à Tela de Início".'
                    : isAppInstalled
                      ? 'O NebulaTune já está instalado no seu dispositivo.'
                      : 'Instala como app de tela cheia, com ícone na tela inicial e uso offline.'}
                </span>
              </div>
              {!isIOS && !isAppInstalled && (
                <button className={`btn-primary ${installEvt ? '' : 'disabled'}`} onClick={onInstall} disabled={!installEvt}>
                  Instalar app
                </button>
              )}
            </div>
            {!isIOS && (
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Baixar APK para Android</span>
                  <span className="settings-desc">
                    Arquivo de instalação do app (Android 7.0+). Atualizações substituem a versão antiga.
                  </span>
                </div>
                <div className="settings-actions">
                  <ApkDownloadButton />
                </div>
              </div>
            )}
          </>
        )}
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Limpar cache</span>
            <span className="settings-desc">
              Apaga arquivos temporários e sobras de atualizações para liberar espaço.
              Suas músicas não são apagadas.
            </span>
            {cacheCleanMsg && <span className="settings-note">{cacheCleanMsg}</span>}
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onClearCache}>
              Limpar
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Liberar espaço das músicas</span>
            <span className="settings-desc">
              Apaga o que sobrou de músicas que você já removeu da biblioteca. Suas
              músicas atuais continuam salvas normalmente.
            </span>
            {freeSpaceMsg && <span className="settings-note">{freeSpaceMsg}</span>}
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onFreeSpace}>
              Liberar
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Novidades e correções</span>
            <span className="settings-desc">
              Veja o que há de novo e o que foi consertado em cada versão do app.
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onOpenChangelog}>
              Abrir
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Compartilhar o app</span>
            <span className="settings-desc">Envia o NebulaTune (arquivo APK) para outra pessoa instalar.</span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onShareApp}>
              Compartilhar
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Temporizadores nativos (sleep timer no APK)
   ───────────────────────────────────────────── */
