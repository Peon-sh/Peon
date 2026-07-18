import { describe, expect, it } from 'vitest';
import {
  inviteWorkspaceMemberSchema,
  updateMemberRoleSchema,
  updateProjectMemberRoleSchema,
  updateProjectSchema,
} from '../workspace.schema';

describe('workspace member role schemas', () => {
  it('rejects OWNER for invite and role change', () => {
    expect(() => inviteWorkspaceMemberSchema.parse({ email: 'a@b.com', role: 'OWNER' })).toThrow();
    expect(() => updateMemberRoleSchema.parse({ role: 'OWNER' })).toThrow();
  });

  it('accepts ADMIN, BILLING_ADMIN, and MEMBER', () => {
    expect(inviteWorkspaceMemberSchema.parse({ email: 'a@b.com', role: 'ADMIN' }).role).toBe('ADMIN');
    expect(updateMemberRoleSchema.parse({ role: 'MEMBER' }).role).toBe('MEMBER');
  });
});


describe('updateProjectSchema', () => {
  it('accepts name, description, and wildcard domain updates', () => {
    const parsed = updateProjectSchema.parse({
      name: 'Ops',
      description: null,
      wildcardDomain: 'https://apps.example.com',
    });
    expect(parsed).toEqual({
      name: 'Ops',
      description: null,
      wildcardDomain: 'https://apps.example.com',
    });
  });

  it('rejects an empty name', () => {
    expect(() => updateProjectSchema.parse({ name: '' })).toThrow();
  });
});

describe('updateProjectMemberRoleSchema', () => {
  it('accepts ADMIN and MEMBER', () => {
    expect(updateProjectMemberRoleSchema.parse({ role: 'ADMIN' })).toEqual({ role: 'ADMIN' });
    expect(updateProjectMemberRoleSchema.parse({ role: 'MEMBER' })).toEqual({ role: 'MEMBER' });
  });

  it('rejects workspace-only roles', () => {
    expect(() => updateProjectMemberRoleSchema.parse({ role: 'OWNER' })).toThrow();
  });
});
