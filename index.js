import { Multiaddr } from '@multiformats/multiaddr'
import debug from 'debug'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import * as dagPb from '@ipld/dag-pb'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagJson from '@ipld/dag-json'
import * as Block from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { exporter } from '@web3-storage/fast-unixfs-exporter'
import { transform } from 'streaming-iterables'
import { BitswapFetcher } from './bitswap-fetcher.js'

/**
 * @typedef {import('./index').Blockstore} Blockstore
 * @typedef {import('./index').BlockDecoders} BlockDecoders
 */

const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const DEFAULT_PEER = new Multiaddr('/dns4/peer.ipfs-elastic-provider-aws.com/tcp/3000/ws/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm')

const log = debug('dagular')

/** @type {BlockDecoders} */
export const Decoders = {
  [raw.code]: raw,
  [dagPb.code]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagJson.code]: dagJson
}

export class Dagula {
  /** @type {Blockstore} */
  #blockstore

  /** @type {BlockDecoders} */
  #decoders

  /**
   * @param {Blockstore} blockstore
   * @param {{ decoders?: BlockDecoders }} [options]
   */
  constructor (blockstore, options = {}) {
    this.#blockstore = blockstore
    this.#decoders = options.decoders || Decoders
  }

  /**
   * @param {import('./index').Network} network
   * @param {Multiaddr|string} peer
   * @param {{ decoders?: BlockDecoders, peer?: Multiaddr }} [options]
   */
  static async fromNetwork (network, options = {}) {
    const peer = (typeof options.peer === 'string' ? new Multiaddr(options.peer) : options.peer) || DEFAULT_PEER
    const bitswap = new BitswapFetcher(async () => {
      log('new stream to %s', peer)
      const { stream } = await network.dialProtocol(peer, BITSWAP_PROTOCOL, { lazy: true })
      return stream
    })

    // incoming blocks
    await network.handle(BITSWAP_PROTOCOL, bitswap.handler)

    return new Dagula(bitswap, options)
  }

  /**
   * @param {import('multiformats').CID|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async * get (cid, { signal } = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting DAG %s', cid)
    let cids = [cid]
    while (true) {
      log('fetching %d CIDs', cids.length)
      const fetchBlocks = transform(cids.length, async cid => {
        const bytes = await this.#blockstore.get(cid, { signal })
        return { cid, bytes }
      })
      const nextCids = []
      for await (const { cid, bytes } of fetchBlocks(cids)) {
        const decoder = this.#decoders[cid.code]
        if (!decoder) {
          yield { cid, bytes }
          throw new Error(`unknown codec: ${cid.code}`)
        }
        log('decoding block %s', cid)
        const block = await Block.decode({ bytes, codec: decoder, hasher })
        yield block
        for (const [, cid] of block.links()) {
          nextCids.push(cid)
        }
      }
      if (!nextCids.length) break
      log('%d CIDs in links', nextCids.length)
      cids = nextCids
    }
  }

  /**
   * @param {import('multiformats').CID|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getBlock (cid, { signal } = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting block %s', cid)
    return this.#blockstore.get(cid, { signal })
  }

  /**
   * @param {string|import('multiformats').CID} path
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getUnixfs (path, { signal } = {}) {
    log('getting unixfs %s', path)
    return exporter(path, this.#blockstore, { signal })
  }
}
