import { codec, createCodec, KeyType } from 'subtle-key-codec';

async () => {
  const key = await crypto.subtle.generateKey({ name: 'HMAC' }, true, ['sign']);
  await codec.encode('publicKey' in key ? key.publicKey : key, new Uint8Array(0), 1); // $ExpectType Uint8Array
  const key2: KeyType<typeof crypto> = await codec.decode(new Uint8Array(), 0);

  const custom = createCodec({
    subtle: {
      async exportKey(format, key) {},
      async importKey() {}
    }
  });
};
