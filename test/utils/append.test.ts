import t from 'tap'
import { appendBasicSchema, appendUpdateSchema } from '../../lib/utils/append'

t.test('pass non-document to appendBasicSchema', function (t) {
  t.plan(3)
  const result = appendBasicSchema(undefined as any)
  t.equal('id' in result, true, 'should add "id"')
  t.equal('createdAt' in result, true, 'should add "createdAt"')
  t.equal('updatedAt' in result, true, 'should add "updatedAt"')
})

t.test('pass document to appendBasicSchema', function (t) {
  t.plan(4)
  const result = appendBasicSchema({ foo: 'bar' })
  t.equal(result.foo, 'bar', 'should have original props')
  t.equal('id' in result, true, 'should add "id"')
  t.equal('createdAt' in result, true, 'should add "createdAt"')
  t.equal('updatedAt' in result, true, 'should add "updatedAt"')
})

t.test('pass array of documents to appendBasicSchema', function (t) {
  t.plan(8)
  const result = appendBasicSchema([{ foo: 'bar' }, { foo: 'baz' }])
  t.equal(result[0].foo, 'bar', 'should have original props')
  t.equal('id' in result[0], true, 'should add "id"')
  t.equal('createdAt' in result[0], true, 'should add "createdAt"')
  t.equal('updatedAt' in result[0], true, 'should add "updatedAt"')
  t.equal(result[1].foo, 'baz', 'should have original props')
  t.equal('id' in result[1], true, 'should add "id"')
  t.equal('createdAt' in result[1], true, 'should add "createdAt"')
  t.equal('updatedAt' in result[1], true, 'should add "updatedAt"')
})

t.test('pass document to appendUpdateSchema', function (t) {
  t.plan(4)
  const result = appendUpdateSchema({ foo: 'bar', id: 'xxx' })
  t.equal(result.foo, 'bar', 'should have original props')
  t.equal('id' in result, false, 'should remove "id"')
  t.equal('createdAt' in result, false, 'should not add "createdAt"')
  t.equal('updatedAt' in result, true, 'should add "updatedAt"')
})

t.test('pass update query to appendUpdateSchema', function (t) {
  t.plan(5)
  const result = appendUpdateSchema({ $push: { foo: 'bar' } })
  t.same(result.$push, { foo: 'bar' }, 'should have original props')
  t.equal('$set' in result, true, 'should have $set')
  const set = result.$set as any
  t.equal('id' in set, false, 'should not add "id"')
  t.equal('createdAt' in set, false, 'should not add "createdAt"')
  t.equal('updatedAt' in set, true, 'should add "updatedAt"')
})
