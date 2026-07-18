import { describe, expect, it } from 'vitest';
import { privateKeyPemFilename } from '../filename';

describe('privateKeyPemFilename', () => {
  it('slugifies the key name and adds .pem', () => {
    expect(privateKeyPemFilename('Peon DW')).toBe('peon-dw.pem');
  });

  it('falls back when the name has no usable characters', () => {
    expect(privateKeyPemFilename('!!!')).toBe('private-key.pem');
  });
});
