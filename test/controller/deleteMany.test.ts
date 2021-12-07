import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('deleteMany', async function (t) {
  t.plan(4 * 3)
  const db = await build(t)
  const collection = db.collection('deleteMany')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  const result = await ctr.deleteMany({})
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }
})
