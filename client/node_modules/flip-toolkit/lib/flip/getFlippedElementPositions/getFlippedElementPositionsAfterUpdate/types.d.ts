import { BaseFlippedElementPositions } from '../types';
export interface FlippedElementPositionDatumAfterUpdate extends BaseFlippedElementPositions {
    transform: string;
    element: HTMLElement;
}
export interface FlippedElementPositionsAfterUpdate {
    [key: string]: FlippedElementPositionDatumAfterUpdate;
}
