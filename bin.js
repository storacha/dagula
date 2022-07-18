#!/usr/bin/env node

import fs from 'fs'
import sade from 'sade'
import Conf from 'conf'
import { CID } from 'multiformats/cid'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { CarWriter } from '@ipld/car'
import { Dagula } from './index.js'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)))

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
  .action(async (cid, { peer }) => {
    const dagula = new Dagula(peer)
    try {
      const block = await dagula.getBlock(cid)
      process.stdout.write(block)
    } finally {
      await dagula.destroy()
    }
  })

cli.command('get <cid>')
  .describe('Fetch a DAG from the peer. Outputs a CAR file.')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .action(async (cid, { peer }) => {
    cid = CID.parse(cid)
    const dagula = new Dagula(peer)
    const { writer, out } = CarWriter.create(cid)
    try {
      let error
      ;(async () => {
        try {
          for await (const block of dagula.get(cid)) {
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
      await dagula.destroy()
    }
  })

cli.command('unixfs get <path>')
  .describe('Fetch a UnixFS file from the peer.')
  .option('-p, --peer', 'Address of peer to fetch data from.')
  .action(async (path, { peer }) => {
    const dagula = new Dagula(peer)
    try {
      const entry = await dagula.getUnixfs(path)
      if (entry.type === 'directory') throw new Error(`${path} is a directory`)
      await pipeline(Readable.from(entry.content()), process.stdout)
    } finally {
      await dagula.destroy()
    }
  })

cli.parse(process.argv)
