import { exportSidecar } from 'use-sidecar';
import { RemoveScrollSideCar } from './SideEffect';
import { effectCar } from './medium';
export default exportSidecar(effectCar, RemoveScrollSideCar);
