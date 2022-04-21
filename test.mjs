import test from 'brittle'
import Protomux from 'protomux'
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

test('void', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('void', (req) => {
    t.is(req, null)
  })

  t.alike(
    await rpc.request('void'),
    null
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

test('reject unknown method', async (t) => {
  const rpc = new RPC(new PassThrough())

  t.exception(rpc.request('echo'), /unknown method 'echo'/)
})

test('reject request that throws', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('throw', () => {
    throw new Error('whoops')
  })

  t.exception(rpc.request('throw'), /whoops/)
})

test('reject request after close', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('void')
  rpc.close()

  t.exception(rpc.request('void'), /channel closed/)
})

test('reject in-progress request on close', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('void')

  const req = rpc.request('void')

  rpc.close()

  t.exception(req, /channel closed/)
})

test('reject in-progress request on muxer destroy', async (t) => {
  const mux = new Protomux(new PassThrough())
  const rpc = new RPC(mux)

  rpc.respond('void')

  const req = rpc.request('void')

  mux.destroy()

  t.exception(req, /channel closed/)
})
