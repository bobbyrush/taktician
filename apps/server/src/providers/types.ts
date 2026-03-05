/**
 * Shared types for AI model providers
 *
 * Re-exports types from @taktician/types for consistency across the codebase.
 * All provider types are defined in @taktician/types to avoid duplication.
 */

// Re-export all provider types from @taktician/types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
  AgentDefinition,
  ReasoningEffort,
  SystemPromptPreset,
} from '@taktician/types';
