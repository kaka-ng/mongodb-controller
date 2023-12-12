import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('deleteById', async function (t) {
  t.plan(5 + 1)
  const db = await build(t)
  const collection = db.collection('deleteById')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  const inserted = await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  const result = await ctr.deleteById(inserted[0].id as string)
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal(result.id, inserted[0].id)
    t.equal('foo' in result, true)
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }
})
