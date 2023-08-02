#!/usr/bin/env node

import fs from 'fs'
import sade from 'sade'
import Conf from 'conf'
import { CID } from 'multiformats/cid'
import { Block } from 'multiformats/block'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { CarWriter } from '@ipld/car'
import { TimeoutController } from 'timeout-abort-controller'
import { getLibp2p, fromNetwork } from './p2p.js'
import archy from 'archy'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)).toString())
const TIMEOUT = 10_000

const config = new Conf({
  projectName: 'dagula',
  projectVersion: pkg.version,
  configFileMode: 0o600
})

const cli = sade('dagula')

cli
  .version(pkg.version)
  .example('get bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy')

cli.command('peer set <addr>')
  .describe('Save a peer multiaddr to use for all requests.')
  .action(addr => {
    config.set('peer', addr)
    console.log('🧛 Peer multiaddr saved')
  })

cli.command('block get <cid>')
  .describe('Fetch a block from the peer.')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .option('-t, --timeout', 'Timeout in milliseconds.', TIMEOUT)
  .action(async (cid, { peer, timeout }) => {
    const controller = new TimeoutController(timeout)
    const libp2p = await getLibp2p()
    const dagula = await fromNetwork(libp2p, { peer })
    try {
      const block = await dagula.getBlock(cid, { signal: controller.signal })
      process.stdout.write(block.bytes)
    } finally {
      controller.clear()
      await libp2p.stop()
    }
  })

cli.command('get <cid>')
  .describe('Fetch a DAG from the peer. Outputs a CAR file.')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .option('-r, --order', 'Specify returned order of blocks in the DAG, "dfs" or "unk"', 'dfs')
  .option('-s, --dag-scope', 'Specify the set of blocks of the targeted DAG to get, "all", "entity" or "block"', 'all')
  .option('-t, --timeout', 'Timeout in milliseconds.', TIMEOUT)
  .action(async (cidPath, { peer, order, 'dag-scope': dagScope, timeout }) => {
    const [cidStr] = cidPath.replace(/^\/ipfs\//, '').split('/')
    const cid = CID.parse(cidStr)
    const controller = new TimeoutController(timeout)
    const libp2p = await getLibp2p()
    const dagula = await fromNetwork(libp2p, { peer })
    const { writer, out } = CarWriter.create(cid)
    try {
      let error
      ;(async () => {
        try {
          for await (const block of dagula.getPath(cidPath, { signal: controller.signal, order, dagScope })) {
            controller.reset()
            await writer.put(block)
          }
        } catch (err) {
          error = err
        } finally {
          await writer.close()
        }
      })()
      await pipeline(Readable.from(out), process.stdout)
      if (error) throw error
    } finally {
      controller.clear()
      await libp2p.stop()
    }
  })

cli.command('unixfs get <path>')
  .describe('Fetch a UnixFS file from the peer.')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .option('-t, --timeout', 'Timeout in milliseconds.', TIMEOUT)
  .action(async (path, { peer, timeout }) => {
    const controller = new TimeoutController(timeout)
    const libp2p = await getLibp2p()
    const dagula = await fromNetwork(libp2p, { peer })
    try {
      const entry = await dagula.getUnixfs(path, { signal: controller.signal })
      if (entry.type === 'directory') throw new Error(`${path} is a directory`)
      await pipeline(
        Readable.from((async function * () {
          for await (const chunk of entry.content()) {
            controller.reset()
            yield chunk
          }
        })()),
        process.stdout
      )
    } finally {
      controller.clear()
      await libp2p.stop()
    }
  })

cli.command('ls <cid>')
  .describe('Fetch a DAG from the peer and log the CIDs as blocks arrive')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .option('-t, --timeout', 'Timeout in milliseconds.', TIMEOUT)
  .action(async (cid, { peer, timeout }) => {
    cid = CID.parse(cid)
    const controller = new TimeoutController(timeout)
    const libp2p = await getLibp2p()
    const dagula = await fromNetwork(libp2p, { peer })
    try {
      for await (const block of dagula.get(cid, { signal: controller.signal })) {
        controller.reset()
        console.log(block.cid.toString())
      }
    } finally {
      controller.clear()
      await libp2p.stop()
    }
  })

cli.command('tree <cid>')
  .describe('Fetch a DAG from the peer then print the CIDs as a tree')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .option('-t, --timeout', 'Timeout in milliseconds.', TIMEOUT)
  .action(async (cid, { peer, timeout }) => {
    cid = CID.parse(cid)
    const controller = new TimeoutController(timeout)
    const libp2p = await getLibp2p()
    const dagula = await fromNetwork(libp2p, { peer })
    // build up the tree, starting with the root
    /** @type {archy.Data} */
    const root = { label: cid.toString(), nodes: [] }
    // used to find nodes in the tree
    const allNodes = new Map([[root.label, root]])
    try {
      for await (const block of dagula.get(cid, { signal: controller.signal })) {
        controller.reset()
        const node = allNodes.get(block.cid.toString())
        if (!node) throw new Error('missing node in tree')
        if (block instanceof Block) {
          for (const [, linkCid] of block.links()) {
            let target = allNodes.get(linkCid.toString())
            if (!target) {
              target = { label: linkCid.toString(), nodes: [] }
              allNodes.set(target.label, target)
            }
            node.nodes = node.nodes || []
            node.nodes.push(target)
          }
        }
      }
      console.log(archy(root))
    } finally {
      controller.clear()
      await libp2p.stop()
    }
  })

cli.parse(process.argv)
