// The app's own "Are you sure?" and notice boxes. Browser pop-ups (confirm, alert,
// prompt) are blocked inside embedded pages such as claude.ai, so nothing uses them.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Ask { message: string; ok?: string; cancel?: string | null; danger?: boolean; copyText?: string }
type AskFn = (a: Ask | string) => Promise<boolean>;

const Ctx = createContext<AskFn>(async () => false);
/** await ask('Delete it?') resolves true for OK. Pass { cancel: null } for a plain notice. */
export const useAsk = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<(Ask & { resolve: (v: boolean) => void }) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const ask = useCallback<AskFn>((a) => new Promise((resolve) => setCur({ ...(typeof a === 'string' ? { message: a } : a), resolve })), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (cur && !d.open) d.showModal();
    if (!cur && d.open) d.close();
  }, [cur]);
  const done = (v: boolean) => { cur?.resolve(v); setCur(null); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <dialog ref={ref} className="rule-dialog confirm-dialog" onCancel={(e) => { e.preventDefault(); done(false); }} aria-labelledby="confirm-msg">
        {cur && (
          <div className="rule-body">
            <p id="confirm-msg" className="confirm-msg">{cur.message}</p>
            {cur.copyText && <input className="copy-text" readOnly value={cur.copyText} onFocus={(e) => e.target.select()} aria-label="Text to copy" />}
            <div className="row gap wrap">
              <button className={`btn ${cur.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>{cur.ok ?? 'OK'}</button>
              {cur.cancel !== null && <button className="btn" onClick={() => done(false)}>{cur.cancel ?? 'Cancel'}</button>}
            </div>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/** Copy a share link, or show it to copy by hand when the clipboard is blocked. */
export async function copyLink(ask: AskFn, link: string) {
  try {
    await navigator.clipboard.writeText(link);
    await ask({ message: 'Share link copied.', cancel: null });
  } catch {
    await ask({ message: 'Copy this link:', copyText: link, cancel: null });
  }
}
