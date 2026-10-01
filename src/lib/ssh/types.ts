export interface SshTarget {
  id: string;
  host: string;
  port: number;
  username: string;
  privateKey: string;
  /** SSH ready timeout in ms (from server connectionTimeout when available). */
  readyTimeoutMs?: number;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type LogSink = (chunk: string, stream: 'stdout' | 'stderr') => void;
