import test from 'brittle'
import Protomux from 'protomux'
import { PassThrough } from 'streamx'
import { string, uint } from 'compact-encoding'

import RPC from './index.js'

test('basic', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  rpc.respond('echo', (req) => req)

  t.alike(
    await rpc.request('echo', Buffer.from('hello world')),
    Buffer.from('hello world')
  )
})

test('void', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  rpc.respond('void', (req) => {
    t.is(req, null)
  })

  t.alike(
    await rpc.request('void'),
    null
  )
})

test('json encoding', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  const opts = { valueEncoding: 'json' }

  rpc.respond('echo', opts, (req) => {
    t.alike(req, { hello: 'world' })
    return req
  })

  t.alike(
    await rpc.request('echo', { hello: 'world' }, opts),
    { hello: 'world' }
  )
})

test('custom encoding', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

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
  rpc.open()

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
  rpc.open()

  t.exception(rpc.request('echo'), /unknown method 'echo'/)
})

test('reject request that throws', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  rpc.respond('throw', () => {
    throw new Error('whoops')
  })

  t.exception(rpc.request('throw'), /whoops/)
})

test('reject request after close', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  rpc.respond('void')
  rpc.close()

  t.exception(rpc.request('void'), /channel closed/)
})

test('reject in-progress request on close', async (t) => {
  const rpc = new RPC(new PassThrough())
  rpc.open()

  rpc.respond('void')

  const req = rpc.request('void')

  rpc.close()

  t.exception(req, /channel closed/)
})

test('reject in-progress request on muxer destroy', async (t) => {
  const mux = new Protomux(new PassThrough())

  const rpc = new RPC(mux)
  rpc.open()

  rpc.respond('void')

  const req = rpc.request('void')

  mux.destroy()

  t.exception(req, /channel closed/)
})

test('handshake', async (t) => {
  t.plan(1)

  const rpc = new RPC(new PassThrough(), { handshake: string })
  rpc.open('hello')

  rpc.on('open', (handshake) => {
    t.is(handshake, 'hello')
  })
})

test('multiple rpcs on same muxer', async (t) => {
  const mux = new Protomux(new PassThrough())

  await t.execution(() => {
    const rpc = new RPC(mux, { id: Buffer.from('a') })
    rpc.open()
  })

  await t.execution(() => {
    const rpc = new RPC(mux, { id: Buffer.from('b') })
    rpc.open()
  })
})

test('duplicate rpcs on same muxer throws', async (t) => {
  const mux = new Protomux(new PassThrough())

  await t.execution(() => {
    const rpc = new RPC(mux)
    rpc.open()
  })

  await t.exception(() => {
    const rpc = new RPC(mux)
    rpc.open()
  }, /duplicate channel/)
})
