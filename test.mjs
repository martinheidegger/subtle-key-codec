import { createCodec } from './index.mjs'
import { base64 } from '@leichtgewicht/base64-codec'
import tape from 'fresh-tape'
import { fixtures } from './test.fixtures.mjs'
import crypto from 'isomorphic-webcrypto'

const codec = createCodec(crypto)
const { decode, encode, encodingLength } = codec

for (const [index, { algorithm, type, raw, samples, usages }] of fixtures.entries()) {
  tape(`#${index}: ${JSON.stringify(algorithm)}`, { skip: !(true) }, async t => {
    const buf = base64.encode(raw)
    const key = await decode(buf)
    t.pass(codec.getKeyType(key))
    t.equals(key.type, type, 'Restored key type matches the expected type')
    t.deepEqual(await encode(key), buf, 'Re-encoding the key will be the same buffer')
    t.equal(buf.length, await encodingLength(key), 'Encoding-Length matches expected.')
    const keyCodec = codec.getKeyCodec(key)
    const keyBuf = await keyCodec.encode(key)
    await keyCodec.decode(keyBuf)
    t.deepEqual(keyBuf, buf.subarray(1), 'Re-encoding using the key-codec works.')
    const keyBufOffset = await keyCodec.encode(key, null, 2)
    t.deepEqual(keyBufOffset.subarray(2), buf.subarray(1), 'Re-encoding using key-codec works with offset.')
    const algo = { ...algorithm }
    if (samples.iv) {
      algo.iv = base64.encode(samples.iv)
    }
    if (samples.counter) {
      algo.counter = base64.encode(samples.counter)
    }
    if (algo.publicExponent && !(algo.publicExponent instanceof Uint8Array)) {
      algo.publicExponent = new Uint8Array(algo.publicExponent)
    }
    algo.saltLength = 5
    if (usages.includes('decrypt') && samples.encrypted) {
      t.pass('Decrypting...')
      const decrypted = new Uint8Array(
        await crypto.subtle.decrypt(
          algo,
          key,
          base64.encode(samples.encrypted)
        )
      )
      t.deepEqual(decrypted, base64.encode(samples.encryptInput), 'Decrypting using the restored key works.')
    }
    if (usages.includes('encrypt') && samples.encrypted) {
      t.pass('Encrypting...')
      const encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
          algo,
          key,
          base64.encode(samples.encryptInput)
        )
      )
      t.deepEqual(encrypted, base64.encode(samples.encrypted), 'Encrypting using the restored key works.')
    }
    if (usages.includes('verify') && samples.signed) {
      t.pass('Verifying...', algo)
      t.ok(
        await crypto.subtle.verify(
          algo,
          key,
          base64.encode(samples.signature),
          base64.encode(samples.signData)
        ),
        'Verification using the restored key works'
      )
    }
  })
}

tape('Error for unextractable key', async t => {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'sha-1' }, false, ['sign'])
  try {
    await encode(key)
    t.fail('Unexpected pass.')
  } catch (err) {
    t.ok(err instanceof TypeError)
    t.match(err.message, /Key not exportable/)
  }
})

tape('Error for unextractable key', async t => {
  function attempt (p) {
    return p.then(
      () => null,
      err => err
    )
  }
  const errors = await Promise.all([
    attempt(
      crypto.subtle.generateKey({ name: 'RSA-PSS', hash: 'sha-1', publicExponent: new Uint8Array([1, 2, 3]), modulusLength: 512 }, true, ['sign', 'verify'])
        .then(key => encode(key.privateKey))
    ),
    attempt(crypto.subtle.importKey('raw', 'hello', { name: 'HKDF' }, true, ['deriveKey'])),
    attempt(crypto.subtle.importKey('raw', 'hello', { name: 'PBKDF2' }, true, ['deriveKey']))
  ])
  let index = 0
  for (const error of errors) {
    t.notEquals(error, null, `${index++} supposed to fail`)
  }
})

tape('invalid keys', t => {
  t.throws(() => codec.getKeyType({ extractable: true, algorithm: null }))
  t.throws(() => codec.getKeyType({ extractable: true, algorithm: {} }))
  t.end()
})

tape('invalid buffer', async t => {
  try {
    await decode(new Uint8Array([255]))
    t.fail('Unexpected pass.')
  } catch (err) {
    t.match(err.message, /Unknown type/)
  }
})

async function jwkBytes (key) {
  return Buffer.from(JSON.stringify(await crypto.subtle.exportKey('jwk', key))).toString('base64')
}

tape('size comparison', async t => {
  const dotOne = num => Math.round(num * 10) / 10
  const table = []
  let min = Number.MAX_VALUE
  let max = 0
  for (const { raw, algorithm } of fixtures) {
    const buf = base64.encode(raw)
    const key = await decode(buf)
    const jwkSize = (await jwkBytes(key)).length
    const rawSize = raw.length
    const comparison = 100 / jwkSize * rawSize
    if (min > comparison) {
      min = comparison
    }
    if (max < comparison) {
      max = comparison
    }
    table.push([JSON.stringify(algorithm), jwkSize, rawSize, `${dotOne(comparison)}%`])
  }
  console.log('| Algorithm | Naive | subtle-key-codec |h\n|---|---|---|')
  for (const row of table) {
    console.log(`| ${row.join(' | ')} |`)
  }
  console.log(`\nSmallest=${dotOne(min)}%\nBiggest=${dotOne(max)}%`)
})

tape('done.', { skip: typeof window === 'undefined' }, () => {
  window.close()
})
