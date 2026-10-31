import type { Camera } from '@ayko/contracts';

export interface CameraRepository {
  list(): Promise<Camera[]>;
  find(id: string): Promise<Camera | null>;
  save(camera: Camera): Promise<void>;
  delete(id: string): Promise<void>;
}
