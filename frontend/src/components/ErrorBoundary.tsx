import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Muda ao navegar: sai do estado de erro sozinho.
  resetKey?: string;
}

// Se uma tela falhar ao desenhar, mostra uma mensagem em vez de tela branca.
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro ao desenhar a tela:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-xl border border-[#EF4444] bg-[#FEF2F2] p-6 text-center">
        <h2 className="text-base font-semibold text-[#B91C1C]">Algo deu errado ao mostrar esta tela</h2>
        <p className="mt-2 text-sm text-[#1A1A1A]">
          Nada foi perdido nem apagado. Recarregue a página para tentar de novo; se o erro continuar, avise quem cuida do site.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] hover:bg-[#B37D3F]"
        >
          Recarregar
        </button>
      </div>
    );
  }
}
