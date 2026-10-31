import type { Camera } from '@ayko/contracts';
import { asc, eq } from 'drizzle-orm';
import type { CameraRepository } from '../../../domain/cameras/repositories/CameraRepository.js';
import type { Db } from '../client.js';
import { cameras } from '../schema.js';

export class DrizzleCameraRepository implements CameraRepository {
  constructor(private readonly db: Db) {}

  async list() {
    return this.db.select().from(cameras).orderBy(asc(cameras.name)).all();
  }

  async find(id: string) {
    return this.db.select().from(cameras).where(eq(cameras.id, id)).get() ?? null;
  }

  async save(camera: Camera) {
    const { id: _id, createdAt: _createdAt, ...update } = camera;
    this.db
      .insert(cameras)
      .values(camera)
      .onConflictDoUpdate({ target: cameras.id, set: update })
      .run();
  }

  async delete(id: string) {
    this.db.delete(cameras).where(eq(cameras.id, id)).run();
  }
}
