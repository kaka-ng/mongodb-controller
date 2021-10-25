import t from 'tap'
import Controller from '../lib'
import { build } from './utils/factory'

t.plan(1)
t.test('constructor', async function (t) {
  t.plan(1)

  const docs = [{ foo: 'bar' }, { bar: 'baz' }, { hello: 'world' }]
  const db = await build(t)
  const controller = new Controller(db.collection('search'))
  await controller.insertMany(docs)

  t.test('empty', async function (t) {
    t.plan(4)
    const result = await controller.search()
    t.equal(result.length, 3)
    t.equal(result[0].foo, 'bar')
    t.equal(result[1].bar, 'baz')
    t.equal(result[2].hello, 'world')
  })
})
