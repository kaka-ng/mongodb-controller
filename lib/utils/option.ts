import { type ClientSession } from 'mongodb'

export function computeSharedOption (option?: any): { session?: ClientSession } {
  option ??= {}
  if ('session' in option) {
    return { session: option.session }
  } else {
    return {}
  }
}
