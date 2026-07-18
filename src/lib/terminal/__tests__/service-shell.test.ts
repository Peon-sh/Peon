import { describe, expect, it } from 'vitest';
import { dockerExecInteractiveCommand } from '../service-shell';

describe('dockerExecInteractiveCommand', () => {
  it('forces a visible $ prompt and prefers bash without rc files', () => {
    const cmd = dockerExecInteractiveCommand('svc_abc123');

    expect(cmd).toContain("docker exec -it");
    expect(cmd).toContain("-e PS1='$ '");
    expect(cmd).toContain("'svc_abc123'");
    expect(cmd).toContain('bash --norc --noprofile -i');
    expect(cmd).toContain('export PS1="$ "');
    expect(cmd).toContain('ENV=/dev/null');
  });

  it('shell-quotes container names with special characters', () => {
    const cmd = dockerExecInteractiveCommand("app's-container");
    expect(cmd).toContain(`'app'\\''s-container'`);
  });
});
