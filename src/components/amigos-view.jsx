// Tela Amigos: meu código, encontrar por código, pedidos com resposta e a
// lista de amigos. Clicar em qualquer pessoa abre o perfil dela (foto, bio e
// estatísticas), onde a amizade também se gerencia. Só existe com conta logada.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import * as amigos from '../lib/amigos.js'
import { watchAmigos } from '../lib/sync.js'
import { getUserId } from '../lib/account.js'
import { gerarCodigo } from '../lib/codigo-amigo.js'
import { corPublicavel } from '../settings'
import { AmigoAvatar, AmigoPerfilView } from './amigo-perfil-view.jsx'

const MAX_MENSSAGEM = 140

function Linha({ perfil, subtitulo, onAbrir, acoes }) {
  return (
    <div className="amigos-card">
      <button className="amigos-card-hit" onClick={() => onAbrir?.(perfil)} aria-label={`Ver perfil de ${perfil?.name || perfil?.nome || 'amigo'}`}>
        <AmigoAvatar perfil={perfil} />
        <span className="amigos-card-info">
          <span className="amigos-card-nome">{perfil?.name?.trim() || perfil?.nome?.trim() || 'Sem nome'}</span>
          {subtitulo && <span className="amigos-card-bio">{subtitulo}</span>}
        </span>
      </button>
      {acoes || (
        <span className="amigos-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  )
}

// Caixa para escrever junto do pedido. Opcional de propósito: dá para mandar
// sem digitar nada, e o botão fica esperando para não mandar pedido sem querer.
// O erro do envio aparece AQUI, dentro da caixa: antes ele ia só para
// `previaMsg`, que fica escondido atrás da linha do perfil — por isso o pedido
// "não era enviado" sem explicar nada.
function CaixaMensagem({ valor, onChange, onCancelar, onEnviar, ocupado, erro }) {
  return (
    <div className="amigos-msgbox">
      <input
        className="search"
        placeholder="Quer ser meu amigo?"
        value={valor}
        maxLength={MAX_MENSSAGEM}
        onChange={(e) => onChange(amigos.normalizarMensagem(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnviar()
          if (e.key === 'Escape') onCancelar()
        }}
        autoFocus
      />
      <button className="btn-primary" onClick={onEnviar} disabled={ocupado}>
        {ocupado ? 'Enviando…' : 'Enviar'}
      </button>
      <button className="btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
      {erro && <p className="amigos-erro amigos-msgbox-erro">{erro}</p>}
    </div>
  )
}

export const AmigosView = memo(function AmigosView({ account, settings, onOpenAccount, onToast }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [codigo, setCodigo] = useState('')
  const [amigosLista, setAmigosLista] = useState([])
  const [recebidos, setRecebidos] = useState([])
  const [enviados, setEnviados] = useState([])
  const [busca, setBusca] = useState('')
  const [previa, setPrevia] = useState(null)
  const [previaMsg, setPreviaMsg] = useState('')
  // Resultados da busca por nome (o caminho do código usa só `previa`).
  const [resultados, setResultados] = useState([])
  // Texto do pedido, e se a caixa de mensagem está aberta para alguém.
  const [msgPara, setMsgPara] = useState('')
  const [msgPedido, setMsgPedido] = useState('')
  const [ocupadoMsg, setOcupadoMsg] = useState(false)
  const [aberto, setAberto] = useState(null)
  // O callback do watcher é criado uma vez e não enxerga o `aberto` atual; sem
  // este espelho, a recarga do cartão aberto usaria o valor antigo (ou nada).
  const abertoRef = useRef(null)
  abertoRef.current = aberto
  const [detalhe, setDetalhe] = useState(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const ocupadoRef = useRef(false)

  const avisar = useCallback(
    (msg) => {
      if (onToast) onToast(msg)
      else setPreviaMsg(msg)
    },
    [onToast],
  )

  const carregar = useCallback(async () => {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    setErro('')
    try {
      const [uid, meu, lista, pedidos] = await Promise.all([
        getUserId(),
        amigos.meuPerfil(),
        amigos.listarAmigos(),
        amigos.listarPedidos(),
      ])
      setCodigo(meu?.code || (uid ? gerarCodigo(uid) : ''))
      setAmigosLista(lista || [])
      setRecebidos(pedidos.recebidos || [])
      setEnviados(pedidos.enviados || [])
    } catch {
      setErro('Não deu para carregar. Verifique a internet e tente de novo.')
    } finally {
      ocupadoRef.current = false
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!account?.user) return
    // Garante meu perfil (cria com código/foto, se for o primeiro uso) e
    // carrega. Depende do ID da conta (não só de "tem conta logada"): trocar
    // de conta precisa recarregar tudo, senão a tela ficaria com o código e
    // os amigos de quem saiu.
    amigos
      .garantirMeuPerfil({
        name: settings.userName,
        bio: settings.bio,
        accent: corPublicavel(settings),
        avatar: settings.avatar,
      })
      .then(() => carregar())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.user?.id, settings.userName, settings.bio, settings.avatar])

  // Enquanto a tela está aberta, fica de olho na lista: se a pessoa trocar a
  // foto, o nome, aceitar um pedido ou remover alguém, a lista se atualiza
  // sozinha — sem precisar sair e voltar na aba.
  //
  // Recarrega em três situações, porque são três jeitos de o pedido "chegar"
  // sem a pessoa fazer nada:
  //  - o vigia daqui mesmo viu mudança (só roda com esta tela aberta);
  //  - a tela ganhou foco de novo: quem manda o pedido estava com o app aberto
  //    ao lado, e voltar para cá tem que mostrar o que chegou nesse meio-tempo;
  //  - a tela montou: o primeiro carregamento.
  //
  // Antes existia um quarto caminho, o `sinal` vindo do App, que tinha um
  // vigia ligado o tempo todo. Ele só fazia este mesmo trabalho duas vezes —
  // e, com a tela do habitat aberta, ainda redesenhava o app inteiro a cada
  // 2 s por causa disso.
  useEffect(() => {
    if (!account?.user) return undefined
    return watchAmigos(() => {
      carregar()
      // O perfil que estiver aberto na tela também é do assunto: a pessoa trocou
      // a bio ou a foto com o cartão à mão, e o cartão ficava mostrando a
      // versão antiga até sair e voltar.
      const alvo = aberto?.uid || abertoRef.current
      if (alvo) amigos.verPerfilAmigo(alvo).then((d) => d && setDetalhe(d))
    })
  }, [account?.user, carregar, aberto?.uid])

  useEffect(() => {
    if (!account?.user) return
    carregar()
  }, [account?.user, carregar])

  useEffect(() => {
    if (!account?.user || typeof window === 'undefined') return undefined
    // Voltar para a aba recarrega: o pedido do outro chega enquanto a pessoa
    // está em outra tela, e sem isto a lista ficaria parada esperando o próximo
    // ciclo do vigia.
    const onFoco = () => {
      if (document.visibilityState === 'visible') carregar()
    }
    document.addEventListener('visibilitychange', onFoco)
    window.addEventListener('focus', onFoco)
    return () => {
      document.removeEventListener('visibilitychange', onFoco)
      window.removeEventListener('focus', onFoco)
    }
  }, [account?.user, carregar])

  // Abre o perfil de alguém. Se a RPC ainda não existir no banco (ou a pessoa
  // não for minha amiga), mostra o que já veio na lista em vez de tela vazia.
  const abrirPerfil = useCallback(async (p) => {
    if (!p?.uid) return
    setAberto(p)
    setDetalhe(null)
    setCarregandoDetalhe(true)
    const detalheApi = await amigos.verPerfilAmigo(p.uid)
    setDetalhe(detalheApi || {
      uid: p.uid,
      codigo: p.code || '',
      nome: p.name || p.nome || '',
      bio: p.bio || '',
      cor: p.accent || p.cor || '',
      foto: p.avatar || p.foto || '',
      amigo: false,
      estatisticas: null,
    })
    setCarregandoDetalhe(false)
  }, [])

  const estadoDe = useCallback(
    (uid) => {
      if (amigosLista.some((a) => a.uid === uid)) return 'amigo'
      if (recebidos.some((r) => r.perfil?.uid === uid)) return 'recebido'
      if (enviados.some((r) => r.perfil?.uid === uid)) return 'enviado'
      return 'nenhum'
    },
    [amigosLista, recebidos, enviados],
  )

  // Recarrega a lista e o perfil aberto: depois de aceitar/recusar/remover, a
  // tela de perfil não pode ficar mostrando números de um estado que já passou.
  const recarregar = useCallback(async () => {
    await carregar()
    const alvo = aberto
    if (alvo?.uid) {
      const d = await amigos.verPerfilAmigo(alvo.uid)
      if (d) setDetalhe(d)
    }
  }, [carregar, aberto])

  const acionar = async (fn, msgOk) => {
    if (ocupado) return
    setOcupado(true)
    try {
      const r = await fn()
      if (r && r.ok === false) avisar(r.error || 'Não deu para fazer isso.')
      else if (msgOk) avisar(msgOk)
      await recarregar()
    } finally {
      setOcupado(false)
    }
  }

  if (aberto) {
    return (
      <AmigoPerfilView
        perfil={detalhe}
        carregando={carregandoDetalhe}
        estado={estadoDe(aberto.uid)}
        ocupado={ocupado}
        onVoltar={() => { setAberto(null); setDetalhe(null) }}
        onEnviar={(p) => acionar(() => amigos.enviarPedido(p.codigo), `Pedido enviado para ${p.nome || 'a pessoa'}!`)}
        onCancelar={(p) => {
          const req = enviados.find((r) => r.perfil?.uid === p.uid)
          if (req) acionar(() => amigos.cancelarPedido(req.id), 'Pedido cancelado.')
        }}
        onResponder={(p, aceitar) => {
          const req = recebidos.find((r) => r.perfil?.uid === p.uid)
          if (req) acionar(() => amigos.responderPedido(req.id, aceitar), aceitar ? 'Amizade aceita!' : 'Pedido recusado.')
        }}
        onRemover={(p) => acionar(() => amigos.removerAmigo(p.uid), `Vocês deixaram de ser amigos.`)}
      />
    )
  }

  if (!account?.user) {
    return (
      <section className="view">
        <h1 className="greeting">Amigos</h1>
        <div className="empty-state">
          <div className="empty-cover">
            <span className="amigos-avatar" style={{ width: 56, height: 56, '--amig': '#8ab4ff' }}>♥</span>
          </div>
          <h2>Precisa de uma conta</h2>
          <p>Entre na sua conta para achar seus amigos, mandar pedidos e ver os perfis deles.</p>
          <button className="btn-primary" onClick={onOpenAccount}>Entrar / Criar conta</button>
        </div>
      </section>
    )
  }

  const copiar = async () => {
    const txt = codigo || ''
    if (!txt) return
    try {
      await navigator.clipboard.writeText(txt)
      avisar('Código copiado!')
    } catch {
      avisar(`Seu código: ${txt}`)
    }
  }

  // Reconhece o que a pessoa digitou. Código tem aquele formato (NEBU-XXXX);
  // qualquer outra coisa com 2+ letras é treated como nome, que é o jeito que
  // todo mundo procura amigo de verdade.
  const pareceCodigo = (t) => /^[A-Za-z]{3,6}-[A-Za-z0-9]{4,8}$/.test(String(t || '').trim())

  const buscar = async () => {
    setPreviaMsg('')
    setPrevia(null)
    setResultados([])
    const termo = busca.trim()
    if (!termo) return
    if (pareceCodigo(termo)) {
      const p = await amigos.buscarPerfilPorCodigo(termo)
      if (!p) {
        setPreviaMsg('Ninguém com esse código. Confira se digitou certo.')
        return
      }
      if (p.uid === account.user.id) {
        setPreviaMsg('Esse é o SEU código!')
        return
      }
      setPrevia(p)
      return
    }
    // Nome: resultados em lista, e o código continua disponível em cada linha.
    const achados = await amigos.buscarPorNome(termo)
    if (!achados.length) {
      setPreviaMsg(`Ninguém com "${termo}" no nome.`)
      return
    }
    setResultados(achados)
  }

  const pedir = async (perfil, mensagem = '') => {
    setOcupadoMsg(!!perfil)
    try {
      const r = await amigos.enviarPedido(perfil ? perfil.codigo : busca, mensagem)
      if (r.ok) {
        avisar(`Pedido enviado para ${r.nome || 'a pessoa'}!`)
        setBusca('')
        setPrevia(null)
        setResultados([])
        setMsgPedido('')
        setMsgPara('')
        setPreviaMsg('')
        carregar()
      } else {
        // Deixa a caixa aberta com o motivo: fechar o erro atrás da linha do
        // perfil é o que fazia parecer que o botão não funcionava.
        setPreviaMsg(r.error || 'Não deu para enviar o pedido.')
      }
    } catch {
      setPreviaMsg('Sem conexão. Tente de novo.')
    } finally {
      setOcupadoMsg(false)
    }
  }

  const responder = (id, aceitar) =>
    acionar(() => amigos.responderPedido(id, aceitar), aceitar ? 'Amizade aceita!' : 'Pedido recusado.')

  return (
    <section className="view">
      <h1 className="greeting">Amigos</h1>

      {erro && <p className="amigos-erro">{erro}</p>}

      <div className="amigos-codigo">
        <span className="amigos-codigo-label">Meu código</span>
        <span className="amigos-codigo-valor">{codigo || 'gerando…'}</span>
        <button className="btn-ghost" onClick={copiar} disabled={!codigo}>Copiar</button>
      </div>

      <div className="amigos-buscar">
        <input
          className="search"
          placeholder="Nome do amigo ou código (ex.: NEBU-4F2K9)"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setResultados([])
          }}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
        />
        <button className="btn-ghost" onClick={buscar}>Procurar</button>
      </div>
      {previa ? (
        <Linha
          perfil={previa}
          subtitulo={estadoDe(previa.uid) === 'nenhum' ? 'Encontrado pelo código' : undefined}
          onAbrir={abrirPerfil}
          acoes={
            <div className="amigos-acoes">
              {estadoDe(previa.uid) === 'nenhum' ? (
                msgPara === previa.uid ? (
                  <CaixaMensagem
                    valor={msgPedido}
                    onChange={setMsgPedido}
                    onCancelar={() => {
                      setMsgPara('')
                      setMsgPedido('')
                    }}
                    onEnviar={() => pedir(previa, msgPedido)}
                    ocupado={ocupadoMsg}
                    erro={previaMsg}
                  />
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setMsgPara(previa.uid)
                      setMsgPedido('')
                    }}
                  >
                    Adicionar
                  </button>
                )
              ) : (
                <button className="btn-ghost" onClick={() => abrirPerfil(previa)}>Ver perfil</button>
              )}
            </div>
          }
        />
      ) : (
        previaMsg && <p className="amigos-erro">{previaMsg}</p>
      )}

      {resultados.length ? (
        <div className="amigos-resultados">
          {resultados.map((p) => (
            <Linha
              key={p.uid}
              perfil={p}
              subtitulo={p.codigo}
              onAbrir={abrirPerfil}
              acoes={
                <div className="amigos-acoes">
                  {estadoDe(p.uid) === 'nenhum' ? (
                    msgPara === p.uid ? (
                      <CaixaMensagem
                        valor={msgPedido}
                        onChange={setMsgPedido}
                        onCancelar={() => {
                          setMsgPara('')
                          setMsgPedido('')
                        }}
                        onEnviar={() => pedir(p, msgPedido)}
                        ocupado={ocupadoMsg}
                        erro={previaMsg}
                      />
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={() => {
                          setMsgPara(p.uid)
                          setMsgPedido('')
                        }}
                      >
                        Adicionar
                      </button>
                    )
                  ) : (
                    <button className="btn-ghost" onClick={() => abrirPerfil(p)}>Ver perfil</button>
                  )}
                </div>
              }
            />
          ))}
        </div>
      ) : null}

      {carregando ? (
        <p className="amigos-erro">Carregando…</p>
      ) : (
        <>
          {recebidos.length > 0 && (
            <div className="settings-card">
              <h2 className="section-title">Pedidos pendentes</h2>
              <p className="amigos-vazio amigos-pendentes-dica">
                Quem mandou pedido para você. Aceita e a amizade começa.
              </p>
              {recebidos.map((p) => (
                <Linha
                  key={p.id}
                  perfil={p.perfil}
                  subtitulo={p.mensagem?.trim() || undefined}
                  onAbrir={abrirPerfil}
                  acoes={
                    <div className="amigos-acoes">
                      <button className="btn-primary" onClick={() => responder(p.id, true)}>Aceitar</button>
                      <button className="btn-ghost danger" onClick={() => responder(p.id, false)}>Recusar</button>
                    </div>
                  }
                />
              ))}
            </div>
          )}

          {enviados.length > 0 && (
            <div className="settings-card">
              <h2 className="section-title">Seus pedidos enviados</h2>
              <p className="amigos-vazio amigos-pendentes-dica">
                Enviados por você. Não são pedidos pendentes: aqui é quem espera
                a resposta. Eles aparecem na tela da outra pessoa.
              </p>
              {enviados.map((p) => (
                <Linha
                  key={p.id}
                  perfil={p.perfil}
                  subtitulo="Pedido enviado"
                  onAbrir={abrirPerfil}
                  acoes={
                    <div className="amigos-acoes">
                      <button
                        className="btn-ghost danger"
                        onClick={() => acionar(() => amigos.cancelarPedido(p.id), 'Pedido cancelado.')}
                      >
                        Cancelar
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}

          <div className="settings-card">
            <h2 className="section-title">Seus amigos</h2>
            {amigosLista.length === 0 ? (
              <p className="amigos-vazio">
                {recebidos.length || enviados.length
                  ? 'Assim que alguém aceitar, o perfil dele aparece aqui.'
                  : 'Nenhum amigo ainda. Peça o código para alguém e mande o primeiro pedido.'}
              </p>
            ) : (
              amigosLista.map((p) => {
                // Bio e último acesso juntos: um por linha, senão a lista fica
                // alta demais. Quem não tem bio mostra só o acesso.
                const visto = amigos.quandoViu(p.last_seen_at)
                const bio = p.bio?.trim()
                const subtitulo = bio
                  ? (visto ? `${bio} · ${visto}` : bio)
                  : (visto || undefined)
                return (
                  <Linha key={p.uid} perfil={p} subtitulo={subtitulo} onAbrir={abrirPerfil} />
                )
              })
            )}
          </div>
        </>
      )}
    </section>
  )
})
