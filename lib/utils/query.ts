import { Date as D, isArray, isJSON, isNull, isNumber, isObject, isString } from '@kakang/validator'
import { Document, UpdateFilter } from 'mongodb'

const UpdateQueryKeys = new Set(['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$addToSet', '$pop', '$pull', '$push', '$pushAll', '$bit'])

export function isUpdateQuery <TSchema extends Document = Document> (docs: UpdateFilter<TSchema> | Partial<TSchema>): docs is UpdateFilter<TSchema> {
  for (const key of Object.keys(docs)) {
    if (UpdateQueryKeys.has(key)) return true
  }
  return false
}

export function retrieveUpdateQueryData<TSchema extends Document = Document> (docs: UpdateFilter<TSchema> | Partial<TSchema>): TSchema {
  return isUpdateQuery(docs) ? Object.assign({}, docs.$set) as TSchema : docs as TSchema
}

export function normalizeQueryDate<TSchema extends Document = Document> (docs: UpdateFilter<TSchema> | Partial<TSchema>): UpdateFilter<TSchema> {
  return isUpdateQuery(docs) ? docs : { $set: docs } as any
}

export function mergeUpdateQueryData<TSchema extends Document = Document> (from: UpdateFilter<TSchema> | Partial<TSchema>, to: UpdateFilter<TSchema> | Partial<TSchema>): UpdateFilter<TSchema> | Partial<TSchema> {
  from = normalizeQueryDate(from)
  to = normalizeQueryDate(to)
  const data = Object.assign({}, from.$set, to.$set)
  return { ...from, ...to, $set: data }
}

export function normalize (text: any): unknown {
  // security guard
  const tmp = isObject(text) && !isNull(text) ? JSON.stringify(text) : String(text)
  if (tmp.includes('$function') || tmp.includes('$accumulator')) throw new Error('invalid operator found')

  // start normalize
  // 1. if the string is wrapped by '{' and '}'
  //    we treat it as JSON
  if (isString(text) && text.startsWith('{') && text.endsWith('}')) {
    return normalize(JSON.parse(text))
  }
  // 2. if the string equal to 'true'
  //    we treat it as true
  if (tmp.toLowerCase() === 'true') return true
  // 2. if the string equal to 'false'
  //    we treat it as false
  if (tmp.toLowerCase() === 'false') return false
  // 3. if the string is empty
  //    return early since !isNaN('') will be true
  if (tmp === '') return ''
  // 4. if the string is number
  //    we treat it as number
  if (!isNaN(tmp as never as number)) return Number(tmp)
  // 5. if the string match ISO8601 standard
  //    we treat it as Date
  if (D.isISO8601Date(tmp)) return new Date(tmp)
  // 6. if the object match array
  //    we normalize each item inside
  if (isArray(text)) return text.map(normalize)
  // 7. if the object is JSON
  //    we normalize each pair of key-value
  if (!isNumber(text) && !isString(text) && !isArray(text) && isJSON(text)) {
    const o = JSON.parse(tmp)
    for (const k of Object.keys(o)) {
      // keep $expr $dateFromString work as before
      // $regex must be string
      if (k === 'dateString' || k === '$regex') {
        o[k] = String(o[k])
      } else {
        o[k] = normalize(o[k])
      }
    }
    return o
  }
  // 8. if all of the assumption not matcch
  //    we return the raw
  return text
}

const kStart = new Set(['{', '['])
const kEnd = new Set(['}', ']'])
const kKeyAllowedCharacters = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '$'])
const kDelimiter = [':', ',']

export function findNextPair (text: string, startIndex = 0): { startIndex: number, endIndex: number, key: string, value: string } {
  const result = {
    startIndex,
    endIndex: 0,
    key: '',
    value: ''
  }
  let foundKey = false
  let nested = 0

  for (let i = result.startIndex; i < text.length; i++) {
    const char = text[i]
    if (!foundKey) {
      // looking for key
      if (kKeyAllowedCharacters.has(char)) result.key += char
      else if (char === kDelimiter[0]) foundKey = true
    } else {
      // looking for value
      if (kStart.has(char)) nested++
      if (kEnd.has(char)) nested--
      if (nested === 0 && char === kDelimiter[1]) {
        result.endIndex = i + 1
        break
      }
      result.value += char
    }
  }

  return result
}

export function transformRegExpSearch (text: string | Record<string, unknown>): unknown {
  if (typeof text === 'string' && !text.startsWith('{') && !text.endsWith('}')) {
    return { $regex: text, $options: 'i' }
  } else {
    return text
  }
}
