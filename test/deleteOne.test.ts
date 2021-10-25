import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('deleteOne', async function (t) {
  t.plan(1)
  const docs = { foo: 'bar' }
  const db = await build(t)
  const ctr = new Controller(db.collection('deleteOne'))
  await ctr.insertMany([docs, docs, docs])

  t.test('1 result', async function (t) {
    t.plan(5)
    const result = await ctr.deleteOne({})
    t.ok(result)
    if (result !== null) {
      t.equal('foo' in result, true)
      t.equal('id' in result, true)
      t.equal('createdAt' in result, true)
      t.equal('updatedAt' in result, true)
    }
  })
})
