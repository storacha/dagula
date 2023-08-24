import { Map as LinkMap } from 'lnmap'

export class MemoryBlockstore {
  /** @type {Map<import('multiformats').UnknownLink, Uint8Array>} */
  #blocks = new LinkMap()

  /** @param {import('multiformats').UnknownLink} cid */
  async get (cid) {
    const bytes = this.#blocks.get(cid)
    if (bytes) return { cid, bytes }
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.#blocks.set(cid, bytes)
  }
}
