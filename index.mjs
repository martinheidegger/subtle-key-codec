import { crypto as systemCrypto } from './crypto.mjs'

function fixedSize (crypto, algorithm, format, usages, size) {
  return {
    async encodingLength () {
      return size
    },
    async decode (buffer, offset = 0) {
      let bytes
      if (offset === 0 && buffer.length === size) {
        bytes = buffer
      } else {
        bytes = buffer.subarray(offset, offset + size)
      }
      return await crypto.subtle.importKey(
        format,
        bytes,
        algorithm,
        true,
        usages
      )
    },
    async encode (key, buffer, offset = 0) {
      const bytes = new Uint8Array(await crypto.subtle.exportKey(format, key))
      if (offset === 0 && !buffer) {
        return bytes
      }
      if (!buffer) {
        buffer = new Uint8Array(bytes.length + offset)
      }
      buffer.set(bytes, offset)
      return buffer
    }
  }
}

function ecdsa (crypto, type, namedCurve, size) {
  const algorithm = {
    name: 'ECDSA',
    namedCurve
  }
  return {
    name: `${algorithm.name}_${namedCurve}_${type}`,
    matches: key =>
      key.type === type &&
      key.algorithm.name === algorithm.name &&
      key.algorithm.namedCurve === namedCurve,
    ...fixedSize(
      crypto,
      algorithm,
      type === 'private' ? 'pkcs8' : 'raw',
      type === 'private' ? ['sign'] : ['verify'],
      size
    )
  }
}

function ecdh (crypto, type, namedCurve, size) {
  const algorithm = {
    name: 'ECDH',
    namedCurve
  }
  return {
    name: `${algorithm.name}_${namedCurve}_${type}`,
    matches: key =>
      key.type === type &&
      key.algorithm.name === algorithm.name &&
      key.algorithm.namedCurve === namedCurve,
    ...fixedSize(
      crypto,
      algorithm,
      type === 'private' ? 'pkcs8' : 'raw',
      type === 'private' ? ['deriveKey', 'deriveBits'] : [],
      size
    )
  }
}

function hmac (crypto, hash, size) {
  const algorithm = {
    name: 'HMAC',
    hash: {
      name: hash
    }
  }
  return {
    name: `${algorithm.name}_${hash}`,
    matches: key => key.algorithm.name === algorithm.name &&
      key.algorithm.hash.name === hash &&
      key.algorithm.length === size,
    ...fixedSize(
      crypto,
      algorithm,
      'raw',
      ['sign', 'verify'],
      size
    )
  }
}

function customHmac (crypto, hash) {
  const format = 'raw'
  const usages = ['sign', 'verify']
  const name = 'HMAC'
  return {
    name: `${name}_${hash}_custom`,
    matches: key =>
      key.algorithm.name === name &&
      key.algorithm.hash.name === hash,
    async encodingLength (key) {
      return (key.algorithm.length >> 3) + 2 /* length */
    },
    async decode (buffer, offset = 0) {
      const length = buffer[offset] | (buffer[offset + 1] << 8)
      const algorithm = {
        name,
        length,
        hash: {
          name: hash
        }
      }
      const bytes = buffer.subarray(offset + 2, offset + 2 + (length >> 3))
      return await crypto.subtle.importKey(
        format,
        bytes,
        algorithm,
        true,
        usages
      )
    },
    async encode (key, buffer, offset = 0) {
      const bytes = new Uint8Array(await crypto.subtle.exportKey(format, key))
      if (!buffer) {
        buffer = new Uint8Array(bytes.length + offset + 2)
      }
      buffer[offset] = key.algorithm.length
      buffer[offset + 1] = key.algorithm.length >> 8
      buffer.set(bytes, offset + 2)
      return buffer
    }
  }
}

const hashes = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

let cachedRSAEncodings = new WeakMap()
let clearCache = null

function isDefaultExponent (key) {
  const publicExponent = key.algorithm.publicExponent
  return (
    publicExponent[0] === 1 &&
    publicExponent[1] === 0 &&
    publicExponent[2] === 1
  )
}

function exportRSAKey (crypto, key) {
  let promise = cachedRSAEncodings.get(key)
  if (promise === undefined) {
    if (!isDefaultExponent(key)) {
      // It seems like WebCrypto has a problem with exporting the publicExponent of a key.
      // When importing an exported key it will reset the publicExponent. In tests that has
      // been true both for jwk and pkcs8 exported keys.
      throw new Error('WebCrypto does not properly import/export Keys with a custom publicExponent, sorry.')
    }
    const format = key.type === 'private' ? 'pkcs8' : 'spki'
    promise = crypto.subtle.exportKey(format, key).then(exported => {
      return { exported, format }
    })
    cachedRSAEncodings.set(key, promise)
  }
  if (clearCache === null) {
    clearCache = setTimeout(() => {
      cachedRSAEncodings = new WeakMap()
      clearCache = null
    }, 150 /* Lets keep results for 150ms, should be long enough between encodingLength & encode */)
  }
  return promise
}

function rsa (crypto, name, type, hash, usages) {
  const format = type === 'private' ? 'pkcs8' : 'spki'
  return {
    name: `${name}_${hash}_${type}`,
    matches: key =>
      key.type === type &&
      key.algorithm.name === name &&
      key.algorithm.hash.name === hash,
    async encodingLength (key) {
      const exp = await exportRSAKey(crypto, key)
      const len = exp.exported.byteLength + 3
      return len
    },
    async decode (buffer, offset = 0) {
      const size = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
      const start = offset + 3
      const importKey = buffer.subarray(start, start + size)
      const algo = {
        name,
        hash: {
          name: hash
        }
      }
      const key = await crypto.subtle.importKey(
        format,
        importKey,
        algo,
        true,
        usages
      )
      return key
    },
    async encode (key, buffer, offset = 0) {
      const { exported } = await exportRSAKey(crypto, key)
      const size = exported.byteLength
      if (!buffer) {
        buffer = new Uint8Array(offset + 3 + size)
      }
      buffer[offset] = size
      buffer[offset + 1] = size >> 8
      buffer[offset + 2] = size >> 16
      buffer.set(new Uint8Array(exported), offset + 3)
      return buffer
    }
  }
}

function aes (crypto, name, length, usages, size) {
  return {
    name: `${name}_${length}`,
    matches: key => {
      return key.type === 'secret' &&
        key.algorithm.name === name &&
        key.algorithm.length === length
    },
    ...fixedSize(
      crypto,
      {
        name,
        length
      },
      'raw',
      usages,
      size
    )
  }
}

function * _combinationOf (stack, array, ...rest) {
  if (rest.length === 0) {
    yield array(...stack)
    return
  }
  for (const entry of array) {
    stack.push(entry)
    for (const result of _combinationOf(stack, ...rest)) {
      yield result
    }
    stack.pop()
  }
}

const combinationOf = (...rest) => _combinationOf([], ...rest)

function getKeyCodecIndex (codecs, key) {
  if (!key.extractable) {
    throw new TypeError('Key not exportable')
  }
  if (typeof key.algorithm === 'object' && key.algorithm !== null) {
    const index = codecs.findIndex(
      codec => codec.matches(key)
    )
    if (index !== -1) {
      return index
    }
  }
  throw new TypeError(`Can not process key: ${JSON.stringify(key.algorithm)} [${key.type}]`)
}

export function createCodec (crypto) {
  const codecs = [
    ecdsa(crypto, 'public', 'P-256', 65),
    ecdsa(crypto, 'public', 'P-384', 97),
    ecdsa(crypto, 'public', 'P-521', 133),
    ecdsa(crypto, 'private', 'P-256', 138),
    ecdsa(crypto, 'private', 'P-384', 185),
    ecdsa(crypto, 'private', 'P-521', 241),
    ecdh(crypto, 'public', 'P-256', 65),
    ecdh(crypto, 'public', 'P-384', 97),
    ecdh(crypto, 'public', 'P-521', 133),
    ecdh(crypto, 'private', 'P-256', 138),
    ecdh(crypto, 'private', 'P-384', 185),
    ecdh(crypto, 'private', 'P-521', 241),
    hmac(crypto, 'SHA-1', 20),
    hmac(crypto, 'SHA-256', 32),
    hmac(crypto, 'SHA-384', 48),
    hmac(crypto, 'SHA-512', 64),
    ...hashes.map(hash => customHmac(crypto, hash)),
    ...combinationOf(
      ['RSASSA-PKCS1-v1_5', 'RSA-PSS'],
      [{ type: 'public', usages: ['verify'] }, { type: 'private', usages: ['sign'] }],
      hashes,
      (name, { type, usages }, hash) => rsa(crypto, name, type, hash, usages)
    ),
    ...combinationOf(
      [{ type: 'public', usages: ['encrypt', 'wrapKey'] }, { type: 'private', usages: ['decrypt', 'unwrapKey'] }],
      hashes,
      ({ type, usages }, hash) => rsa(crypto, 'RSA-OAEP', type, hash, usages)
    ),
    ...combinationOf(
      ['AES-CBC', 'AES-CTR', 'AES-GCM'],
      [{ length: 128, size: 16 }, { length: 192, size: 24 }, { length: 256, size: 32 }],
      (name, { length, size }) => aes(crypto, name, length, ['encrypt', 'wrapKey', 'decrypt', 'unwrapKey'], size)
    ),
    ...combinationOf(
      [{ length: 128, size: 16 }, { length: 192, size: 24 }, { length: 256, size: 32 }],
      ({ length, size }) => aes(crypto, 'AES-KW', length, ['wrapKey', 'unwrapKey'], size)
    )
  ].map((codec, index) => {
    codec.index = index
    return codec
  })

  const getKeyCodec = key => {
    const index = getKeyCodecIndex(codecs, key)
    return codecs[index]
  }

  return {
    name: 'subtle-key-codec',
    getKeyCodec,
    getKeyType (key) {
      return getKeyCodec(key).name
    },
    async encodingLength (key) {
      return (await getKeyCodec(key).encodingLength(key)) + 1
    },
    async encode (key, buffer, offset = 0) {
      const codec = getKeyCodec(key)
      const len = await codec.encodingLength(key) + 1
      if (!buffer) {
        buffer = new Uint8Array(offset + len)
      }
      buffer[offset] = codec.index
      return await codec.encode(key, buffer, offset + 1)
    },
    async decode (buffer, offset = 0) {
      const index = buffer[offset]
      const codec = codecs[index]
      if (codec === undefined) {
        throw new Error(`Can not decode Crypto Key. Unknown type=${index}`)
      }
      return await codec.decode(buffer, offset + 1)
    }
  }
}

export const codec = createCodec(systemCrypto)
