import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('deleteOne', async function (t) {
  t.plan(4 + 1)
  const db = await build(t)
  const collection = db.collection('deleteOne')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  const result = await ctr.deleteOne({})
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }
})
