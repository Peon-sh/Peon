import type { LanguageModel } from 'ai';

export type ChatProviderId = 'openai' | 'anthropic';

export interface ChatModelConfig {
  provider: ChatProviderId;
  modelId: string;
  apiKey: string;
  supportsReasoning?: boolean;
}

export interface ChatProvider {
  id: ChatProviderId;
  resolveModel(modelId: string, apiKey: string): LanguageModel;
  providerOptions(config: ChatModelConfig): Record<string, unknown> | undefined;
}
