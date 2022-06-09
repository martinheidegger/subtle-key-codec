import { codec } from './index.mjs'
import { base64 } from '@leichtgewicht/base64-codec'
import fs from 'fs/promises'
import crypto from 'crypto'

const usage = {
  sign: ['sign', 'verify'],
  encrypt: ['encrypt', 'decrypt'],
  derive: ['deriveKey', 'deriveBits'],
  wrap: ['wrapKey', 'unwrapKey']
}

const algorithms = [
  [{ name: 'ECDSA', namedCurve: 'P-256', hash: 'sha-256' }, usage.sign],
  [{ name: 'ECDSA', namedCurve: 'P-384', hash: 'sha-256' }, usage.sign],
  [{ name: 'ECDSA', namedCurve: 'P-521', hash: 'sha-256' }, usage.sign],
  [{ name: 'ECDH', namedCurve: 'P-256', hash: 'sha-256' }, usage.derive],
  [{ name: 'ECDH', namedCurve: 'P-384', hash: 'sha-256' }, usage.derive],
  [{ name: 'ECDH', namedCurve: 'P-521', hash: 'sha-256' }, usage.derive],
  [{ name: 'HMAC', hash: 'SHA-1' }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-256' }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-384' }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-512' }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-1', length: 8 }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-256', length: 16 }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-384', length: 32 }, usage.sign],
  [{ name: 'HMAC', hash: 'SHA-512', length: 1024 }, usage.sign],
  ...['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].reduce((result, hash) => {
    return [...result, ...([1024, 2048, 4096].map(modulusLength =>
      [{ name: 'RSASSA-PKCS1-v1_5', hash, modulusLength, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), saltLength: 5 }, usage.sign]
    ))]
  }, []),
  [{ name: 'RSA-PSS', hash: 'SHA-512', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), saltLength: 5 }, usage.sign],
  [{ name: 'AES-CTR', length: 128, counter: crypto.randomBytes(16) }, usage.encrypt],
  [{ name: 'AES-CBC', length: 128, iv: crypto.randomBytes(16) }, usage.encrypt],
  [{ name: 'AES-GCM', length: 256, iv: crypto.randomBytes(16) }, usage.encrypt],
  [{ name: 'AES-KW', length: 256 }, usage.wrap]
]

const keysRaw = (await Promise.all(algorithms.map(
  async ([algorithm, usages]) => {
    return { algorithm, key: await crypto.webcrypto.subtle.generateKey(algorithm, true, usages) }
  }
)))
const keys = []
for (const { algorithm, key } of keysRaw) {
  const samples = {}

  let encryptKey = null
  let signKey = null
  if (key.privateKey) {
    signKey = key.privateKey
    encryptKey = key.publicKey
    keys.push({ algorithm, samples, key: key.privateKey }, { algorithm, samples, key: key.publicKey })
  } else {
    signKey = key
    encryptKey = key
    keys.push({ algorithm, samples, key })
  }
  if (signKey && signKey.usages.includes('sign')) {
    const data = crypto.randomBytes(20)
    try {
      samples.signature = base64.decode(new Uint8Array((
        await crypto.webcrypto.subtle.sign(
          algorithm,
          signKey,
          data
        )
      )))
      samples.signInput = base64.decode(data)
    } catch (err) {
      console.log(signKey.algorithm, err)
    }
  }
  if (encryptKey && encryptKey.usages.includes('encrypt')) {
    const input = crypto.randomBytes(20)
    try {
      console.log({ encrypt: algorithm, encryptKey })
      samples.encrypted = base64.decode(new Uint8Array((
        await crypto.webcrypto.subtle.encrypt(
          algorithm,
          encryptKey,
          input
        )
      )))
      samples.iv = algorithm.iv && algorithm.iv.toString('base64')
      samples.counter = algorithm.counter && algorithm.counter.toString('base64')
      samples.encryptInput = base64.decode(input)
    } catch (err) {
      console.log(encryptKey.algorithm, err)
    }
  }
}

await fs.writeFile('./test.fixtures.mjs', `export const fixtures = ${JSON.stringify(
    await Promise.all(
      keys.map(
        async ({ algorithm, key, samples }, index) => {
          return {
            index,
            algorithm: key.algorithm,
            type: key.type,
            raw: base64.decode(await codec.encode(key)),
            usages: key.usages,
            samples
          }
        }
      )
    ),
    (key, value) => {
      if (value instanceof Uint8Array) {
        return Array.from(value)
      }
      return value
    },
    2
  )}\n`
)
