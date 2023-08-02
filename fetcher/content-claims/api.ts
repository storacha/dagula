import { UnknownLink } from 'multiformats/link'
import { MultihashIndexItem } from 'cardex/multihash-index-sorted/api'
import { CARLink } from 'cardex/api'

export interface IndexEntry extends MultihashIndexItem {
  origin: CARLink
}

export interface Index {
  get (c: UnknownLink): Promise<IndexEntry|undefined>
}

export interface DataFetcherStreamOptions {
  range?: { offset: number, length?: number }
}

export interface DataFetcher {
  stream (k: string, options?: DataFetcherStreamOptions): Promise<ReadableStream<Uint8Array>>
}
