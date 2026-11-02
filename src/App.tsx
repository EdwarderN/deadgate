import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRules } from './data/rules';
import { newCrew } from './engine/crew';
import type { Crew } from './engine/model';
import { uid } from './engine/model';
import { validate } from './engine/validate';
import { crewFromShare, crewToJson, download, fileName, loadCrews, parseCrewJson, saveCrews } from './store';
import { RuleProvider } from './ui/rule';
import { Builder } from './ui/Builder';
import { Campaign } from './ui/Campaign';
import { PrintView } from './ui/Print';
import { BattleView } from './ui/Battle';
import { ConfirmProvider, useAsk } from './ui/confirm';
import { AfterBattleView } from './ui/AfterBattle';

type Route = { view: 'home' } | { view: 'crew' | 'print' | 'battle' | 'after'; id: string };

function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, id] = h.split('/');
  if (view === 'crew' && id) return { view: 'crew', id };
  if ((view === 'print' || view === 'battle' || view === 'after') && id) return { view, id };
  return { view: 'home' };
}

export const go = (path: string) => { location.hash = path; };

export default function App() {
  const rules = getRules();
  const [crews, setCrews] = useState<Crew[]>(() => loadCrews());
  const [route, setRoute] = useState<Route>(parseRoute);
  const [notice, setNotice] = useState<string | null>(null);

  // A share link carries a whole crew: keep a copy of it on this device.
  const takeShare = useCallback(() => {
    if (!location.hash.includes('share=')) return false;
    const c = crewFromShare(location.hash);
    if (!c) { setNotice('That share link could not be read.'); go('/'); return true; }
    const copy = { ...c, id: uid('c'), updated: new Date().toISOString() };
    setCrews((cs) => { const next = [copy, ...cs]; saveCrews(next); return next; });
    setNotice(`Added the shared crew "${c.name || 'Unnamed crew'}".`);
    go(`/crew/${copy.id}`);
    return true;
  }, []);

  useEffect(() => {
    takeShare();
    const on = () => { if (!takeShare()) setRoute(parseRoute()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [takeShare]);

  const put = useCallback((c: Crew) => {
    setCrews((cs) => {
      const stamped = { ...c, updated: new Date().toISOString() };
      const next = cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? stamped : x)) : [stamped, ...cs];
      saveCrews(next);
      return next;
    });
  }, []);

  const remove = (id: string) => setCrews((cs) => { const next = cs.filter((c) => c.id !== id); saveCrews(next); return next; });

  const crew = route.view !== 'home' ? crews.find((c) => c.id === route.id) : undefined;
  // Each change applies to the latest saved crew, so several changes from one tap all stick.
  const crewId = crew?.id;
  const update = useCallback((fn: (c: Crew) => Crew) => {
    if (!crewId) return;
    setCrews((cs) => {
      const next = cs.map((x) => (x.id === crewId ? { ...fn(x), updated: new Date().toISOString() } : x));
      saveCrews(next);
      return next;
    });
  }, [crewId]);

  let body;
  if (route.view === 'print' && crew) body = <PrintView crew={crew} />;
  else if (route.view === 'battle' && crew) body = <BattleView crew={crew} update={update} />;
  else if (route.view === 'after' && crew) body = <AfterBattleView crew={crew} update={update} />;
  else if (route.view === 'crew' && crew) body = crew.phase === 'creation' ? <Builder crew={crew} update={update} /> : <Campaign crew={crew} update={update} />;
  else body = <Home crews={crews} put={put} remove={remove} setNotice={setNotice} />;

  return (
    <RuleProvider><ConfirmProvider>
      <div className={`app view-${route.view}`}>
        <header className="topbar no-print">
          <a href="#/" className="brand" aria-label="All crews">
            <span className="tape" aria-hidden="true" />The Dead Gate <span className="brand-sub">crew builder</span>
          </a>
          <span className="rules-version" title="Rulebook version the data comes from">Rules v{rules.version}</span>
        </header>
        {notice && (
          <div className="notice no-print" role="status">
            {notice} <button className="link" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        <main>{route.view !== 'home' && !crew ? <p className="empty">That crew isn't on this device. <a href="#/">Back to your crews</a></p> : body}</main>
      </div>
    </ConfirmProvider></RuleProvider>
  );
}

function Home({ crews, put, remove, setNotice }: { crews: Crew[]; put: (c: Crew) => void; remove: (id: string) => void; setNotice: (s: string) => void }) {
  const ask = useAsk();
  const rules = getRules();
  const status = useMemo(() => Object.fromEntries(crews.map((c) => [c.id, validate(rules, c).filter((m) => m.level === 'error').length])), [crews, rules]);

  const create = () => { const c = newCrew(rules); put(c); go(`/crew/${c.id}`); };
  const importFile = async (file: File) => {
    try {
      const c = parseCrewJson(await file.text());
      const exists = crews.some((x) => x.id === c.id);
      const copy = exists ? { ...c, id: uid('c') } : c;
      put(copy);
      setNotice(`Imported "${c.name || 'Unnamed crew'}".`);
    } catch (e) {
      setNotice(`Could not import: ${(e as Error).message}`);
    }
  };

  return (
    <div className="home">
      <section className="hero">
        <h1>Your crews</h1>
        <p className="muted">Build a legal starting crew step by step, keep it up to date between battles, and print the cards. Everything stays on this device.</p>
        <div className="row gap">
          <button className="btn primary" onClick={create}>New crew</button>
          <label className="btn">
            Import a crew file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
        </div>
      </section>
      {crews.length === 0 ? (
        <p className="empty">No crews yet. The cleaning robot has swept the roster clean. Start a new crew above.</p>
      ) : (
        <ul className="crew-list">
          {crews.map((c) => (
            <li key={c.id} className="crew-item" style={{ borderLeftColor: c.tape || undefined }}>
              <a href={`#/crew/${c.id}`} className="crew-link">
                <strong>{c.name || 'Unnamed crew'}</strong>
                <span className="muted">{[c.faction, c.subfaction].filter(Boolean).join(', ') || 'No faction yet'} · {c.fighters.length} fighters</span>
                <span className="row gap-s">
                  <span className={`badge ${c.phase === 'creation' ? '' : 'ok'}`}>{c.phase === 'creation' ? `Building: step ${c.step + 1}` : 'In the campaign'}</span>
                  {status[c.id] > 0 ? <span className="badge err">{status[c.id]} to fix</span> : <span className="badge ok">Legal</span>}
                </span>
              </a>
              <div className="row gap-s wrap">
                <button className="btn small" onClick={() => download(fileName(c), crewToJson(c))}>Export</button>
                <button className="btn small" onClick={() => { put({ ...c, id: uid('c'), name: `${c.name || 'Crew'} (copy)` }); }}>Copy</button>
                <button className="btn small danger" onClick={async () => { if (await ask(`Delete "${c.name || 'Unnamed crew'}" from this device? This cannot be undone.`)) remove(c.id); }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer className="foot muted">Rules version {rules.version}. Works offline once loaded. No accounts, no server.</footer>
    </div>
  );
}
