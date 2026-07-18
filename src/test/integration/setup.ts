import './env';
import { beforeEach } from 'vitest';
import { resetDatabase } from './db';
import { clearCookies } from './http';

beforeEach(async () => {
  clearCookies();
  await resetDatabase();
});
