import { MongoMemoryServer } from 'mongodb-memory-server'

export async function createMongoDB (): Promise<{ uri: string, mongodb: MongoMemoryServer }> {
  const mongodb = await MongoMemoryServer.create()
  return {
    uri: mongodb.getUri(),
    mongodb
  }
}
