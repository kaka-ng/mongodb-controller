import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('updateOne', async function (t) {
  t.plan(2)
  const docs = { foo: 'bar' }
  const db = await build(t)
  const ctr = new Controller(db.collection('updateOne'))
  await ctr.insertMany([docs, docs, docs])

  t.test('1 result', async function (t) {
    t.plan(5)
    const result = await ctr.updateOne({}, {
      bar: 'baz'
    })
    t.ok(result)
    if (result !== null) {
      t.equal('bar' in result, true)
      t.equal('id' in result, true)
      t.equal('createdAt' in result, true)
      t.equal('updatedAt' in result, true)
    }
  })

  t.test('updatequery', async function (t) {
    t.plan(5)
    const result = await ctr.updateOne({}, {
      $set: {
        hello: 'world'
      }
    })
    t.ok(result)
    if (result !== null) {
      t.equal('hello' in result, true)
      t.equal('id' in result, true)
      t.equal('createdAt' in result, true)
      t.equal('updatedAt' in result, true)
    }
  })
})
