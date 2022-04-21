import test from 'brittle'
import { PassThrough } from 'streamx'
import { string, uint } from 'compact-encoding'

import RPC from './index.js'

test('basic', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  t.alike(
    await rpc.request('echo', Buffer.from('hello world')),
    Buffer.from('hello world')
  )
})

test('encoding', async (t) => {
  const rpc = new RPC(new PassThrough())

  const opts = { valueEncoding: string }

  rpc.respond('echo', opts, (req) => {
    t.is(req, 'hello world')
    return req
  })

  t.is(
    await rpc.request('echo', 'hello world', opts),
    'hello world'
  )
})

test('encoding, separate', async (t) => {
  const rpc = new RPC(new PassThrough())

  const opts = { valueEncoding: { request: string, response: uint } }

  rpc.respond('length', opts, (req) => {
    t.is(req, 'hello world')
    return req.length
  })

  t.is(
    await rpc.request('length', 'hello world', opts),
    11
  )
})
