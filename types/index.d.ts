export type SubtleKeyType <Subtle extends PartialSubtle> =
  Subtle['importKey'] extends (...args: any[]) => Promise<infer Result>
    ? Result
    : never;

export type KeyType <Crypto extends PartialCrypto> = SubtleKeyType<Crypto['subtle']>;

export interface Codec<TCrypto extends PartialCrypto> {
  name: string;
  encodingLength(key: KeyType<TCrypto>): Promise<number>;
  decode(input: Uint8Array, offset?: number): Promise<KeyType<TCrypto>>;
  encode <T extends Uint8Array | number[]>(key: KeyType<TCrypto>, byoa?: T, offset?: number): Promise<T>;
}

export interface CryptoKeyish {
  algorithm: {
    name: string;
  };
}

export interface PartialSubtle {
  exportKey(format: 'jwk' | 'pkcs8' | 'spki', key: CryptoKeyish): Promise<any>;
  importKey(format: 'jwk' | 'pkcs8' | 'spki', data: Uint8Array | JsonWebKey, algoritm: any, extractable: boolean, keyUsages: KeyUsage[]): Promise<any>;
}

export interface PartialCrypto {
  subtle: PartialSubtle;
}

export function createCodec <TCrypto extends PartialCrypto>(crypto: TCrypto): Codec<TCrypto>;
export const codec: Codec<Crypto>;
