import { AnimateUnflippedElementsArgs } from './types';
declare const animateUnflippedElements: ({ unflippedIds, flipCallbacks, getElement, flippedElementPositionsBeforeUpdate, flippedElementPositionsAfterUpdate, inProgressAnimations, decisionData }: AnimateUnflippedElementsArgs) => {
    hideEnteringElements: () => void;
    animateEnteringElements: () => void;
    animateExitingElements: () => Promise<void>;
};
export default animateUnflippedElements;
