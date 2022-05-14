import { isArray } from '@kakang/validator'
import { randomUUID } from 'crypto'
import { Document, UpdateFilter } from 'mongodb'
import { isUpdateQuery } from './query'

function _appendBasicSchema<TScheme extends Document = Document> (docs: TScheme, now: Date): TScheme {
  return Object.assign({}, docs, {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  })
}

export function appendBasicSchema<TScheme extends Document = Document> (docs: TScheme): TScheme
export function appendBasicSchema<TScheme extends Document = Document> (docs: TScheme[]): TScheme[]
export function appendBasicSchema<TScheme extends Document = Document> (docs: TScheme | TScheme[]): TScheme | TScheme[] {
  const now = new Date()
  if (isArray(docs)) {
    return docs.map(function (d) {
      return _appendBasicSchema(d, now)
    })
  } else {
    return _appendBasicSchema(docs, now)
  }
}

export function appendUpdateSchema<TSchema extends Document = Document> (docs: UpdateFilter<TSchema>): UpdateFilter<TSchema>
export function appendUpdateSchema<TSchema extends Document = Document> (docs: Partial<TSchema>): TSchema
export function appendUpdateSchema<TSchema extends Document = Document> (docs: UpdateFilter<TSchema> | Partial<TSchema>): UpdateFilter<TSchema> | TSchema {
  const now = new Date()
  const o = isUpdateQuery(docs) ? docs.$set : docs
  const item: any = _appendBasicSchema(o as TSchema, now)
  delete item.id
  delete item.createdAt
  if (isUpdateQuery(docs)) {
    docs.$set = item
    return docs
  } else {
    return item
  }
}
