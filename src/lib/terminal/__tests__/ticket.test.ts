import { describe, expect, it } from 'vitest';
import { mintTerminalTicket, verifyTerminalTicket } from '../ticket';

describe('terminal ticket', () => {
  it('round-trips mint and verify for server tickets', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-16-chars';
    const ticket = await mintTerminalTicket({
      kind: 'server',
      serverId: 'srv_1',
      userId: 'usr_1',
      cols: 100,
      rows: 30,
    });
    const payload = await verifyTerminalTicket(ticket);
    expect(payload).toMatchObject({
      purpose: 'terminal',
      kind: 'server',
      serverId: 'srv_1',
      userId: 'usr_1',
      cols: 100,
      rows: 30,
    });
  });

  it('round-trips mint and verify for service tickets', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-16-chars';
    const ticket = await mintTerminalTicket({
      kind: 'service',
      serviceId: 'svc_1',
      userId: 'usr_1',
      cols: 80,
      rows: 24,
    });
    const payload = await verifyTerminalTicket(ticket);
    expect(payload).toMatchObject({
      purpose: 'terminal',
      kind: 'service',
      serviceId: 'svc_1',
      userId: 'usr_1',
      cols: 80,
      rows: 24,
    });
  });

  it('rejects non-terminal tokens', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-16-chars';
    await expect(verifyTerminalTicket('not-a-jwt')).rejects.toThrow();
  });
});
