import { UpdateFilter } from 'mongodb'
import type { P } from 'pino'

export interface BasicSchema {
  id: string

  createdAt: Date
  updatedAt: Date
}

export type WithBasicSchema<T> = T & BasicSchema
export type OptionalBasicSchema<T> = T & Partial<BasicSchema>

export function isUpdateQuery <T> (docs: UpdateFilter<T> | Partial<T>): docs is UpdateFilter<T> {
  const keys = Object.keys(docs)
  for (let i = keys.length - 1; i >= 0; i--) {
    if (['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit'].includes(keys[i])) return true
  }
  return false
}

export function retrieveUpdateQueryData<T> (docs: T | UpdateFilter<T>): T {
  return isUpdateQuery(docs) ? Object.assign({}, docs.$set) as T : docs
}

export function mergeUpdateQueryData<T> (from: T | UpdateFilter<T>, to: T | UpdateFilter<T>): T | UpdateFilter<T> {
  const fromD = retrieveUpdateQueryData(from)
  const toD = retrieveUpdateQueryData(to)
  const data = Object.assign({}, fromD, toD)
  let result = {}
  if (isUpdateQuery(from)) result = { ...result, ...from }
  if (isUpdateQuery(to)) result = { ...result, ...to }
  return { ...result, $set: data }
}

export function isPinoLogger (p?: any): p is P.BaseLogger {
  if (typeof p !== 'undefined' || p !== null) {
    return typeof p === 'object' && 'child' in p && typeof p.child === 'function'
  } else {
    return false
  }
}
