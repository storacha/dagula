/* global ReadableStream */
import debug from 'debug'
import * as Link from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import * as Claims from '@web3-storage/content-claims/client'
import { MultihashIndexSortedReader } from 'cardex/multihash-index-sorted'
import { Map as LinkMap } from 'lnmap'
import * as CAR from './car.js'

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('./api').IndexEntry} IndexEntry
 * @typedef {import('./api').Index} Index
 */

const log = debug('dagula:fetcher:content-claims:dag-index')

/** @implements {Index} */
export class ContentClaimsIndex {
  /**
   * Index store.
   * @type {import('../../bindings').SimpleBucket}
   */
  #bucket
  /**
   * Cached index entries.
   * @type {Map<UnknownLink, IndexEntry>}
   */
  #cache
  /**
   * CIDs for which we have already fetched claims.
   *
   * Note: _only_ the CIDs which have been explicitly queried, for which we
   * have made a content claim request. Not using `this.#cache` because reading
   * a claim may cause us to add other CIDs to the cache that we haven't read
   * claims for.
   *
   * Note: implemented as a Map not a Set so that we take advantage of the
   * key cache that `lnmap` provides, so we don't duplicate base58 encoded
   * multihash keys.
   * @type {Map<UnknownLink, true>}
   */
  #claimFetched
  /**
   * @type {URL|undefined}
   */
  #serviceURL

  /**
   * @param {import('../../bindings').SimpleBucket} bucket Bucket that stores CARs.
   * @param {{ serviceURL?: URL }} [options]
   */
  constructor (bucket, options) {
    this.#bucket = bucket
    this.#cache = new LinkMap()
    this.#claimFetched = new LinkMap()
    this.#serviceURL = options?.serviceURL
  }

  /**
   * @param {UnknownLink} cid
   * @returns {Promise<IndexEntry | undefined>}
   */
  async get (cid) {
    // get the index data for this CID (CAR CID & offset)
    let indexItem = this.#cache.get(cid)

    // read the index for _this_ CID to get the index data for it's _links_.
    //
    // when we get to the bottom of the tree (raw blocks), we want to be able
    // to send back the index information without having to read claims for
    // each leaf. We can only do that if we read the claims for the parent now.
    if (indexItem) {
      // we found the index data! ...if this CID is raw, then there's no links
      // and no more index information to discover so don't read claims.
      if (cid.code !== raw.code) {
        await this.#readClaims(cid)
      }
    } else {
      // we not found the index data!
      await this.#readClaims(cid)
      // seeing as we just read the index for this CID we _should_ have some
      // index information for it now.
      indexItem = this.#cache.get(cid)
      // if not then, well, it's not found!
      if (!indexItem) return
    }
    return indexItem
  }

  /**
   * Read claims for the passed CID and populate the cache.
   * @param {import('multiformats').UnknownLink} cid
   */
  async #readClaims (cid) {
    if (this.#claimFetched.has(cid)) return

    const claims = await Claims.read(cid, { serviceURL: this.#serviceURL })
    for (const claim of claims) {
      // skip anything that is not a relation claim, since we know by
      // our naming convention that our CAR files are named after their hash
      // and we don't serve anything that we don't have in our own bucket.
      if (claim.type !== 'assert/relation') continue

      // export the blocks from the claim - may include the CARv2 indexes
      const blocks = [...claim.export()]

      // each part is a tuple of CAR CID (content) & CARv2 index CID (includes)
      for (const { content, includes } of claim.parts) {
        if (!isCARLink(content)) continue
        if (!includes) continue

        /** @type {{ cid: import('multiformats').UnknownLink, bytes: Uint8Array }|undefined} */
        let block = blocks.find(b => b.cid.toString() === includes.content.toString())

        // if the index is not included in the claim, it should be in CARPARK
        if (!block && includes.parts?.length) {
          const obj = await this.#bucket.get(`${includes.parts[0]}/${includes.parts[0]}.car`)
          if (!obj) continue
          const blocks = await CAR.decode(new Uint8Array(await obj.arrayBuffer()))
          block = blocks.find(b => b.cid.toString() === includes.content.toString())
        }
        if (!block) continue

        const entries = await decodeIndex(content, block.bytes)
        for (const entry of entries) {
          this.#cache.set(Link.create(raw.code, entry.multihash), entry)
        }
      }
      break
    }
    this.#claimFetched.set(cid, true)
  }
}

/**
 * @param {import('multiformats').Link} cid
 * @returns {cid is import('cardex/api').CARLink}
 */
const isCARLink = cid => cid.code === CAR.code

/**
 * Read a MultihashIndexSorted index for the passed origin CAR and return a
 * list of IndexEntry.
 * @param {import('cardex/api').CARLink} origin
 * @param {Uint8Array} bytes
 */
const decodeIndex = async (origin, bytes) => {
  const entries = []
  const readable = new ReadableStream({
    pull (controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  })
  const reader = MultihashIndexSortedReader.createReader({ reader: readable.getReader() })
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    entries.push(/** @type {IndexEntry} */({ origin, ...value }))
  }
  return entries
}
