import type { ITheme } from '@xterm/xterm';

export function xtermTheme(mode: 'dark' | 'light'): ITheme {
  return mode === 'dark'
    ? {
        background: '#111111',
        foreground: '#EDEDED',
        cursor: '#7170FF',
        selectionBackground: 'rgba(113, 112, 255, 0.35)',
        black: '#111111', red: '#F0575B', green: '#4ADE80', yellow: '#FBBF24',
        blue: '#60A5FA', magenta: '#7170FF', cyan: '#22D3EE', white: '#EDEDED',
        brightBlack: '#6B6B6B', brightRed: '#F0575B', brightGreen: '#4ADE80', brightYellow: '#FBBF24',
        brightBlue: '#60A5FA', brightMagenta: '#7170FF', brightCyan: '#22D3EE', brightWhite: '#FFFFFF',
      }
    : {
        background: '#FFFFFF',
        foreground: '#171717',
        cursor: '#5E6AD2',
        selectionBackground: 'rgba(94, 106, 210, 0.25)',
        black: '#171717', red: '#DC2626', green: '#16A34A', yellow: '#D97706',
        blue: '#2563EB', magenta: '#5E6AD2', cyan: '#0891B2', white: '#F4F4F5',
        brightBlack: '#6B6B6B', brightRed: '#DC2626', brightGreen: '#16A34A', brightYellow: '#D97706',
        brightBlue: '#2563EB', brightMagenta: '#5E6AD2', brightCyan: '#0891B2', brightWhite: '#FFFFFF',
      };
}
