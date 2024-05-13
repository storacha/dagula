import debug from 'debug'
import { CID } from 'multiformats/cid'

const log = debug('dagula:blocks')

/**
 * @typedef {import('./index').BlockService} BlockService
 * @implements {BlockService}
 */
export class Blocks {
  /** @type {import('./index').Blockstore} */
  #blockstore

  /**
   * @param {import('./index').BlockGetter & import('./index').BlockStreamer & import('./index').BlockInspecter} blockstore
   */
  constructor (blockstore) {
    this.#blockstore = blockstore
  }

  /**
   * @param {import('multiformats').UnknownLink|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getBlock (cid, options = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting block %s', cid)
    const block = await this.#blockstore.get(cid, { signal: options.signal })
    if (!block) {
      throw Object.assign(new Error(`peer does not have: ${cid}`), { code: 'ERR_DONT_HAVE' })
    }
    return block
  }

  /**
   * @param {import('multiformats').UnknownLink|string} cid
   * @param {import('./index').AbortOptions & import('./index').RangeOptions} [options]
   */
  async streamBlock (cid, options) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('streaming block %s', cid)
    const readable = await this.#blockstore.stream(cid, { signal: options?.signal, range: options?.range })
    if (!readable) {
      throw Object.assign(new Error(`peer does not have: ${cid}`), { code: 'ERR_DONT_HAVE' })
    }
    return readable
  }

  /**
   * @param {import('multiformats').UnknownLink|string} cid
   * @param {import('./index').AbortOptions} [options]
   */
  async statBlock (cid, options) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('stat block %s', cid)
    const stat = await this.#blockstore.stat(cid, { signal: options?.signal })
    if (!stat) {
      throw Object.assign(new Error(`peer does not have: ${cid}`), { code: 'ERR_DONT_HAVE' })
    }
    return stat
  }
}
