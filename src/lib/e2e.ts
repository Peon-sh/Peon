/** Runtime flag for HTTP API integration tests against a live Next server. */
export function isE2eMode(): boolean {
  return process.env.PEON_E2E === '1';
}
