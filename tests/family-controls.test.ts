import { describe, expect, it } from 'vitest';
import { inviteState } from '@/lib/invite-token';
import { CELEBRATION_COUNT, pickCelebration } from '@/lib/celebration';

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 7, 30, 12, 0, 0);

describe('inviteState', () => {
  it('accepts a fresh unused invite', () => {
    expect(inviteState({ expires_at: new Date(now + HOUR).toISOString(), used_at: null }, now)).toEqual({ valid: true });
  });

  it('rejects an unknown token', () => {
    expect(inviteState(null, now)).toEqual({ valid: false, reason: 'unknown' });
  });

  it('rejects an already redeemed invite even if it has not expired', () => {
    const row = { expires_at: new Date(now + HOUR).toISOString(), used_at: new Date(now - HOUR).toISOString() };
    expect(inviteState(row, now)).toEqual({ valid: false, reason: 'used' });
  });

  it('rejects an expired invite', () => {
    expect(inviteState({ expires_at: new Date(now - 1).toISOString(), used_at: null }, now)).toEqual({
      valid: false,
      reason: 'expired',
    });
  });
});

describe('pickCelebration', () => {
  it('always returns a line that exists in the message files', () => {
    for (let i = 0; i < 200; i += 1) {
      const picked = pickCelebration(null);
      expect(picked).toBeGreaterThanOrEqual(1);
      expect(picked).toBeLessThanOrEqual(CELEBRATION_COUNT);
    }
  });

  it('never repeats the previous line', () => {
    for (let previous = 1; previous <= CELEBRATION_COUNT; previous += 1) {
      for (let i = 0; i < 50; i += 1) {
        expect(pickCelebration(previous)).not.toBe(previous);
      }
    }
  });

  it('stays in range even when random() returns its upper bound', () => {
    expect(pickCelebration(1, () => 0.999999999)).toBe(CELEBRATION_COUNT);
    expect(pickCelebration(1, () => 1)).toBe(CELEBRATION_COUNT);
  });
});
