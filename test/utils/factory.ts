import { Db, MongoClient } from 'mongodb'
import { promisify } from 'util'
import { createMongoDB } from './mongodb'
const sleep = promisify(setTimeout)

export async function build (t: any): Promise<Db> {
  const o = await createMongoDB()
  process.env.MONGODB_URL = o.uri
  const connection = await MongoClient.connect(o.uri)
  const db = await connection.db()

  t.teardown(async function () {
    // we need to wait some time before exit
    // main reason is mongodb is still processing data
    await sleep(500)
    await connection.close()
    await o.mongodb.stop()
  })

  return db
}
