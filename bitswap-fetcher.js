import defer from 'p-defer'
import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import debug from 'debug'
import { Entry, Message, BlockPresenceType } from './message.js'

/** @typedef {import('./index').Block} Block */

const SEND_WANTLIST_DELAY = 5
const log = debug('dagula:bitswapfetcher')

export class BitswapFetcher {
  /** @type {() => Promise<import('@libp2p/interface-connection').Stream>} */
  #newStream
  /** @type {Map<string, Array<{ cid: import('multiformats').CID, deferredPromise: import('p-defer').DeferredPromise<Block|undefined> }>>} */
  #wants = new Map()
  /** @type {import('multiformats').CID[]} */
  #wantlist = []

  /**
   * @param {() => Promise<import('@libp2p/interface-connection').Stream>} newStream
   */
  constructor (newStream) {
    this.#newStream = newStream
    this.handler = this.handler.bind(this)
  }

  #sendingWantlist = false

  async #sendWantlist () {
    if (this.#sendingWantlist) return
    this.#sendingWantlist = true
    setTimeout(async () => {
      this.#sendingWantlist = false
      if (!this.#wantlist.length) return
      /** @type {import('@libp2p/interface-connection').Stream?} */
      let stream = null
      try {
        const wantlist = this.#wantlist
        this.#wantlist = []
        stream = await this.#newStream()
        await pipe(
          (function * () {
            let message = new Message()
            for (const cid of wantlist) {
              const entry = new Entry(cid, { sendDontHave: true })
              if (!message.addWantlistEntry(entry)) {
                log('sending message with %d CIDs', message.wantlist.entries.length)
                yield message.encode()
                message = new Message()
                message.addWantlistEntry(entry)
              }
            }
            if (message.wantlist.entries.length) {
              log('sending message with %d CIDs', message.wantlist.entries.length)
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
            log('message with %d blocks', message.blocks.length)
            for (const { data } of message.blocks) {
              const hash = await sha256.digest(data)
              const key = base58btc.encode(hash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              log('got block for wanted multihash %s', key)
              this.#wants.delete(key)
              for (const { cid, deferredPromise } of keyWants) {
                deferredPromise.resolve({ cid, bytes: data })
              }
            }
            for (const presence of message.blockPresences) {
              if (presence.type !== BlockPresenceType.DontHave) continue
              const key = base58btc.encode(presence.cid.multihash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              this.#wants.delete(key)
              for (const { deferredPromise } of keyWants) {
                deferredPromise.resolve(undefined)
              }
            }
          }
        }
      )
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
