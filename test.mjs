import test from 'brittle'
import Protomux from 'protomux'
import { PassThrough } from 'streamx'
import { none, string, uint } from 'compact-encoding'

import RPC from './index.js'

test('basic', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  t.alike(
    await rpc.request('echo', Buffer.from('hello world')),
    Buffer.from('hello world')
  )
})

test('event', async (t) => {
  t.plan(2)

  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => {
    t.alike(req, Buffer.from('hello world'))
    return req
  })

  t.absent(rpc.event('echo', Buffer.from('hello world')))
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

test('custom encoding, separate with error', async (t) => {
  const rpc = new RPC(new PassThrough())

  const responseEncoding = {
    preencode (state, v) {
      isUint(v) && uint.preencode(state, v)
    },
    encode (state, v) {
      isUint(v) && uint.encode(state, v)
    },
    decode (state) {
      uint.decode(state)
    }
  }

  const opts = { requestEncoding: string, responseEncoding }

  rpc.respond('length', opts, (req) => {
    throw new Error('whoops')
  })

  try {
    await rpc.request('length', 'hello world', opts)
  } catch (e) {
    t.is(e.message, 'whoops')
  }

  function isUint (n) {
    if (typeof v !== 'number') throw new Error('expected number')
    if (n < 0) throw new Error('expected unsigned int')
  }
})

test('custom default encoding', async (t) => {
  const rpc = new RPC(new PassThrough(), {
    valueEncoding: string
  })

  rpc.respond('echo', (req) => {
    t.is(req, 'hello world')
    return req
  })

  t.is(
    await rpc.request('echo', 'hello world'),
    'hello world'
  )
})

test('void method', async (t) => {
  const rpc = new RPC(new PassThrough(), {
    valueEncoding: none
  })

  rpc.respond('void', (req) => {
    t.is(req, null)
  })

  t.is(
    await rpc.request('void'),
    null
  )
})

test('reject unknown method', async (t) => {
  const rpc = new RPC(new PassThrough())

  await t.exception(rpc.request('echo', Buffer.alloc(0)), /unknown method 'echo'/)
})

test('reject method after unrespond', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  await t.execution(rpc.request('echo', Buffer.alloc(0)))

  rpc.unrespond('echo')

  await t.exception(rpc.request('echo', Buffer.alloc(0)), /unknown method 'echo'/)
})

test('reject request that throws', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('throw', () => {
    throw new Error('whoops')
  })

  await t.exception(rpc.request('throw', Buffer.alloc(0)), /whoops/)
})

test('reject request after end', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)
  rpc.end()

  await t.exception(rpc.request('echo', Buffer.alloc(0)), /channel closed/)
})

test('await inflight request on end', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  rpc.end()

  await t.execution(req)
})

test('reject inflight request on destroy', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  rpc.destroy()

  await t.exception(req, /channel destroyed/)
})

test('reject inflight request on destroy, custom error', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  rpc.destroy(new Error('whoops'))

  await t.exception(req, /whoops/)
})

test('reject inflight request on stream destroy', async (t) => {
  const stream = new PassThrough()

  const rpc = new RPC(stream)

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  stream.destroy()

  await t.exception(req, /channel closed/)
})

test('reject inflight request on muxer destroy', async (t) => {
  const mux = new Protomux(new PassThrough())

  const rpc = new RPC(mux)

  rpc.respond('echo', (req) => req)

  const req = rpc.request('echo', Buffer.alloc(0))

  mux.destroy()

  await t.exception(req, /channel closed/)
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

test('timeout', async (t) => {
  const rpc = new RPC(new PassThrough())

  rpc.respond('echo', (req) => new Promise((resolve) =>
    setTimeout(() => resolve(req), 200)
  ))

  await t.exception(
    () => rpc.request('echo', Buffer.from('hello world'), { timeout: 100 }),
    /timeout exceeded/
  )
})
