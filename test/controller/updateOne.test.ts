import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('updateOne', async function (t) {
  t.plan(6 * 3)
  const db = await build(t)
  const collection = db.collection('updateOne')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  let result = await ctr.updateOne({}, { foo: 'baz' })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal(result.foo, 'baz')
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }

  result = await ctr.findOne({ foo: 'baz' })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal(result.foo, 'baz')
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }

  result = await ctr.updateOne({ foo: 'baz' }, { $set: { foo: 'foo' } })
  t.ok(result)
  if (result !== null) {
    t.equal('id' in result, true)
    t.equal('foo' in result, true)
    t.equal(result.foo, 'foo')
    t.equal('createdAt' in result, true)
    t.equal('updatedAt' in result, true)
  }
})
