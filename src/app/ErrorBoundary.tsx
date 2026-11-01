import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Last-resort boundary: a readable Arabic message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container" style={{ paddingBlock: 'var(--s8)' }}>
        <div className="state state-error" role="alert">
          <h3>حدث خطأ أثناء عرض الصفحة</h3>
          <p className="small">أعد تحميل الصفحة. إذا تكرّرت المشكلة، أبلغ مجلس الطلاب.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    );
  }
}
