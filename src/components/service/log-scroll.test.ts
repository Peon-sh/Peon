import { describe, expect, it } from 'vitest';
import { isStuckToBottom, STICK_TO_BOTTOM_PX } from './log-scroll';

describe('isStuckToBottom', () => {
  it('stays stuck when the gap is under 48px', () => {
    expect(isStuckToBottom(1000, 960, 40)).toBe(true);
    expect(isStuckToBottom(1000, 1000 - 40 - (STICK_TO_BOTTOM_PX - 1), 40)).toBe(true);
  });

  it('releases when the user has scrolled up by 48px or more', () => {
    expect(isStuckToBottom(1000, 1000 - 40 - STICK_TO_BOTTOM_PX, 40)).toBe(false);
    expect(isStuckToBottom(1000, 0, 40)).toBe(false);
  });
});
