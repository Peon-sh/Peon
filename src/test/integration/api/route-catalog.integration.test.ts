import { describe, expect, it } from 'vitest';
import { clearCookies, http } from '@/test/integration/http';

describe('API route HTTP smoke', () => {
  it('serves the public health route from the live Next.js server', async () => {
    const result = await http.get('/api/health');

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true });
  });

  it('protects representative authenticated routes', async () => {
    clearCookies();
    const results = await Promise.all([
      http.get('/api/auth/me'),
      http.get('/api/workspaces'),
      http.get('/api/chat/threads', { searchParams: { workspaceId: 'missing' } }),
      http.post('/api/workspaces', { body: { name: 'Unauthorized' } }),
    ]);

    for (const result of results) {
      expect(result.status).toBe(401);
    }
  });

  it('reaches representative public POST routes without server errors', async () => {
    clearCookies();
    const results = await Promise.all([
      http.post('/api/auth/login', { body: { email: 'bad', password: '' } }),
      http.post('/api/auth/signup', { body: { email: 'bad' } }),
      http.post('/api/v1/agents/push', { body: {} }),
      http.post('/api/webhooks/source/github/events', { body: {} }),
    ]);

    for (const result of results) {
      expect(result.status).toBeLessThan(500);
    }
  });
});
