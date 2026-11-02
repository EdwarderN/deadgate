// The gift (8.4): its rules and powers come from the book, and each species sees only its own.
import { describe, expect, it } from 'vitest';
import { rules } from './helpers';
import { giftRule, powersFor } from '../src/ui/rule';

describe('psionic gift', () => {
  it('has the book paragraphs for using it, the drain and madness', () => {
    expect(rules.data.gift_rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.powers.length).toBeGreaterThan(0);
  });
  it('shows a species only the powers it may use', () => {
    for (const sp of rules.crew.limits.giftSpecies.value) {
      const mine = powersFor(rules, sp);
      expect(mine.length).toBeGreaterThan(0);
      for (const p of mine) {
        const only = p.name.match(/\((.+?) only\)/);
        if (only) expect(only[1]).toBe(sp);
      }
      expect(giftRule(rules, sp).lines.length).toBe(1 + rules.data.gift_rules.length + mine.length);
    }
    expect(powersFor(rules).length).toBe(rules.powers.length);
  });
});
