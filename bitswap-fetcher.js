import defer from 'p-defer'
import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import debug from 'debug'
import { Entry, Message, BlockPresenceType } from './message.js'

const SEND_WANTLIST_DELAY = 5
const log = debug('dagular:bitswapfetcher')

export class BitswapFetcher {
  /** @type {() => Promise<import("@libp2p/interfaces/connection").Stream} */
  #newStream = null
  /** @type {Map<string, import('p-defer').DeferredPromise<Uint8Array>[]>} */
  #wants = new Map()
  /** @type {import('multiformats').CID[]} */
  #wantlist = []

  /**
   * @param {() => Promise<import("@libp2p/interfaces/connection").Stream} newStream
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
      /** @type {import('@libp2p/interfaces/connection').Stream} */
      let stream
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
  get (cid, { signal } = {}) {
    if (signal?.aborted) {
      throw signal.reason || abortError()
    }

    const key = base58btc.encode(cid.multihash.bytes)
    const keyWants = this.#wants.get(key)
    const deferred = defer()

    if (keyWants) {
      keyWants.push(deferred)
    } else {
      this.#wants.set(key, [deferred])
      this.#wantlist.push(cid)
      this.#sendWantlist()
    }

    signal?.addEventListener('abort', () => {
      const keyWants = (this.#wants.get(key) || []).filter(d => d !== deferred)
      if (keyWants.length) {
        this.#wants.set(key, keyWants)
      } else {
        this.#wants.delete(key)
      }
      deferred.reject(signal.reason ?? abortError())
    })

    return deferred.promise
  }

  /** @type {import('@libp2p/interfaces/registrar').StreamHandler} */
  async handler ({ stream }) {
    log('incoming stream')
    try {
      await pipe(
        stream,
        lp.decode(),
        async source => {
          for await (const data of source) {
            const message = Message.decode(data)
            log('message with %d blocks', message.blocks.length)
            for (const { data } of message.blocks) {
              const hash = await sha256.digest(data)
              const key = base58btc.encode(hash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              log('got block for wanted multihash %s', key)
              this.#wants.delete(key)
              for (const { resolve } of keyWants) {
                resolve(data)
              }
            }
            for (const presence of message.blockPresences) {
              if (presence.type !== BlockPresenceType.DontHave) continue
              const key = base58btc.encode(presence.cid.multihash.bytes)
              const keyWants = this.#wants.get(key)
              if (!keyWants) continue
              this.#wants.delete(key)
              for (const { reject } of keyWants) {
                reject(Object.assign(new Error(`peer does not have: ${presence.cid}`), { code: 'ERR_DONT_HAVE' }))
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
