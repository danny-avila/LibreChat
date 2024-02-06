import { FlippedElementPositionsBeforeUpdateReturnVals, GetFlippedElementPositionsBeforeUpdateArgs } from './types';
import { InProgressAnimations } from '../../../types';
export declare const cancelInProgressAnimations: (inProgressAnimations: InProgressAnimations, animatingElements: HTMLElement[]) => void;
declare const getFlippedElementPositionsBeforeUpdate: ({ element, flipCallbacks, inProgressAnimations, portalKey }: GetFlippedElementPositionsBeforeUpdateArgs) => FlippedElementPositionsBeforeUpdateReturnVals;
export default getFlippedElementPositionsBeforeUpdate;
