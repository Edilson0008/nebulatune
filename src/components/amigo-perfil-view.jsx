// Perfil de um amigo: a mesma cara da aba Perfil (foto, nome, bio,
// estatísticas), mas somente leitura, com o gerenciamento da amizade no fim.
// As estatísticas chegam prontas do banco (amigos_perfil): se não são amigos,
// `perfil.estatisticas` é null e a tela mostra só o que é público.
import { useState } from 'react'
import { Cover } from './Cover.jsx'
import { nf } from '../lib/format.js'
import { conquistasDoResumo } from '../lib/stats.js'
import { estaOnline, quandoViu } from '../lib/amigos.js'

const iniciais = (nome) =>
  (nome || '').trim()
    ? String(nome).trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'NT'
    : 'NT'

function AmigoAvatar({ perfil, size = 44 }) {
  // A lista de amigos traz a coluna como `avatar`; a função do banco devolve
  // como `foto`. As duas formas precisam aparecer (era por isso que a foto
  // sumia na lista e só aparecia abrindo o perfil).
  const foto = perfil?.foto || perfil?.avatar || ''
  if (foto) {
    return <img className="amigos-avatar amigos-avatar-foto" style={{ width: size, height: size }} src={foto} alt="" />
  }
  return (
    <span
      className="amigos-avatar"
      style={{ width: size, height: size, '--amig': perfil?.cor || perfil?.accent || '#8ab4ff' }}
    >
      {iniciais(perfil?.nome || perfil?.name || '')}
    </span>
  )
}

function Numero({ valor, rotulo, icone }) {
  return (
    <div className="amigo-num">
      <span className="amigo-num-valor">
        {icone && <span className="amigo-num-icone" aria-hidden="true">{icone}</span>}
        {nf(valor)}
      </span>
      <span className="amigo-num-rotulo">{rotulo}</span>
    </div>
  )
}

export function AmigoPerfilView({
  perfil,
  carregando,
  estado,
  ocupado,
  onVoltar,
  onEnviar,
  onCancelar,
  onResponder,
  onRemover,
}) {
  const [confirmando, setConfirmando] = useState(false)
  const stats = perfil?.estatisticas || null
  const conquistas = stats ? conquistasDoResumo({
    plays: stats.plays,
    musicas: stats.musicas,
    favs: stats.favoritas,
    dias: stats.dias,
    touches: stats.toques,
    buys: stats.compras,
    toys: stats.brinquedos,
    baths: stats.banhos,
  }) : []
  const feitas = conquistas.filter((c) => c.done)

  if (carregando || !perfil) {
    return (
      <section className="view">
        <BotaoVoltar onClick={onVoltar} />
        <div className="empty-state">
          <p className="amigos-erro">Carregando perfil…</p>
        </div>
      </section>
    )
  }

  // "Viu o app há 2 h" — a função devolve só o que vem depois ("há 2 h"),
  // então o texto é montado aqui. Menos de 5 minutos conta como online.
  const online = estaOnline(perfil.atualizado)
  const visto = online ? null : quandoViu(perfil.atualizado)

  return (
    <section className="view">
      <BotaoVoltar onClick={onVoltar} />

      <div className="amigo-perfil-topo" style={{ '--amig': perfil.cor || '#8ab4ff' }}>
        <div className="amigo-perfil-avatar">
          <AmigoAvatar perfil={perfil} size={92} />
        </div>
        <h2 className="amigo-perfil-nome">{perfil.nome?.trim() || 'Sem nome'}</h2>
        {perfil.codigo && <span className="amigo-perfil-codigo">{perfil.codigo}</span>}
        <p className="amigo-perfil-bio">
          {perfil.bio?.trim() || (estado === 'amigo' ? 'Esse amigo ainda não escreveu nada.' : 'Sem descrição.')}
        </p>
        {online ? (
          <span className="amigo-perfil-online">
            <span className="amigo-online-ponto" aria-hidden="true" />
            Online agora
          </span>
        ) : (
          visto && <span className="amigo-perfil-visto">Viu o app {visto}</span>
        )}
      </div>

      {stats ? (
        <>
          <div className="settings-card">
            <h2 className="section-title">Estatísticas</h2>
            <div className="amigo-numeros">
              <Numero valor={stats.plays} rotulo="plays" icone="▶" />
              <Numero valor={stats.musicas} rotulo="músicas" icone="♪" />
              <Numero valor={stats.favoritas} rotulo="favoritas" icone="❤" />
              <Numero valor={stats.dias} rotulo="dias ouvindo" icone="📅" />
            </div>
            <div className="amigo-numeros">
              <Numero valor={stats.toques} rotulo="toques no gatinho" icone="🐾" />
              <Numero valor={stats.coracoes} rotulo="corações" icone="💛" />
              <Numero valor={stats.brinquedos} rotulo="brinquedos" icone="🎈" />
              <Numero valor={stats.banhos} rotulo="banhos" icone="🛁" />
            </div>
            {stats.top.length > 0 && (
              <>
                <h3 className="stats-list-title">Mais tocadas</h3>
                <div className="amigo-top">
                  {stats.top.map((t, i) => (
                    <div className="most-played-row" key={`${t.titulo}-${i}`}>
                      <span className="most-played-num">{i + 1}</span>
                      <Cover colors={t.cores} image={t.capa} size={38} />
                      <span className="most-played-main">
                        <span className="track-title">
                          {t.titulo}
                          {t.fav && <span className="amigo-fav" aria-label="favorita">❤</span>}
                        </span>
                        {t.artista && <span className="track-artist">{t.artista}</span>}
                      </span>
                      <span className="most-played-count">
                        {nf(t.plays)} {t.plays === 1 ? 'play' : 'plays'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="settings-card">
            <h2 className="section-title">Conquistas</h2>
            <p className="lib-sub">{feitas.length} de {conquistas.length} desbloqueadas</p>
            <div className="amigo-conquistas">
              {conquistas.map((c) => (
                <span
                  key={c.id}
                  className={`amigo-conquista ${c.done ? 'on' : ''}`}
                  title={`${c.name} — ${c.done ? 'desbloqueada' : `${c.shown}/${c.need}`}`}
                >
                  <span aria-hidden="true">{c.icon}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="settings-card">
          <h2 className="section-title">Estatísticas</h2>
          <p className="settings-desc">
            As estatísticas aparecem quando a amizade for aceita. Agora você vê
            só o que essa pessoa deixa público: nome, foto, descrição e código.
          </p>
        </div>
      )}

      <div className="settings-card">
        <h2 className="section-title">Amizade</h2>
        {estado === 'amigo' && (
          <>
            <p className="settings-desc">Vocês são amigos. As estatísticas acima são as dele, atualizadas na sincronização dele.</p>
            {confirmando ? (
              <div className="amigos-acoes">
                <button
                  className="btn-primary"
                  disabled={ocupado}
                  onClick={() => { setConfirmando(false); onRemover(perfil) }}
                >
                  Sim, remover
                </button>
                <button className="btn-ghost" onClick={() => setConfirmando(false)}>Cancelar</button>
              </div>
            ) : (
              <div className="amigos-acoes">
                <button className="btn-ghost danger" onClick={() => setConfirmando(true)}>Remover amigo</button>
              </div>
            )}
          </>
        )}
        {estado === 'enviado' && (
          <div className="amigos-acoes">
            <button className="btn-ghost danger" disabled={ocupado} onClick={() => onCancelar(perfil)}>
              Cancelar pedido
            </button>
          </div>
        )}
        {estado === 'recebido' && (
          <div className="amigos-acoes">
            <button className="btn-primary" disabled={ocupado} onClick={() => onResponder(perfil, true)}>Aceitar</button>
            <button className="btn-ghost danger" disabled={ocupado} onClick={() => onResponder(perfil, false)}>Recusar</button>
          </div>
        )}
        {estado === 'nenhum' && (
          <div className="amigos-acoes">
            <button className="btn-primary" disabled={ocupado} onClick={() => onEnviar(perfil)}>
              Enviar pedido
            </button>
          </div>
        )}
        {estado === 'buscando' && <p className="amigos-erro">Procurando o perfil…</p>}
      </div>
    </section>
  )
}

function BotaoVoltar({ onClick }) {
  return (
    <button className="amigo-voltar" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Amigos
    </button>
  )
}

export { AmigoAvatar }
