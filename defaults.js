import * as raw from 'multiformats/codecs/raw'
import * as dagPb from '@ipld/dag-pb'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagJson from '@ipld/dag-json'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'
import { blake2b256 } from '@multiformats/blake2/blake2b'

/** @type {import('./index').BlockDecoders} */
export const Decoders = {
  [raw.code]: raw,
  [dagPb.code]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagJson.code]: dagJson
}

/** @type {import('./index').MultihashHashers} */
export const Hashers = {
  [identity.code]: identity,
  [sha256.code]: sha256,
  [blake2b256.code]: blake2b256
}
