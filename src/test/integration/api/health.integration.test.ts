import { describe, expect, it } from 'vitest';
import { http } from '@/test/integration/http';

describe('GET /api/health', () => {
  it('reports the application as healthy', async () => {
    const result = await http.get('/api/health');

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true });
  });
});
