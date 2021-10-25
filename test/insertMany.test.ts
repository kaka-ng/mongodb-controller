import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('insertMany', async function (t) {
  t.plan(1)
  const docs = [{ foo: 'bar' }, { bar: 'baz' }]
  const db = await build(t)
  const ctr = new Controller(db.collection('insertMany'))

  t.test('inserted', async function (t) {
    t.plan(9)
    const result = await ctr.insertMany(docs)
    t.equal(result.length, 2)
    if ('foo' in result[0]) {
      t.equal('foo' in result[0], true)
      t.equal('bar' in result[1], true)
    } else {
      t.equal('bar' in result[0], true)
      t.equal('foo' in result[1], true)
    }
    t.equal('id' in result[0], true)
    t.equal('createdAt' in result[0], true)
    t.equal('updatedAt' in result[0], true)
    t.equal('id' in result[1], true)
    t.equal('createdAt' in result[1], true)
    t.equal('updatedAt' in result[1], true)
  })
})
