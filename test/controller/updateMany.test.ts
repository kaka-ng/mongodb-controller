import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('updateMany', async function (t) {
  t.plan(5 * 6 + 2)
  const db = await build(t)
  const collection = db.collection('updateMany')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  await ctr.insertMany([{ foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }])

  let result = await ctr.updateMany({}, { foo: 'baz' })
  t.equal(result.length, 3)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal(result[i].foo, 'baz')
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }

  result = await ctr.updateMany({}, { $set: { foo: 'foo' } })
  t.equal(result.length, 3)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    t.equal('foo' in result[i], true)
    t.equal(result[i].foo, 'foo')
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }
})
