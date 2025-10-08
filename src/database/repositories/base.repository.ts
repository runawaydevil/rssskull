import type { PrismaClient } from '@prisma/client';

export interface BaseRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>;
  findMany(where?: Record<string, unknown>): Promise<T[]>;
  create(data: CreateInput): Promise<T>;
  update(id: string, data: UpdateInput): Promise<T>;
  delete(id: string): Promise<void>;
}

export abstract class AbstractRepository<T, CreateInput, UpdateInput>
  implements BaseRepository<T, CreateInput, UpdateInput>
{
  constructor(protected prisma: PrismaClient) {}

  abstract findById(id: string): Promise<T | null>;
  abstract findMany(where?: Record<string, unknown>): Promise<T[]>;
  abstract create(data: CreateInput): Promise<T>;
  abstract update(id: string, data: UpdateInput): Promise<T>;
  abstract delete(id: string): Promise<void>;
}
