import { Component } from 'react'

// Uma exceção em QUALQUER parte do app — num componente ou dentro de um
// efeito — derrubava a árvore inteira e deixava a tela preta, sem nenhum jeito
// de voltar sem recarregar a página. Numa tela que já fica preta sozinha, isso
// é o pior defeito possível: a pessoa perde a sessão e não tem como sair.
//
// Aqui o erro vira uma tela com o motivo e um botão de "Tentar de novo", que
// remonta o app do zero. Recarregar a página é a última etapa, não a única.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
    this.tentarDeNovo = this.tentarDeNovo.bind(this)
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // Fica no console para dar para diagnosticar depois.
    try {
      console.error('[NebulaTune] erro na tela', erro, info?.componentStack)
    } catch {
      /* console pode estar bloqueado */
    }
  }

  tentarDeNovo() {
    this.setState({ erro: null })
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children
    return (
      <div className="crash-tela">
        <div className="crash-card">
          <h2>Algo travou aqui</h2>
          <p className="crash-msg">{String(erro?.message || erro)}</p>
          <div className="crash-acoes">
            <button type="button" className="btn-primary" onClick={this.tentarDeNovo}>
              Tentar de novo
            </button>
          </div>
          <p className="crash-dica">
            Suas músicas continuam salvas no aparelho. Se não voltar, fechar e abrir o app
            resolve.
          </p>
        </div>
      </div>
    )
  }
}
