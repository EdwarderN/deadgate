// Tap any trait or item to read its rule text and section, as the book prints it.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { plain, type ItemDef, type RuleRef, type Rules } from '../data/rules';
import { MdBlock } from './md';

const Ctx = createContext<(r: RuleRef) => void>(() => {});
export const useRule = () => useContext(Ctx);

export function RuleProvider({ children }: { children: ReactNode }) {
  const [rule, setRule] = useState<RuleRef | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (rule && !d.open) d.showModal();
    if (!rule && d.open) d.close();
  }, [rule]);
  return (
    <Ctx.Provider value={setRule}>
      {children}
      <dialog ref={ref} className="rule-dialog" onClose={() => setRule(null)} onClick={(e) => e.target === ref.current && setRule(null)} aria-labelledby="rule-title">
        {rule && (
          <div className="rule-body">
            <div className="rule-head">
              <h2 id="rule-title">{rule.title}</h2>
              {rule.section && <span className="section-tag">§ {rule.section}</span>}
            </div>
            <dl>
              {rule.lines.map(([k, v], i) => (
                <div key={i} className="rule-line">
                  {k && <dt>{k}</dt>}
                  <dd><MdBlock text={v} /></dd>
                </div>
              ))}
            </dl>
            <button className="btn" onClick={() => setRule(null)} autoFocus>Close</button>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

export function RuleLink({ rule, children, className }: { rule: RuleRef | null | undefined; children: ReactNode; className?: string }) {
  const open = useRule();
  if (!rule) return <>{children}</>;
  return (
    <button type="button" className={`rule-link ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(rule); }} title={`Rule: ${rule.title} (${rule.section})`}>
      {children}
    </button>
  );
}

// ---------- building rule refs from data ----------
const rowLines = (row: Record<string, unknown>, skip: string[] = []): [string, string][] =>
  Object.entries(row).filter(([k, v]) => typeof v === 'string' && !skip.includes(k)).map(([k, v]) => [k, v as string]);

export function itemRule(rules: Rules, item: ItemDef): RuleRef {
  let lines: [string, string][];
  if (item.kind === 'robo-arm') {
    const row = Object.entries(item.rules).find(([k]) => plain(k).toLowerCase() === item.source)?.[1] as Record<string, string> | undefined;
    lines = row ? rowLines(row, ['Source']) : [];
  } else lines = rowLines(item.rules);
  if (item.kind === 'armour') {
    const src = rules.data.armour_by_source.find((r) => plain(r.Source).toLowerCase() === item.source);
    if (src) lines.push([`${plain(src.Source)} armour`, src['Armour rule']]);
  }
  for (const t of item.traits) if (rules.weaponTraits[t]) lines.push([t, rules.weaponTraits[t]]);
  const meta: string[] = [];
  if (item.price !== null) meta.push(`${item.price} parts (${item.source})`);
  else meta.push(`${item.source}: never for sale`);
  if (item.note) meta.push(item.note);
  lines.unshift(['Price', meta.join('; ')]);
  return { title: item.name, section: item.section, lines };
}

export const speciesRule = (rules: Rules, name: string): RuleRef | null => {
  const s = rules.species.find((x) => x.name === name);
  return s ? { title: s.name, section: rules.section('species'), lines: [['Move', s.moveText], ['Signature trait', s.trait]] } : null;
};

export const typeRule = (rules: Rules, faction: string | null, type: string | null): RuleRef | null => {
  const f = rules.faction(faction ?? '');
  const t = f?.types.find((x) => x.name === type);
  return f && t ? { title: t.label, section: f.section, lines: [['Type trait', t.trait]] } : null;
};

export const captainRule = (rules: Rules, name: string): RuleRef | null => {
  const t = rules.captainTraits.find((x) => x.name === name);
  return t ? { title: t.name, section: rules.section('captain'), lines: [['Captain trait', t.rule]] } : null;
};

export const advanceRule = (rules: Rules, name: string): RuleRef | null => {
  const a = rules.advanceDefs.find((x) => x.name === name);
  return a ? { title: a.name, section: rules.section('advance'), lines: [[`${a.list} advance`, a.rule], ...(a.needs ? [['Needs', a.needs] as [string, string]] : [])] } : null;
};

export const injuryRule = (rules: Rules, name: string): RuleRef | null => {
  const i = [...rules.injuries, ...rules.glitches].find((x) => x.name === name);
  if (!i) return null;
  const isGlitch = rules.glitches.includes(i);
  return { title: i.name, section: rules.section(isGlitch ? 'glitch' : 'injury'), lines: [[`${i.table}${isGlitch ? '' : ' injury'}`, i.text], ['Title', i.title ?? '']] };
};

export const sillyRule = (rules: Rules, name: string): RuleRef | null => {
  const i = rules.silly.find((x) => x.name === name);
  return i ? { title: i.name, section: rules.section('silly'), lines: [[`${i.table} silly trait`, i.text], ['Nickname', i.title ?? '']] } : null;
};

export const legendRule = (rules: Rules, name: string): RuleRef | null => {
  const l = rules.legends.find((x) => x.name === name);
  return l ? { title: l.name, section: rules.section(l.from.startsWith('Rumour') ? 'rumour' : 'deed'), lines: [['Legend', l.text], ['Title', l.title ?? ''], ['Earned by', l.from]] } : null;
};

export const tagRule = (rules: Rules, name: string): RuleRef | null => {
  const t = rules.tags.find((x) => x.name === name);
  return t ? { title: t.name, section: rules.section('tag'), lines: [['Gained when', t.gained], ['What it does', t.text]] } : null;
};

export const contactRule = (rules: Rules, name: string): RuleRef | null => {
  const t = rules.contacts.find((x) => x.name === name);
  return t ? { title: t.name, section: rules.section('contact'), lines: [['Use them to', t.text]] } : null;
};

/** The psionic powers a fighter of this species may use: a power marked "(X only)" is for species X alone (8.4). */
export const powersFor = (rules: Rules, species?: string | null) =>
  rules.powers.filter((p) => { const m = p.name.match(/\((.+?) only\)/); return !species || !m || m[1] === species; });

/** The gift (8.4): how it is used, the drain, madness, and the powers (only the fighter's own, when a species is given). */
export const giftRule = (rules: Rules, species?: string | null): RuleRef => ({
  title: 'The gift: psionic powers', section: rules.section('gift'),
  lines: [['Who', `Only ${rules.crew.limits.giftSpecies.value.join(' and ')}s, at most ${rules.crew.limits.maxGifted.value} in a crew (${rules.crew.limits.giftSpecies.source}, 11.4)`],
    ...rules.data.gift_rules.map((g) => [g.label, g.text] as [string, string]),
    ...powersFor(rules, species).map((p) => [`${p.name} (${p.number})`, p.text] as [string, string])],
});

export const ritesRule = (rules: Rules): RuleRef => ({
  title: 'Rites', section: rules.section('rites'),
  lines: [...rules.advanceDefs.filter((a) => a.name === rules.crew.experience.ritesAdvance.value).map((a) => ['Rites', a.rule] as [string, string]),
    ['Rites', rules.rites.join(', ')],
    ...rules.items.filter((i) => i.kind === 'relic').map((i) => [`${i.name} (${i.rite})`, String(i.rules.Basic ?? '')] as [string, string])],
});

export const factionRuleRef = (rules: Rules, faction: string, n: number): RuleRef | null => {
  const f = rules.faction(faction);
  const r = f?.rules.find((x) => x.n === n);
  return f && r ? { title: `${n}. ${r.name}`, section: f.section, lines: [[f.name, r.text]] } : null;
};

export const sectionRule = (title: string, section: string, text: string): RuleRef => ({ title, section, lines: [['', text]] });
