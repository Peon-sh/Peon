export interface SshTarget {
  id: string;
  host: string;
  port: number;
  username: string;
  privateKey: string;
  /** SSH ready timeout in ms (from server connectionTimeout when available). */
  readyTimeoutMs?: number;
  /** Trusted host key (`SHA256:…`). Null/undefined means "learn it on this connect". */
  hostKeyFingerprint?: string | null;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type LogSink = (chunk: string, stream: 'stdout' | 'stderr') => void;
