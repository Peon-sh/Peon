import type { Readable } from 'node:stream';

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | Readable;
  contentType: string;
  /** Object should be readable without a signed URL (avatars, screenshots). */
  publicRead?: boolean;
  cacheControl?: string;
  /** Set when streaming and the length is known; some backends require it. */
  contentLength?: number;
}

export interface StoredObject {
  key: string;
  /** Stable URL for the object. Local storage returns an app-relative path. */
  url: string;
}

/**
 * Platform object storage: deployment screenshots and profile avatars.
 *
 * Distinct from per-workspace `S3Storage` rows, which are user-configured backup
 * destinations with their own credentials and are not routed through here.
 */
export interface StorageProvider {
  readonly name: 'local' | 's3';

  put(input: PutObjectInput): Promise<StoredObject>;

  /** Raw bytes, or null when the object is absent. */
  get(key: string): Promise<Buffer | null>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * Time-limited read URL. Local storage returns a normal app URL because access
   * is already gated by the session.
   */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Presigned upload target for browser-direct PUT, or null when the backend
   * cannot offer one — the caller then uploads through the app instead.
   */
  presignedUpload?(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<{ url: string; fields?: Record<string, string> } | null>;
}
