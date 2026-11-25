import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { clearSave } from './platform/storage';
import { Icon } from './Icon';

interface State {
  error: Error | null;
  key: number;
}

/** 렌더 중 예외가 나면 흰 화면 대신 안내 화면을 보여주고, 저장을 지운 뒤 타이틀로 돌아갈 수 있게 한다 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SmilePark] 렌더 오류', error, info.componentStack);
  }

  reset = () => {
    clearSave();
    try {
      if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    } catch {
      /* noop */
    }
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="gh-app">
          <div className="crash" role="alert">
            <span className="crash-ico">
              <Icon name="crack" size={40} />
            </span>
            <h2>문제가 생겼어요</h2>
            <p>게임 화면을 그리는 중 오류가 났어요. 저장된 게임을 지우고 타이틀로 돌아가면 새로 시작할 수 있어요.</p>
            <code>{this.state.error.message}</code>
            <button className="btn primary wide" onClick={this.reset}>
              저장 삭제 후 타이틀로
            </button>
          </div>
        </div>
      );
    }
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}
