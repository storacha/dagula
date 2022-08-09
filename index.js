import { Multiaddr } from '@multiformats/multiaddr'
import defer from 'p-defer'
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
 * @typedef {{ get: (cid: import('multiformats').CID) => Promise<Uint8Array>}} Blockstore
 * @typedef {{ libp2p: import('libp2p').Libp2p, blockstore: Blockstore }} Components
 * @typedef {import('./index').BlockDecoders} BlockDecoders
 */

const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const DEFAULT_PEER = new Multiaddr('/dns4/peer.ipfs-elastic-provider-aws.com/tcp/3000/ws/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm')

const log = debug('dagular')

/** @type {BlockDecoders} */
const Decoders = {
  [raw.code]: raw,
  [dagPb.code]: dagPb,
  [dagCbor.code]: dagCbor,
  [dagJson.code]: dagJson
}

export class Dagula {
  /** @type {import('./index').Network} */
  #network

  /** @type {Promise<Components>?} */
  #components

  /** @type {Multiaddr} */
  #peer

  /** @type {BlockDecoders} */
  #decoders

  /**
   * @param {import('./index').Network} network
   * @param {Multiaddr|string} peer
   * @param {{ decoders?: BlockDecoders }} [options]
   */
  constructor (network, peer, options = {}) {
    this.#network = network
    peer = typeof peer === 'string' ? new Multiaddr(peer) : peer
    this.#peer = peer || DEFAULT_PEER
    this.#decoders = options.decoders || Decoders
  }

  async #getComponents () {
    if (this.#components) return this.#components
    /** @type {import('p-defer').DeferredPromise<Components>} */
    const { promise, resolve, reject } = defer()
    this.#components = promise

    try {
      const bitswap = new BitswapFetcher(async () => {
        log('new stream to %s', this.#peer)
        const { stream } = await this.#network.dialProtocol(this.#peer, BITSWAP_PROTOCOL)
        return stream
      })

      // incoming blocks
      await this.#network.handle(BITSWAP_PROTOCOL, bitswap.handler)

      resolve({ network: this.#network, blockstore: bitswap })
    } catch (err) {
      reject(err)
    }

    return promise
  }

  /**
   * @param {import('multiformats').CID|string} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  async * get (cid, { signal } = {}) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid
    log('getting DAG %s', cid)
    const { blockstore } = await this.#getComponents()
    let cids = [cid]
    while (true) {
      log('fetching %d CIDs', cids.length)
      const fetchBlocks = transform(cids.length, async cid => {
        const bytes = await blockstore.get(cid, { signal })
        return { cid, bytes }
      })
      const nextCids = []
      for await (const { cid, bytes } of fetchBlocks(cids)) {
        yield { cid, bytes }
        const decoder = this.#decoders[cid.code]
        if (!decoder) throw new Error(`unknown codec: ${cid.code}`)
        log('decoding block %s', cid)
        const block = await Block.decode({ bytes, codec: decoder, hasher })
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
    const { blockstore } = await this.#getComponents()
    return blockstore.get(cid, { signal })
  }

  /**
   * @param {string|import('multiformats').CID} path
   * @param {{ signal?: AbortSignal }} [options]
   */
  async getUnixfs (path, { signal } = {}) {
    log('getting unixfs %s', path)
    const { blockstore } = await this.#getComponents()
    return exporter(path, blockstore, { signal })
  }
}
