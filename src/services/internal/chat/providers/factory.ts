import type { LanguageModel } from 'ai';
import { AppError } from '@/lib/errors';
import { createAnthropicChatProvider } from './anthropic';
import { createOpenAiChatProvider } from './openai';
import type { ChatModelConfig, ChatProvider, ChatProviderId } from './types';

const providers: Record<ChatProviderId, () => ChatProvider> = {
  openai: createOpenAiChatProvider,
  anthropic: createAnthropicChatProvider,
};

export function getChatProvider(providerId: ChatProviderId): ChatProvider {
  const factory = providers[providerId];
  if (!factory) {
    throw new AppError(`Unknown chat provider: ${providerId}`, 400, 'UNKNOWN_CHAT_PROVIDER');
  }
  return factory();
}

export function resolveLanguageModel(config: ChatModelConfig): {
  model: LanguageModel;
  config: ChatModelConfig;
  provider: ChatProvider;
} {
  if (!config.apiKey?.trim()) {
    throw new AppError(
      'Configure an LLM API key in workspace settings before chatting',
      503,
      'CHAT_NOT_CONFIGURED',
    );
  }
  const provider = getChatProvider(config.provider);
  return {
    model: provider.resolveModel(config.modelId, config.apiKey),
    config,
    provider,
  };
}
