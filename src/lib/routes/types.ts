export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteConfig {
  path: string;
  /** Publicly accessible without authentication. */
  isPublic?: boolean;
  /** Requires the user to be an instance admin. */
  instanceAdminOnly?: boolean;
}
