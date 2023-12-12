import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('updateById', async function (t) {
  t.plan(7 * 2)
  const db = await build(t)
  const collection = db.collection('updateById')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  const inserted = await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  let result = await ctr.updateById(inserted[0].id as string, { foo: 'baz' })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal(result.id, inserted[0].id)
    t.equal('foo' in result, true)
    t.equal(result.foo, 'baz')
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }

  result = await ctr.updateById(inserted[1].id as string, { $set: { foo: 'foo' } })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal(result.id, inserted[1].id)
    t.equal('foo' in result, true)
    t.equal(result.foo, 'foo')
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }
})
