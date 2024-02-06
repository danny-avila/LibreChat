import * as React from 'react';
import { SideCarComponent, SideCarMedium } from './types';
export declare function exportSidecar<T>(medium: SideCarMedium<T>, exported: React.ComponentType<T>): SideCarComponent<T>;
