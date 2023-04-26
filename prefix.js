import varint from 'varint'

/**
 * @typedef {{
 *   version: number
 *   code: number
 *   multihash: {
 *     code: number
 *     size: number
 *   }
 * }} Prefix All the metadata of a CID.
 * See https://github.com/ipfs/go-cid/blob/829c826f6be23320846f4b7318aee4d17bf8e094/cid.go#L542-L554
 */

/** @param {Prefix} prefix */
export function encode (prefix) {
  const codeOffset = varint.encodingLength(prefix.version)
  const hashCodeOffset = codeOffset + varint.encodingLength(prefix.code)
  const hashSizeOffset = hashCodeOffset + varint.encodingLength(prefix.multihash.code)
  const bytes = new Uint8Array(hashSizeOffset + varint.encodingLength(prefix.multihash.size))
  varint.encode(prefix.version, bytes, 0)
  varint.encode(prefix.code, bytes, codeOffset)
  varint.encode(prefix.multihash.code, bytes, hashCodeOffset)
  varint.encode(prefix.multihash.size, bytes, hashSizeOffset)
  return bytes
}

/**
 * @param {Uint8Array} bytes
 * @returns {Prefix}
 */
export function decode (bytes) {
  const version = varint.decode(bytes)
  const codeOffset = varint.encodingLength(version)
  const code = varint.decode(bytes, codeOffset)
  const hashCodeOffset = codeOffset + varint.encodingLength(code)
  const hashCode = varint.decode(bytes, hashCodeOffset)
  const hashSizeOffset = hashCodeOffset + varint.encodingLength(hashCode)
  const hashSize = varint.decode(bytes, hashSizeOffset)
  return { version, code, multihash: { code: hashCode, size: hashSize } }
}
