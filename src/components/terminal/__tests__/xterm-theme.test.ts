import { describe, expect, it } from 'vitest';
import { xtermTheme } from '../xterm-theme';

describe('xtermTheme', () => {
  it('matches the app surfaces per mode', () => {
    expect(xtermTheme('dark')).toMatchObject({ background: '#111111', foreground: '#EDEDED', cursor: '#7170FF' });
    expect(xtermTheme('light')).toMatchObject({ background: '#FFFFFF', foreground: '#171717', cursor: '#5E6AD2' });
  });
});
