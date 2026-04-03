import { randomBytes as defaultRandomBytes } from 'node:crypto'
import { createElectronStore } from './electron-store'

interface SessionKeyStoreShape extends Record<string, unknown> {
  sessionEncryptionKey?: string
}

type SessionKeyStore = Pick<
  ReturnType<typeof createElectronStore<SessionKeyStoreShape>>,
  'get' | 'set'
>

type GetOrCreateSessionEncryptionKeyOptions = {
  createStore?: () => SessionKeyStore
  randomBytes?: typeof defaultRandomBytes
}

const SESSION_KEY_LENGTH_BYTES = 32
const SESSION_KEY_PATTERN = /^[0-9a-f]{64}$/i

const createSessionKeyStore = (): SessionKeyStore =>
  createElectronStore<SessionKeyStoreShape>({
    name: 'ccpro-security',
    clearInvalidConfig: true
  })

export const isValidSessionEncryptionKey = (value: unknown): value is string =>
  typeof value === 'string' && SESSION_KEY_PATTERN.test(value)

export const getOrCreateSessionEncryptionKey = (
  options: GetOrCreateSessionEncryptionKeyOptions = {}
): string => {
  const createStore = options.createStore ?? createSessionKeyStore
  const randomBytes = options.randomBytes ?? defaultRandomBytes
  const store = createStore()
  const existingKey = store.get('sessionEncryptionKey')

  if (isValidSessionEncryptionKey(existingKey)) {
    return existingKey
  }

  const sessionEncryptionKey = randomBytes(SESSION_KEY_LENGTH_BYTES).toString('hex')
  store.set('sessionEncryptionKey', sessionEncryptionKey)

  return sessionEncryptionKey
}
