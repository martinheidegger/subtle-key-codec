# subtle-key-codec

Encodes/Decodes WebCrypto keys efficiently and easily into `Uint8Array`s.
Good when you want to safe space (QR Codes).

```js
import { codec } from 'subtle-key-codec'

const key = // ... generated via WebCrypto API

const uint8Array = await codec.encode(key)
const key = await codec.decode(bytes)
```

### Why use it?

- To get a simple API that just works.
- To have smaller QR codes.
- It integrate with other Binary data libraries.

(more in [the Comparison](#comparison))

#### What is in the package?

- An encoder/decoder to turn WebCrypto keys into Uint8Arrays.
- ESM modules, CommonJS modules and typescript definitions.

## Comparison

The [WebCrypto][] API _allows_ to `import/export` keys. But the API is rather
difficult to use. Not every key supports every input/output format and getting
a space-efficient representation of codec is not available.

As you can see above the API is simple. :wink:

[WebCrypto]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

It _is possible_ to relativey turn any key into a `Uint8Array` with the native
API like this:

```js
const bytes = Buffer.from(
  JSON.stringify(
    await crypto.subtle.exportKey('jwk', key)
  )
).toString('base64')
```

However, the size of this is rather big. In the [tests][] this library creates
base64 strings that are `7.7%` to `75%` of the size!

This can make a big difference when you want to turn keys into QR Codes.

[tests]: https://github.com/martinheidegger/subtle-key-codec/actions

## API

Beside the basic API, there are are few additional features that may help you to
be faster or consume less memory.

### BYOA and pre-determined length

By default the codec will create a new `Uint8Array` for you consume. But you can
also pass-in a pre-created Uint8Array to the encoding process.

```js
await codec.encode(key, new Uint8Array(1000))
```

This can be useful if you just want to add a key to a set of keys. But you may want
to pass-in also the `offset` place it entirely in an array.

```js
await codec.encode(key, new Uint8Array(1000), 2)
```

The example has an abritary size of `1000` but you can also figure out in advance
how big the key is.

```js
await codec.encodingLength(key)
```

### Specific Codec

`.encode` will usually prefix the resulting Uint8Array with a type identifier.
A value from `0~255` that specifies which particular key-codec is used to de-/encode
a particular key.

```js
 // this will tell you the constant number of that codec
const uint8 = codec.getKeyType(key)
// You can also get the entire codec
const keyCodec = codec.getKeyCodec(key)
// ... to use wthout the prefix.
const withoutIndexPrefix = keyCodec.encode(key)
// ... in both directions
key = keyCodec.decode(withoutIndexPrefix)
```

### Use with older Node versions

This library has been tested with the [isomorphic-webcrypto][] library that works
with older versions of Node.js. To use it you need to create a crypto object rather
than using the default crypto object.

```js
import { createCodec } from 'subtle-key-codec'
import crypto from 'isomorphic-webcrypto'

const codec = createCodec(crypto)
```

## License

[MIT](./LICENSE)
