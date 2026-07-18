import { describe, expect, it } from 'vitest';
import {
  buildPreviewFqdn,
  buildPreviewHostname,
  parseWildcardBaseHost,
  previewLabelFromCommitSha,
} from '../preview-fqdn';

describe('parseWildcardBaseHost', () => {
  it('strips scheme, path, and wildcard prefix', () => {
    expect(parseWildcardBaseHost('https://preview.peon.sh/path')).toBe('preview.peon.sh');
    expect(parseWildcardBaseHost('*.preview.peon.sh')).toBe('preview.peon.sh');
    expect(parseWildcardBaseHost('Preview.Example.COM')).toBe('preview.example.com');
  });
});

describe('previewLabelFromCommitSha', () => {
  it('returns a short lowercase label', () => {
    expect(previewLabelFromCommitSha('Abc1234Def5678')).toBe('abc1234');
  });
});

describe('buildPreviewFqdn', () => {
  it('builds https://{sha}.{wildcard}', () => {
    expect(buildPreviewHostname('deadbeefcafebabe', 'https://preview.peon.sh')).toBe(
      'deadbee.preview.peon.sh',
    );
    expect(buildPreviewFqdn('deadbeefcafebabe', 'https://preview.peon.sh')).toBe(
      'https://deadbee.preview.peon.sh',
    );
  });

  it('returns null without a wildcard domain', () => {
    expect(buildPreviewFqdn('abc', '')).toBeNull();
  });
});
