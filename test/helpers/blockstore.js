export class MemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  #blocks = new Map()

  /** @param {import('multiformats').UnknownLink} cid */
  async get (cid) {
    const bytes = this.#blocks.get(cid.toString())
    if (bytes) return { cid, bytes }
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }
}
