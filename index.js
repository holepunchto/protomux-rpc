const EventEmitter = require('events')
const Protomux = require('protomux')
const c = require('compact-encoding')

module.exports = class ProtomuxRPC extends EventEmitter {
  constructor (stream, options = {}) {
    super()

    const {
      id,
      handshake,
      handshakeEncoding
    } = options

    this._mux = Protomux.from(stream)

    this._id = 1

    this._requests = new Map()
    this._responders = new Map()

    this._channel = this._mux.createChannel({
      protocol: 'protomux-rpc',
      id,
      handshake: handshake ? handshakeEncoding || c.raw : null,
      onopen: this._onopen.bind(this),
      onclose: this._onclose.bind(this),
      ondestroy: this._ondestroy.bind(this)
    })

    if (this._channel === null) throw new Error('duplicate channel')

    this._request = this._channel.addMessage({
      encoding: request,
      onmessage: this._onrequest.bind(this)
    })

    this._response = this._channel.addMessage({
      encoding: response,
      onmessage: this._onresponse.bind(this)
    })

    this._channel.open(handshake)
  }

  _onopen (handshake) {
    this.emit('open', handshake)
  }

  _onclose () {
    for (const request of this._requests.values()) {
      request.reject(new Error('channel closed'))
    }

    this._requests.clear()
    this._responders.clear()

    this.emit('close')
  }

  _ondestroy () {
    this.emit('destroy')
  }

  async _onrequest ({ id, method, value }) {
    let error = null

    const responder = this._responders.get(method)

    if (responder === undefined) error = `unknown method '${method}'`
    else {
      const {
        valueEncoding,
        requestEncoding = valueEncoding,
        responseEncoding = valueEncoding
      } = responder.options

      if (requestEncoding) value = c.decode(requestEncoding, value)

      try {
        value = await responder.handler(value)
      } catch (err) {
        error = err.message
      }

      if (responseEncoding) value = c.encode(responseEncoding, value)
    }

    this._response.send({
      id,
      error,
      value
    })
  }

  _onresponse ({ id, error, value }) {
    const request = this._requests.get(id)

    if (request === undefined) return

    this._requests.delete(id)

    if (error) request.reject(new Error(error))
    else {
      const { valueEncoding, responseEncoding = valueEncoding } = request.options

      if (responseEncoding) value = c.decode(responseEncoding, value)

      request.resolve(value)
    }
  }

  get closed () {
    return this._channel.closed
  }

  respond (method, options, handler) {
    if (handler === undefined) {
      handler = options
      options = {}
    }

    this._responders.set(method, { options, handler: handler || noop })

    return this
  }

  async request (method, value, options = {}) {
    if (this.closed) throw new Error('channel closed')

    const { valueEncoding, requestEncoding = valueEncoding } = options

    if (requestEncoding) value = c.encode(requestEncoding, value)

    const id = this._id++

    this._request.send({ id, method, value })

    return new Promise((resolve, reject) => {
      this._requests.set(id, { options, resolve, reject })
    })
  }

  cork () {
    this._channel.cork()
  }

  uncork () {
    this._channel.uncork()
  }

  close () {
    this._channel.close()
  }
}

const request = {
  preencode (state, m) {
    c.uint.preencode(state, m.id)
    c.string.preencode(state, m.method)
    c.buffer.preencode(state, m.value)
  },
  encode (state, m) {
    c.uint.encode(state, m.id)
    c.string.encode(state, m.method)
    c.buffer.encode(state, m.value)
  },
  decode (state) {
    return {
      id: c.uint.decode(state),
      method: c.string.decode(state),
      value: c.buffer.decode(state)
    }
  }
}

const response = {
  preencode (state, m) {
    c.uint.preencode(state, 0) // Flags
    c.uint.preencode(state, m.id)
    if (m.error) c.string.preencode(state, m.error)
    else c.buffer.preencode(state, m.value)
  },
  encode (state, m) {
    c.uint.encode(state, m.error ? 1 : 0)
    c.uint.encode(state, m.id)
    if (m.error) c.string.encode(state, m.error)
    else c.buffer.encode(state, m.value)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      id: c.uint.decode(state),
      error: (flags & 1) !== 0 ? c.string.decode(state) : null,
      value: (flags & 1) === 0 ? c.buffer.decode(state) : null
    }
  }
}

function noop () {}
