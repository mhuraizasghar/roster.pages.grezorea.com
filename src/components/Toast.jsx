import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const icons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
    info: Info,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info;
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto eval-card px-4 py-3 flex items-start gap-3 shadow-lg"
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: 'var(--eval-ink)' }} />
              <div className="text-xs font-medium flex-1" style={{ color: 'var(--eval-ink)' }}>
                {t.message}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="opacity-60 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
