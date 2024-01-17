import test from 'ava'
import { fromString, toString } from 'multiformats/bytes'
import * as raw from 'multiformats/codecs/raw'
import * as dagPB from '@ipld/dag-pb'
import * as dagCbor from '@ipld/dag-cbor'
import { UnixFS } from 'ipfs-unixfs'
import { sha256 } from 'multiformats/hashes/sha2'
import { blake2b256 } from '@multiformats/blake2/blake2b'
import { CID } from 'multiformats/cid'
import { TimeoutController } from 'timeout-abort-controller'
import { getLibp2p, fromNetwork } from '../p2p.js'
import { startBitswapPeer } from './_libp2p.js'

test('should fetch a single CID', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  for await (const block of dagula.get(cid)) {
    t.is(block.cid.toString(), cid.toString())
    t.is(toString(block.bytes), toString(bytes))
  }
})

test('should not yield blocks that cannot be decoded', async t => {
  const bytes = dagCbor.encode({ TEST: `DATA ${Date.now()}` })
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, dagCbor.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0], decoders: {} })
  const blocks = []
  await t.throwsAsync(async () => {
    for await (const block of dagula.get(cid)) {
      blocks.push(block)
    }
  }, { message: 'unknown codec: 0x71' })
  t.is(blocks.length, 0)
})

test('should not yield blocks that cannot be hashed', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await blake2b256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0], hashers: {} })
  const blocks = []
  await t.throwsAsync(async () => {
    for await (const block of dagula.get(cid)) {
      blocks.push(block)
    }
  })
  t.is(blocks.length, 0)
})

test('should fetch blake2b hashed data', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await blake2b256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const peer = await startBitswapPeer([{ cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0], hashers: { [blake2b256.code]: blake2b256 } })
  for await (const block of dagula.get(cid)) {
    t.is(block.cid.toString(), cid.toString())
    t.is(toString(block.bytes), toString(bytes))
  }
})

test.only('should walk a unixfs path', async t => {
  const bytes = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, raw.code, hash)
  const linkName = 'foo'
  const dirData = new UnixFS({ type: 'directory' }).marshal()
  const dirBytes = dagPB.encode(dagPB.prepare({ Data: dirData, Links: [{ Name: linkName, Hash: cid }] }))
  const dirCid = CID.create(1, dagPB.code, await sha256.digest(dirBytes))
  const peer = await startBitswapPeer([{ cid: dirCid, bytes: dirBytes }, { cid, bytes }])

  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.walkUnixfsPath(`${dirCid}/${linkName}`)) {
    entries.push(entry)
  }
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, dirCid)
  t.deepEqual(entries.at(1).cid, cid)
})

test('should abort a fetch', async t => {
  const peer = await startBitswapPeer()
  const libp2p = await getLibp2p()
  const dagula = await fromNetwork(libp2p, { peer: peer.libp2p.getMultiaddrs()[0] })
  // not in the blockstore so will hang indefinitely
  const cid = 'bafkreig7tekltu2k2bci74rpbyrruft4e7nrepzo4z36ie4n2bado5ru74'
  const controller = new TimeoutController(1_000)
  const err = await t.throwsAsync(() => dagula.getBlock(cid, { signal: controller.signal }))
  t.is(err?.name, 'AbortError')
})
