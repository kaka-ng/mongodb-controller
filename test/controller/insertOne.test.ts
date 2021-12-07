import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('insertOne', async function (t) {
  t.plan(5)
  const db = await build(t)
  const collection = db.collection('insertOne')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  const result = await ctr.insertOne({ foo: 'bar' })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }
})
