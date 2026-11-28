import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  moduleName?: string;
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error || 'Неизвестная ошибка');
    return { hasError: true, errorMsg: msg };
  }

  componentDidCatch(error: unknown) {
    // Keep console diagnostic for debugging without crashing the whole PWA
    console.error(`[IRON CORE ErrorBoundary${this.props.moduleName ? `:${this.props.moduleName}` : ''}]`, error);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.compact) {
      return (
        <div className="p-5 rounded-2xl bg-[#141519] border border-white/10 text-center space-y-2.5">
          <div className="text-xs font-bold text-slate-100">
            Модуль {this.props.moduleName || ''} временно недоступен
          </div>
          <p className="text-[11px] font-mono text-slate-400 break-words">{this.state.errorMsg}</p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-xl bg-[#c8f550] text-[#09090b] text-xs font-extrabold active:scale-95 transition-transform"
          >
            Перезагрузить модуль
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-dvh bg-[#090a0c] text-[#f7f7f9] flex items-center justify-center p-6">
        <div className="max-w-sm w-full p-6 rounded-3xl bg-[#141519] border border-white/10 text-center space-y-4 shadow-2xl">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#c8f550] font-bold">
            IRON CORE · SAFE MODE
          </div>
          <div className="text-base font-bold">
            Произошёл сбой{this.props.moduleName ? ` (${this.props.moduleName})` : ''}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Твои подходы и данные в безопасности в IndexedDB. Перезагрузи модуль или обнови страницу.
          </p>
          {this.state.errorMsg && (
            <div className="p-2.5 rounded-xl bg-black/40 font-mono text-[10px] text-slate-400 break-words">
              {this.state.errorMsg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={this.handleReset}
              className="py-2.5 rounded-xl bg-[#c8f550] text-[#09090b] text-xs font-extrabold active:scale-95 transition-transform"
            >
              Повторить
            </button>
            <button
              onClick={() => window.location.reload()}
              className="py-2.5 rounded-xl bg-white/10 text-slate-100 text-xs font-semibold active:scale-95 transition-transform"
            >
              Обновить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
