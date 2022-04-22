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

test('custom encoding', async (t) => {
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

test('custom encoding, separate', async (t) => {
  const rpc = new RPC(new PassThrough())

  const opts = { requestEncoding: string, responseEncoding: uint }

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

  t.exception(rpc.request('echo', Buffer.alloc(0)), /unknown method 'echo'/)
})

test('reject request that throws', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('throw', () => {
    throw new Error('whoops')
  })

  t.exception(rpc.request('throw', Buffer.alloc(0)), /whoops/)
})

test('reject request after close', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)
  rpc.close()

  t.exception(rpc.request('echo', Buffer.alloc(0)), /channel closed/)
})

test('reject in-progress request on close', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  rpc.close()

  t.exception(req, /channel closed/)
})

test('reject in-progress request on stream destroy', async (t) => {
  const stream = new PassThrough()

  const rpc = new RPC(stream)

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  stream.destroy()

  t.exception(req, /channel closed/)
})

test('reject in-progress request on muxer destroy', async (t) => {
  const mux = new Protomux(new PassThrough())

  const rpc = new RPC(mux)

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  mux.destroy()

  t.exception(req, /channel closed/)
})

test('handshake', async (t) => {
  t.plan(1)

  const rpc = new RPC(new PassThrough(), { handshake: Buffer.from('hello') })

  rpc.on('open', (handshake) => {
    t.alike(handshake, Buffer.from('hello'))
  })
})

test('handshake, custom encoding', async (t) => {
  t.plan(1)

  const rpc = new RPC(new PassThrough(), {
    handshake: 'hello',
    handshakeEncoding: string
  })

  rpc.on('open', (handshake) => {
    t.is(handshake, 'hello')
  })
})

test('multiple rpcs on same muxer', async (t) => {
  const mux = new Protomux(new PassThrough())

  await t.execution(() =>
    new RPC(mux, { id: Buffer.from('a') })
  )

  await t.execution(() =>
    new RPC(mux, { id: Buffer.from('b') })
  )
})

test('duplicate rpcs on same muxer throws', async (t) => {
  const mux = new Protomux(new PassThrough())

  await t.execution(() => new RPC(mux))

  await t.exception(() => new RPC(mux), /duplicate channel/)
})
