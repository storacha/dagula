import test from 'ava'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { fromString } from 'uint8arrays'
import * as raw from 'multiformats/codecs/raw'
import * as dagPB from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { Dagula } from '../index.js'
import { getLibp2p } from '../p2p.js'

test('should getPath', async t => {
  // should return all blocks in path and all blocks for resolved target of path
  const serverBlockstore = new MemoryBlockstore()
  const filePart1 = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.decode({ codec: raw, bytes: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  for (const { cid, bytes } of [filePart1, filePart2, fileNode, dirNode]) {
    await serverBlockstore.put(cid, bytes)
  }

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`)) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 4)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
  t.deepEqual(entries.at(2).cid, filePart1.cid)
  t.deepEqual(entries.at(2).bytes, filePart1.bytes)
  t.deepEqual(entries.at(3).cid, filePart2.cid)
  t.deepEqual(entries.at(3).bytes, filePart2.bytes)
})

test('should getPath on file with carScope=file', async t => {
  // return all blocks in path and all blocks for resolved target of path
  const serverBlockstore = new MemoryBlockstore()
  const filePart1 = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.decode({ codec: raw, bytes: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  for (const { cid, bytes } of [filePart1, filePart2, fileNode, dirNode]) {
    await serverBlockstore.put(cid, bytes)
  }

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  const entries = []
  const carScope = 'file'
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`, { carScope })) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 4)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
  t.deepEqual(entries.at(2).cid, filePart1.cid)
  t.deepEqual(entries.at(2).bytes, filePart1.bytes)
  t.deepEqual(entries.at(3).cid, filePart2.cid)
  t.deepEqual(entries.at(3).bytes, filePart2.bytes)
})

test('should getPath on file with carScope=block', async t => {
  // return all blocks in path and all blocks for resolved target of path
  const serverBlockstore = new MemoryBlockstore()
  const filePart1 = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const filePart2 = await Block.decode({ codec: raw, bytes: fromString(`EVEN MORE TEST DATA ${Date.now()}`), hasher: sha256 })
  const fileNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'file' }).marshal(),
      Links: [
        { Name: '0', Hash: filePart1.cid },
        { Name: '1', Hash: filePart2.cid }
      ]
    }
  })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: fileNode.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  for (const { cid, bytes } of [filePart1, filePart2, fileNode, dirNode]) {
    await serverBlockstore.put(cid, bytes)
  }

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  const entries = []
  const carScope = 'block'
  for await (const entry of dagula.getPath(`${dirNode.cid}/foo`, { carScope })) {
    entries.push(entry)
  }
  // did not try and return block for `other`
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
  t.deepEqual(entries.at(1).cid, fileNode.cid)
  t.deepEqual(entries.at(1).bytes, fileNode.bytes)
})

test('should getPath on dir with carScope=file', async t => {
  // return all blocks in path. as it's a dir, it should stop there
  const serverBlockstore = new MemoryBlockstore()
  const file = await Block.decode({ codec: raw, bytes: fromString(`MORE TEST DATA ${Date.now()}`), hasher: sha256 })

  const dirNode = await Block.encode({
    codec: dagPB,
    hasher: sha256,
    value: {
      Data: new UnixFS({ type: 'directory' }).marshal(),
      Links: [
        { Name: 'foo', Hash: file.cid },
        { Name: 'other', Hash: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
      ]
    }
  })

  for (const { cid, bytes } of [file, dirNode]) {
    await serverBlockstore.put(cid, bytes)
  }

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.getPath(`${dirNode.cid}`, { carScope: 'file' })) {
    entries.push(entry)
  }
  // only return the dir if carScope=file and target is a dir
  t.is(entries.length, 1)
  t.deepEqual(entries.at(0).cid, dirNode.cid)
  t.deepEqual(entries.at(0).bytes, dirNode.bytes)
})
