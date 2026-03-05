/**
 * @taktician/model-resolver
 * Model resolution utilities for Taktician
 */

// Re-export constants from types
export {
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  DEFAULT_MODELS,
  type ModelAlias,
  type CursorModelId,
} from '@taktician/types';

// Export resolver functions
export {
  resolveModelString,
  getEffectiveModel,
  resolvePhaseModel,
  type ResolvedPhaseModel,
} from './resolver.js';
