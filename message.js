import { CID } from 'multiformats/cid'
import * as gen from './gen/message.js'

const MAX_PRIORITY = Math.pow(2, 31) - 1
// https://github.com/ipfs/go-bitswap/blob/81393bcd77fb6ea8470057adb5f7acc52b195b5f/internal/defaults/defaults.go#L21
const MAX_MESSAGE_SIZE = 16 * 1024

/**
 * Overhead added to the message when either block and blockPresence are non
 * empty.
 *   - 2 is the size of the varint used to declare the new embedded messages
 *   - 8 (4 x 2) is the size of the  varint used to declare embedded messages
 *     payload when the total message size is 4 MB
 */
const NON_EMPTY_OVERHEAD = 2 + 8
/**
 * Overhead added by a new wantlist entry (without considering the cid field size)
 *   - 1 is the varint which declare the new embedded message
 *   - 1 is the varint which declare the block field (a CID)
 *   - 1 is the varint which declare the priority field
 *   - 1 is the varint of the priority field value
 *   - 1 is the varint which declare the cancel field
 *   - 1 is the varint of the cancel field value
 *   - 1 is the varint which declare the wantType field
 *   - 1 is the varint of the wantType field value
 *   - 1 is the varint which declare the sendDontHave field
 *   - 1 is the varint of the sendDontHave field value
 */
const NEW_ENTRY_OVERHEAD = 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1
/**
 * An arbitrary percentage added to minimize the probability of false negatives
 * since this is an estimated algorithm.
 */
const ADDED_ESTIMATION_PERCENTAGE = 0.1

export class Entry {
  /**
   * @param {CID} cid
   * @param {Object} [options]
   * @param {number} [options.priority]
   * @param {boolean} [options.cancel]
   * @param {gen.Message.Wantlist.WantType} [options.wantType]
   * @param {boolean} [options.sendDontHave]
   */
  constructor (cid, options = {}) {
    const { priority, cancel, wantType, sendDontHave } = options
    this.cid = cid
    this.priority = priority
    this.cancel = Boolean(cancel)
    this.wantType = wantType || 0
    this.sendDontHave = Boolean(sendDontHave)

    if (this.priority == null || this.priority < 0) {
      this.priority = 1
    } else if (this.priority > MAX_PRIORITY) {
      this.priority = MAX_PRIORITY
    }

    if (!gen.Message.Wantlist.WantType[this.wantType]) {
      this.wantType = 0
    }
  }

  /**
   * @param {gen.Message.Wantlist.Entry} raw
   */
  static fromRaw (raw) {
    const wantType = raw.wantType
    const sendDontHave = raw.sendDontHave
    const cid = CID.decode(raw.block)
    return new Entry(cid, { priority: raw.priority, cancel: raw.cancel, wantType, sendDontHave })
  }

  serialize () {
    const { cid, priority, cancel, wantType, sendDontHave } = this
    return {
      block: cid.bytes,
      priority,
      cancel,
      wantType,
      sendDontHave
    }
  }

  encode () {
    return gen.Message.Wantlist.Entry.encode(this.serialize()).finish()
  }
}

export class Wantlist {
  /**
   * @param {Object} [options]
   * @param {Entry[]} [options.entries]
   * @param {boolean} [options.full]
   */
  constructor (options = {}) {
    const { entries, full } = options
    this.entries = entries || []
    this.full = Boolean(full)
  }

  /**
   * @param {gen.Message.Wantlist} raw
   */
  static fromRaw (raw) {
    return new Wantlist({
      // @ts-ignore
      entries: raw.entries.map(e => Entry.fromRaw(e)),
      full: raw.full
    })
  }

  serialize () {
    return {
      entries: this.entries.map(e => e.serialize()),
      full: this.full
    }
  }

  encode () {
    return gen.Message.Wantlist.encode(this.serialize()).finish()
  }
}

export class Block {
  /**
   * @param {Uint8Array|CID} prefixOrCid
   * @param {Uint8Array} data
   */
  constructor (prefixOrCid, data) {
    if (prefixOrCid instanceof CID) {
      prefixOrCid = new Uint8Array([
        prefixOrCid.version,
        prefixOrCid.code,
        prefixOrCid.multihash.bytes[0],
        prefixOrCid.multihash.bytes[1]
      ])
    }

    this.prefix = prefixOrCid
    this.data = data
  }

  /**
   * @param {gen.Message.Block} raw
   */
  static fromRaw (raw) {
    return new Block(raw.prefix, raw.data)
  }

  serialize () {
    return { prefix: this.prefix, data: this.data }
  }

  encode () {
    return gen.Message.Block.encode(this.serialize()).finish()
  }
}

export class BlockPresence {
  /**
   * @param {CID} cid
   * @param {gen.Message.BlockPresenceType} type
   */
  constructor (cid, type) {
    this.cid = cid
    this.type = type

    if (!gen.Message.BlockPresenceType[this.type]) {
      this.type = 0
    }
  }

  /**
   * @param {gen.Message.BlockPresence} raw
   */
  static fromRaw (raw) {
    return new BlockPresence(CID.decode(raw.cid), raw.type)
  }

  serialize () {
    return { cid: this.cid.bytes, type: this.type }
  }

  encode () {
    return gen.Message.BlockPresence.encode(this.serialize()).finish()
  }
}

/**
 * As specified in the constants above, each Message can be 4MB maximum (after
 * serialization).
 * Each block can be at most 2 MB.
 * Each CID is roughly 40 byte.
 */
export class Message {
  /**
   * @param {Object} [options]
   * @param {Wantlist} [options.wantlist]
   * @param {Block[]} [options.blocks]
   * @param {BlockPresence[]} [options.blockPresences]
   * @param {number} [options.pendingBytes]
   */
  constructor (options = {}) {
    const { wantlist, blocks, blockPresences, pendingBytes } = options
    this.wantlist = wantlist || new Wantlist()
    this.blocks = blocks || []
    this.blockPresences = blockPresences || []
    this.pendingBytes = pendingBytes || 0

    // Validate pendingBytes
    if (this.pendingBytes < 0) {
      this.pendingBytes = 0
    }

    this.estimatedLength = this.encode().length + NON_EMPTY_OVERHEAD
  }

  /**
   * @param {Uint8Array} encoded
   */
  static decode (encoded) {
    const decoded = gen.Message.decode(encoded)
    return new Message({
      // @ts-ignore
      wantlist: Wantlist.fromRaw(decoded.wantlist),
      // @ts-ignore
      blocks: decoded.payload.map(b => Block.fromRaw(b)),
      // @ts-ignore
      blockPresences: decoded.blockPresences.map(b => BlockPresence.fromRaw(b)),
      pendingBytes: decoded.pendingBytes
    })
  }

  serialize () {
    const { wantlist, blocks, blockPresences } = this

    return {
      wantlist: wantlist.serialize(),
      payload: blocks.map(b => b.serialize()),
      blockPresences: blockPresences.map(b => b.serialize()),
      pendingBytes: this.pendingBytes * Number.MAX_SAFE_INTEGER
    }
  }

  encode () {
    return gen.Message.encode(this.serialize()).finish()
  }

  /**
   * @param {Entry} entry
   */
  addWantlistEntry (entry) {
    const newSize = NEW_ENTRY_OVERHEAD + entry.cid.bytes.byteLength

    if (this.estimateNewSizeAfter(newSize) > MAX_MESSAGE_SIZE) {
      return false
    }

    this.wantlist.entries.push(entry)
    this.estimatedLength += newSize

    return true
  }

  estimateNewSizeAfter (newElement) {
    return (this.estimatedLength + newElement) * (1 + ADDED_ESTIMATION_PERCENTAGE)
  }
}

export const { WantType } = gen.Message.Wantlist
export const { BlockPresenceType } = gen.Message
