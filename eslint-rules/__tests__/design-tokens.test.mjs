import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'vitest';
import rule from '../design-tokens.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run('no-off-scale-classes', rule, {
  valid: [
    { code: '<div className="text-sm font-medium bg-muted text-success" />' },
    { code: 'cn("text-base", active && "text-primary")' },
    { code: '<div className="text-[var(--x)]" />' },
  ],
  invalid: [
    { code: '<div className="text-[11px]" />', errors: [{ messageId: 'offScale' }] },
    { code: '<div className="font-bold" />', errors: [{ messageId: 'offScale' }] },
    { code: '<div className="bg-amber-500" />', errors: [{ messageId: 'offScale' }] },
    { code: 'cn("border-zinc-700")', errors: [{ messageId: 'offScale' }] },
    { code: 'cva("text-[12.5px]", {})', errors: [{ messageId: 'offScale' }] },
    { code: '<div className={`x ${y} text-emerald-500`} />', errors: [{ messageId: 'offScale' }] },
  ],
});
