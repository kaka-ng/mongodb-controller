import { isExist, isObject } from '@kakang/validator'
import Pino, { P } from 'pino'

function isPinoLogger (p?: any): p is P.BaseLogger {
  if (isObject(p) && isExist(p)) {
    return typeof p === 'object' && 'child' in p && typeof (p as any).child === 'function'
  } else {
    return false
  }
}

function createDefaultLogger (name: string, customOptions?: P.LoggerOptions): P.BaseLogger {
  const options: P.LoggerOptions = Object.assign({ name, base: { type: 'controller', pid: undefined, hostname: undefined } }, customOptions)
  options.level = customOptions?.level ?? 'debug'
  return Pino(options)
}

export function createLogger (name: string, customOptions?: P.LoggerOptions | P.BaseLogger): P.BaseLogger {
  if (isPinoLogger(customOptions)) {
    return customOptions
  } else {
    return createDefaultLogger(name, customOptions)
  }
}
