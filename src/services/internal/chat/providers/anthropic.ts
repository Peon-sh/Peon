import { createAnthropic } from '@ai-sdk/anthropic';
import { AppError } from '@/lib/errors';
import type { ChatProvider } from './types';

export function createAnthropicChatProvider(): ChatProvider {
  return {
    id: 'anthropic',
    resolveModel(modelId: string, apiKey: string) {
      if (!apiKey.trim()) {
        throw new AppError('Anthropic API key is not configured', 503, 'CHAT_NOT_CONFIGURED');
      }
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    },
    providerOptions() {
      return undefined;
    },
  };
}
