import defer from 'p-defer'
import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import debug from 'debug'
import { Entry, Message, BlockPresenceType } from './message.js'

/** @typedef {import('./index').Block} Block */

const MAX_OUTSTANDING_WANTS = 256
const SEND_WANTLIST_DELAY = 5
const log = debug('dagula:bitswapfetcher')

export class BitswapFetcher {
  /** @type {() => Promise<import('@libp2p/interface-connection').Stream>} */
  #newStream
  /** @type {Map<string, Array<{ cid: import('multiformats').CID, deferredPromise: import('p-defer').DeferredPromise<Block|undefined> }>>} */
  #wants = new Map()
  /** @type {import('multiformats').CID[]} */
  #wantlist = []
  /** @type {number} */
  #outstandingWants = 0

  /**
   * @param {() => Promise<import('@libp2p/interface-connection').Stream>} newStream
   */
  constructor (newStream) {
    this.#newStream = newStream
    this.handler = this.handler.bind(this)
  }

  #sendingWantlist = false

  #sendWantlist () {
    if (this.#sendingWantlist) return
    this.#sendingWantlist = true
    setTimeout(async () => {
      if (!this.#wantlist.length) return
      /** @type {import('@libp2p/interface-connection').Stream?} */
      let stream = null
      try {
        const maxEntries = MAX_OUTSTANDING_WANTS - this.#outstandingWants
        if (maxEntries <= 0) return
        const wantlist = this.#wantlist.slice(0, maxEntries)
        this.#wantlist = this.#wantlist.slice(maxEntries)
        this.#outstandingWants += wantlist.length
        stream = await this.#newStream()
        await pipe(
          (function * () {
            let message = new Message()
            for (const cid of wantlist) {
              const entry = new Entry(cid, { sendDontHave: true })
              if (!message.addWantlistEntry(entry)) {
                log('outgoing message with %d CIDs', message.wantlist.entries.length)
                yield message.encode()
                message = new Message()
                message.addWantlistEntry(entry)
              }
            }
            if (message.wantlist.entries.length) {
              log('outgoing message with %d CIDs', message.wantlist.entries.length)
              yield message.encode()
            }
          })(),
          lp.encode(),
          stream
        )
        stream.close()
      } catch (err) {
        console.error('outgoing stream error', err)
        if (stream) stream.abort(err)
      } finally {
        this.#sendingWantlist = false
        if (this.#wantlist.length) this.#sendWantlist()
      }
    }, SEND_WANTLIST_DELAY)
  }

  /**
   * @param {import('multiformats').CID} cid
   * @param {{ signal?: AbortSignal }} [options]
   */
  get (cid, options = {}) {
    if (options.signal?.aborted) {
      throw options.signal.reason || abortError()
    }

    const key = base58btc.encode(cid.multihash.bytes)
    const keyWants = this.#wants.get(key)
    /** @type {import('p-defer').DeferredPromise<Block | undefined>} */
    const deferred = defer()

    if (keyWants) {
      keyWants.push({ cid, deferredPromise: deferred })
    } else {
      this.#wants.set(key, [{ cid, deferredPromise: deferred }])
      this.#wantlist.push(cid)
      this.#sendWantlist()
    }

    options.signal?.addEventListener('abort', () => {
      const keyWants = (this.#wants.get(key) || [])
        .filter(({ deferredPromise }) => deferredPromise !== deferred)
      if (keyWants.length) {
        this.#wants.set(key, keyWants)
      } else {
        this.#wants.delete(key)
      }
      deferred.reject(options.signal?.reason ?? abortError())
    })

    return deferred.promise
  }

  /** @type {import('@libp2p/interface-registrar').StreamHandler} */
  async handler ({ stream }) {
    log('incoming stream')
    try {
      await pipe(
        stream,
        lp.decode(),
        async source => {
          for await (const data of source) {
            const message = Message.decode(data.subarray())
            log('incoming message with %d blocks and %d presences', message.blocks.length, message.blockPresences.length)
            for (const { data } of message.blocks) {
              const hash = await sha256.digest(data)
              const key = base58btc.encode(hash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              log('got block for wanted multihash %s', key)
              this.#wants.delete(key)
              this.#outstandingWants--
              for (const { cid, deferredPromise } of keyWants) {
                deferredPromise.resolve({ cid, bytes: data })
              }
            }
            for (const presence of message.blockPresences) {
              if (presence.type !== BlockPresenceType.DontHave) continue
              const key = base58btc.encode(presence.cid.multihash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              log('don\'t have wanted multihash %s', key)
              this.#wants.delete(key)
              this.#outstandingWants--
              for (const { deferredPromise } of keyWants) {
                deferredPromise.resolve(undefined)
              }
            }
          }
        }
      )
      stream.close()
    } catch (err) {
      console.error('incoming stream error', err)
    }
  }
}

function abortError () {
  const err = new Error('This operation was aborted')
  err.name = 'AbortError'
  return err
}
