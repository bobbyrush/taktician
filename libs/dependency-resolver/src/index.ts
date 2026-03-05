/**
 * @taktician/dependency-resolver
 * Feature dependency resolution for Taktician
 */

export {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  createFeatureMap,
  getBlockingDependenciesFromMap,
  wouldCreateCircularDependency,
  dependencyExists,
  getAncestors,
  formatAncestorContextForPrompt,
  type DependencyResolutionResult,
  type DependencySatisfactionOptions,
  type AncestorContext,
} from './resolver.js';
