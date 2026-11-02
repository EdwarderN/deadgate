// Crews from share links and files come from other people: the app must refuse odd or oversized ones.
import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { crewOf, rules } from './helpers';
import { finishCreation } from '../src/engine/crew';
import { newCrew } from '../src/engine/crew';
import { crewFromShare, crewToJson, isCrew, parseCrewJson, safeColour } from '../src/store';

const share = (x: unknown) => `#share=${LZString.compressToEncodedURIComponent(JSON.stringify(x))}`;

describe('store safety', () => {
  it('accepts a crew the app made, by file and by share link', () => {
    const c = { ...newCrew(rules), name: 'Rust Rats', tape: 'yellow' };
    expect(isCrew(c)).toBe(true);
    expect(parseCrewJson(crewToJson(c)).name).toBe('Rust Rats');
    expect(crewFromShare(share(c))?.name).toBe('Rust Rats');
    for (const f of rules.factions) {
      const full = finishCreation(rules, crewOf(f.name));
      expect(isCrew(full), f.name).toBe(true);
    }
  });
  it('refuses wrong shapes, odd ids and oversized text', () => {
    const c = newCrew(rules);
    expect(isCrew({ ...c, id: '"><img src=x>' })).toBe(false);
    expect(isCrew({ ...c, schema: 2 })).toBe(false);
    expect(isCrew({ ...c, name: 'x'.repeat(5000) })).toBe(false);
    expect(isCrew({ ...c, notes: { ...c.notes, stash: 'x'.repeat(10000) } })).toBe(false);
    expect(isCrew({ ...c, parts: Infinity })).toBe(false);
    let deep: unknown = 'x';
    for (let i = 0; i < 20; i++) deep = { a: deep };
    expect(isCrew({ ...c, notes: deep })).toBe(false);
    expect(() => parseCrewJson('{"hello":1}')).toThrow();
    expect(() => parseCrewJson(' '.repeat(1_000_001))).toThrow();
    expect(crewFromShare('#share=garbage')).toBeNull();
    expect(crewFromShare(share({ ...c, id: 'javascript:alert(1)' }))).toBeNull();
  });
  it('lets only plain colours into styles', () => {
    expect(safeColour('yellow')).toBe('yellow');
    expect(safeColour('#A0b1C2')).toBe('#a0b1c2');
    expect(safeColour('url(https://tracker.example/x.png)')).toBeUndefined();
    expect(safeColour('red; background: url(x)')).toBeUndefined();
    expect(safeColour('expression(alert(1))')).toBeUndefined();
    expect(safeColour('')).toBeUndefined();
  });
});
