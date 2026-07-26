import './env';
import { beforeEach } from 'vitest';
import { resetDatabase } from './db';
import { clearCookies } from './http';
import { clearRateLimitStore } from '@/lib/rate-limit';

beforeEach(async () => {
  clearCookies();
  clearRateLimitStore();
  await resetDatabase();
});
