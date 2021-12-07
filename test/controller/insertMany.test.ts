import t from 'tap'
import { Controller } from '../../lib/controller/default'
import { build } from '../utils/factory'

t.test('insertMany', async function (t) {
  t.plan(4 * 2 + 1)
  const db = await build(t)
  const collection = db.collection('insertMany')

  const ctr = new Controller(collection, { logger: { level: 'silent' } })
  const result = await ctr.insertMany([{ foo: 'bar' }, { bar: 'baz' }])
  t.equal(result.length, 2)
  for (let i = 0; i < result.length; i++) {
    t.equal('id' in result[i], true)
    if ('foo' in result[i]) {
      t.equal('foo' in result[i], true)
    } else {
      t.equal('bar' in result[i], true)
    }
    t.equal('createdAt' in result[i], true)
    t.equal('updatedAt' in result[i], true)
  }
})
