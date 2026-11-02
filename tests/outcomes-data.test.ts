import { describe, expect, it } from 'vitest';
import { rules } from './helpers';
import { plain, type Eff } from '../src/data/rules';
import { cellCovers } from '../src/engine/dice';

const O = rules.outcomes;
const walk = (effs: Eff[], fn: (e: Eff) => void) => {
  for (const e of effs) {
    fn(e);
    for (const c of e.choice ?? []) walk(c.effects, fn);
    for (const d of e.d6 ?? []) walk(d.effects, fn);
    walk(e.success ?? [], fn);
    walk(e.failure ?? [], fn);
  }
};
const all = (): Eff[] => {
  const out: Eff[] = [];
  const add = (l: Eff[] | undefined) => l && walk(l, (e) => out.push(e));
  for (const t of Object.values(O.storyEvents)) for (const r of Object.values(t)) { add(r.accept); add(r.pay); add(r.twist?.success); add(r.twist?.failure); }
  for (const t of Object.values(O.injuryTables)) for (const r of Object.values(t)) add(r);
  for (const t of Object.values(O.taskBase)) { add(t.success); add(t.failure); }
  for (const t of Object.values(O.taskTables)) for (const r of Object.values(t)) add(r);
  for (const t of Object.values(O.ownTasks)) { add(t.success); add(t.failure); for (const r of Object.values(t.table)) add(r); }
  for (const r of Object.values(O.finds)) add(r);
  for (const r of Object.values(O.dropTable)) add(r);
  return out;
};

describe('outcomes.json covers every table row in the book', () => {
  it('story events: every row and d6, with Pay and Twist exactly where the book has them', () => {
    for (const [k, rows] of Object.entries(rules.data.story_events)) {
      expect(O.storyEvents[k], k).toBeTruthy();
      for (const r of rows) {
        const e = O.storyEvents[k][r.d6];
        expect(e, `${k} ${r.d6}`).toBeTruthy();
        expect(!!e.pay, `${k} ${r.d6} pay`).toBe(r.Pay !== 'None');
        expect(!!e.twist, `${k} ${r.d6} twist`).toBe(r.Twist !== 'None');
        if (e.twist) expect(plain(r.Twist).startsWith(`${e.twist.rating}:`), `${k} ${r.d6} twist rating`).toBe(true);
      }
      expect(Object.keys(O.storyEvents[k]).length).toBe(rows.length);
    }
    expect(Object.keys(O.storyEvents).length).toBe(Object.keys(rules.data.story_events).length);
  });
  it('injury tables: the same row labels as the book', () => {
    for (const [k, rows] of Object.entries(rules.data.injury_tables)) expect(Object.keys(O.injuryTables[k]).sort(), k).toEqual(rows.map((r) => r.d66).sort());
  });
  it('tasks, their tables, own tasks, finds and the drop table', () => {
    expect(Object.keys(O.taskBase).sort()).toEqual(rules.data.tasks.map((t) => plain(t.Task)).sort());
    for (const [k, rows] of Object.entries(rules.data.task_tables)) expect(Object.keys(O.taskTables[k]).sort(), k).toEqual(rows.map((r) => r['2d6']).sort());
    for (const f of rules.factions) expect(Object.keys(O.ownTasks[f.name].table).sort(), f.name).toEqual(f.ownTaskTable.map((r) => r.d6).sort());
    expect(Object.keys(O.finds).sort()).toEqual(rules.data.finds.map((r) => r.d6).sort());
    expect(Object.keys(O.dropTable).sort()).toEqual(rules.data.drop_table.map((r) => r.d66).sort());
  });
  it('every d6 split covers 1 to 6', () => {
    for (const e of all()) if (e.d6) for (let n = 1; n <= 6; n++) expect(e.d6.filter((d) => cellCovers(d.range.replace(' to ', '-'), n)).length).toBe(1);
  });
});

describe('every name in outcomes.json exists', () => {
  it('tags, statuses, states, silly traits, items, ratings, who', () => {
    const tags = rules.tags.map((t) => t.name);
    const statuses = rules.crew.campaign.statuses.value;
    const next = [...rules.data.states.map((s) => plain(s.State)), ...rules.crew.battle.positions.value.map((p) => p.name)];
    const silly = rules.silly.map((s) => s.name);
    const lists = Array.from(new Set(rules.injuries.map((i) => i.table)));
    const types = rules.factions.flatMap((f) => f.types.map((t) => t.name));
    const who = ['self', 'choose', 'all', 'patient', 'teacher', 'captain', 'lowestXp', 'evacuated', 'legend', 'bot'];
    const kinds = new Set(rules.items.map((i) => i.kind));
    for (const e of all()) {
      if (e.tag) expect(tags).toContain(e.tag);
      if (e.status) expect(statuses).toContain(e.status);
      if (e.next) expect(next).toContain(e.next);
      if (e.silly) expect(silly).toContain(e.silly);
      if (e.injuryRoll) expect(lists).toContain(e.injuryRoll);
      if (e.injury) expect(rules.injuries.some((i) => i.name === e.injury)).toBe(true);
      if (e.test) expect(rules.crew.limits.ratingNames.value).toContain(e.test.rating);
      if (e.contact && e.contact !== 'choose' && rules.contacts.every((c) => c.name !== e.contact)) expect(e.contact).toMatch(/^The /); // a faction as a contact
      for (const w of [e.who, e.noTask, e.gift, e.healInjury, e.prosthetic, e.leave, e.loseItem?.who, e.sellItem?.who].filter(Boolean) as string[]) {
        if (w.startsWith('type:')) expect(types).toContain(w.slice(5)); else expect(who).toContain(w);
      }
      if (e.item?.key) expect(rules.items.some((i) => i.key === e.item!.key && (!e.item!.source || i.source === e.item!.source)), e.item.key).toBe(true);
      for (const k of [...(e.item?.kinds ?? []), ...(e.loseItem?.kinds ?? []), ...(e.sellItem?.kinds ?? [])]) expect(kinds.has(k), k).toBe(true);
    }
  });
});
