const EventEmitter = require('events')
const Protomux = require('protomux')
const { encode, decode, buffer, uint, string } = require('compact-encoding')

module.exports = class ProtomuxRPC extends EventEmitter {
  constructor (stream, { id } = {}) {
    super()

    this._mux = Protomux.isProtomux(stream) ? stream : new Protomux(stream)

    this._id = 1

    this._requests = new Map()
    this._responders = new Map()

    this._channel = this._mux.createChannel({
      protocol: 'protomux-rpc',
      id,
      onclose: this._onclose.bind(this)
    })

    this._request = this._channel.addMessage({
      encoding: request,
      onmessage: this._onrequest.bind(this)
    })

    this._response = this._channel.addMessage({
      encoding: response,
      onmessage: this._onresponse.bind(this)
    })

    this._channel.open()
  }

  _onclose () {
    for (const request of this._requests.values()) {
      request.reject(new Error('channel closed'))
    }

    this._requests.clear()
    this._responders.clear()

    this.emit('close')
  }

  async _onrequest ({ id, method, value }) {
    let error = null

    const responder = this._responders.get(method)

    if (responder === undefined) error = `unknown method '${method}'`
    else {
      const { valueEncoding } = responder.opts

      if (valueEncoding) {
        value = decode(valueEncoding.request || valueEncoding, value)
      }

      try {
        value = await responder.fn(value)
      } catch (err) {
        error = err.message
      }

      if (valueEncoding) {
        value = encode(valueEncoding.response || valueEncoding, value)
      }
    }

    this._response.send({
      id,
      error,
      value
    })
  }

  _onresponse ({ id, error, value }) {
    const request = this._requests.get(id)

    if (!request) return

    this._requests.delete(id)

    if (error) request.reject(new Error(error))
    else {
      const { valueEncoding } = request.opts

      if (valueEncoding) {
        value = decode(valueEncoding.response || valueEncoding, value)
      }

      request.resolve(value)
    }
  }

  get closed () {
    return this._channel.closed
  }

  respond (method, opts, fn) {
    if (fn === undefined) {
      fn = opts
      opts = {}
    }

    this._responders.set(method, { opts, fn: fn || noop })

    return this
  }

  async request (method, value, opts = {}) {
    if (this.closed) throw new Error('channel closed')

    const { valueEncoding } = opts

    if (valueEncoding) {
      value = encode(valueEncoding.request || valueEncoding, value)
    }

    const id = this._id++

    this._request.send({ id, method, value })

    return new Promise((resolve, reject) => {
      this._requests.set(id, { opts, resolve, reject })
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
    uint.preencode(state, m.id)
    string.preencode(state, m.method)
    buffer.preencode(state, m.value)
  },
  encode (state, m) {
    uint.encode(state, m.id)
    string.encode(state, m.method)
    buffer.encode(state, m.value)
  },
  decode (state) {
    return {
      id: uint.decode(state),
      method: string.decode(state),
      value: buffer.decode(state)
    }
  }
}

const response = {
  preencode (state, m) {
    uint.preencode(state, 0) // Flags
    uint.preencode(state, m.id)
    if (m.error) string.preencode(state, m.error)
    else buffer.preencode(state, m.value)
  },
  encode (state, m) {
    uint.encode(state, m.error ? 1 : 0)
    uint.encode(state, m.id)
    if (m.error) string.encode(state, m.error)
    else buffer.encode(state, m.value)
  },
  decode (state) {
    const flags = uint.decode(state)

    return {
      id: uint.decode(state),
      error: (flags & 1) !== 0 ? string.decode(state) : null,
      value: (flags & 1) === 0 ? buffer.decode(state) : null
    }
  }
}

function noop () {}
