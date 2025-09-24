import { useRecoilValue } from 'recoil';
import {
  openRouterModelsListState,
  openRouterSortKeyState,
  openRouterSortDirState,
  openRouterFilterNoTrainState,
  type OpenRouterModel,
} from '~/store/openrouter';
import { filterModelsByPrivacy, sortModels } from '~/utils/openRouterPrivacy';

/**
 * Hook replacement for openRouterModelsDerivedSelector
 * Returns sorted and filtered OpenRouter models
 */
export function useOpenRouterModelsDerived(): OpenRouterModel[] {
  const models = useRecoilValue(openRouterModelsListState);
  const sortKey = useRecoilValue(openRouterSortKeyState);
  const sortDir = useRecoilValue(openRouterSortDirState);
  const filterNoTrain = useRecoilValue(openRouterFilterNoTrainState);

  // Separate Auto Router from other models
  const autoRouter = models.find(m => m.id === 'openrouter/auto');
  const otherModels = models.filter(m => m.id !== 'openrouter/auto');

  // Apply privacy filter
  const filtered = filterModelsByPrivacy(otherModels, filterNoTrain);

  // Apply sorting
  const sorted = sortModels(filtered, sortKey, sortDir);

  // Return with Auto Router pinned at top
  return autoRouter ? [autoRouter, ...sorted] : sorted;
}