import { SignJWT, jwtVerify } from 'jose';

export type TerminalTicketKind = 'server' | 'service';

export type TerminalTicketPayload = {
  purpose: 'terminal';
  kind: TerminalTicketKind;
  /** Present when kind === 'server' (also set for legacy tickets). */
  serverId?: string;
  /** Present when kind === 'service'. */
  serviceId?: string;
  userId: string;
  cols?: number;
  rows?: number;
};

function secretKey(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET must be set');
  return new TextEncoder().encode(raw);
}

/** Short-lived ticket that authorizes a browser WebSocket to open a remote PTY. */
export async function mintTerminalTicket(
  input: {
    kind: TerminalTicketKind;
    serverId?: string;
    serviceId?: string;
    userId: string;
    cols?: number;
    rows?: number;
  },
  expiresIn = '2m',
): Promise<string> {
  if (input.kind === 'server' && !input.serverId) {
    throw new Error('serverId is required for server terminal tickets.');
  }
  if (input.kind === 'service' && !input.serviceId) {
    throw new Error('serviceId is required for service terminal tickets.');
  }

  return new SignJWT({
    purpose: 'terminal',
    kind: input.kind,
    serverId: input.serverId,
    serviceId: input.serviceId,
    userId: input.userId,
    cols: input.cols,
    rows: input.rows,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifyTerminalTicket(token: string): Promise<TerminalTicketPayload> {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
  if (payload.purpose !== 'terminal' || typeof payload.userId !== 'string') {
    throw new Error('Invalid terminal ticket.');
  }

  const kind: TerminalTicketKind =
    payload.kind === 'service'
      ? 'service'
      : payload.kind === 'server'
        ? 'server'
        : // Legacy tickets only carried serverId.
          typeof payload.serverId === 'string'
          ? 'server'
          : (() => {
              throw new Error('Invalid terminal ticket.');
            })();

  if (kind === 'server' && typeof payload.serverId !== 'string') {
    throw new Error('Invalid terminal ticket.');
  }
  if (kind === 'service' && typeof payload.serviceId !== 'string') {
    throw new Error('Invalid terminal ticket.');
  }

  return {
    purpose: 'terminal',
    kind,
    serverId: typeof payload.serverId === 'string' ? payload.serverId : undefined,
    serviceId: typeof payload.serviceId === 'string' ? payload.serviceId : undefined,
    userId: payload.userId,
    cols: typeof payload.cols === 'number' ? payload.cols : undefined,
    rows: typeof payload.rows === 'number' ? payload.rows : undefined,
  };
}
