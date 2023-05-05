import { isArray } from '@kakang/validator'
import { randomUUID } from 'crypto'
import { type Document, type UpdateFilter } from 'mongodb'
import { isUpdateQuery, retrieveUpdateQueryData } from './query'

function _appendBasicSchema<TSchema extends Document = Document> (docs: TSchema, now: Date): TSchema {
  // we shallow clone
  const doc: any = { ...docs }
  doc.id = randomUUID()
  doc.createdAt = now
  doc.updatedAt = now
  return doc
}

function _noopAppendBasicSchema<TSchema extends Document = Document> (docs: TSchema): TSchema {
  return docs
}

export type AppendBasicSchema<TSchema extends Document = Document> = (docs: TSchema, now: Date) => TSchema

export function appendBasicSchema<TSchema extends Document = Document> (docs: TSchema, append?: AppendBasicSchema<TSchema>): TSchema
export function appendBasicSchema<TSchema extends Document = Document> (docs: TSchema[], append?: AppendBasicSchema<TSchema>): TSchema[]
export function appendBasicSchema<TSchema extends Document = Document> (docs: TSchema | TSchema[], append: AppendBasicSchema<TSchema> = _noopAppendBasicSchema): TSchema | TSchema[] {
  const now = new Date()
  if (isArray(docs)) {
    return docs.map(function (d) {
      return append(_appendBasicSchema(d, now), now)
    })
  } else {
    return append(_appendBasicSchema(docs, now), now)
  }
}

export function appendUpdateSchema<TSchema extends Document = Document> (docs: UpdateFilter<TSchema>, append?: AppendBasicSchema<TSchema>): UpdateFilter<TSchema>
export function appendUpdateSchema<TSchema extends Document = Document> (docs: Partial<TSchema>, append?: AppendBasicSchema<TSchema>): TSchema
export function appendUpdateSchema<TSchema extends Document = Document> (docs: UpdateFilter<TSchema> | Partial<TSchema>, append: AppendBasicSchema<TSchema> = _noopAppendBasicSchema): UpdateFilter<TSchema> | TSchema {
  const now = new Date()
  const doc = retrieveUpdateQueryData(docs)
  const item: any = append(_appendBasicSchema(doc, now), now)
  delete item.id
  delete item.createdAt
  if (isUpdateQuery(docs)) {
    docs.$set = item
    return docs
  } else {
    return item
  }
}
