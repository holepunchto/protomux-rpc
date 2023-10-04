const EventEmitter = require('events')
const Protomux = require('protomux')
const c = require('compact-encoding')
const bitfield = require('compact-encoding-bitfield')
const bits = require('bits-to-bytes')
const safetyCatch = require('safety-catch')
const errors = require('./lib/errors')

module.exports = class ProtomuxRPC extends EventEmitter {
  constructor (stream, options = {}) {
    super()

    const {
      id,
      protocol = 'protomux-rpc',
      valueEncoding = c.buffer,
      handshake,
      handshakeEncoding
    } = options

    this._mux = Protomux.from(stream)
    this._defaultValueEncoding = valueEncoding

    this._id = 1
    this._ending = null
    this._destroyed = false
    this._error = null
    this._responding = 0

    this._requests = new Map()
    this._responders = new Map()

    this._channel = this._mux.createChannel({
      protocol,
      id,
      handshake: handshake ? handshakeEncoding || c.raw : null,
      onopen: this._onopen.bind(this),
      onclose: this._onclose.bind(this),
      ondestroy: this._ondestroy.bind(this)
    })

    if (this._channel === null) throw errors.DUPLICATE_CHANNEL()

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
    this._ending = Promise.resolve()

    const err = this._error || errors.CHANNEL_CLOSED()

    for (const request of this._requests.values()) {
      request.reject(err)
    }

    this._requests.clear()
    this._responders.clear()

    this.emit('close')
  }

  _ondestroy () {
    this._destroyed = true
    this.emit('destroy')
  }

  async _onrequest ({ id, method, value }) {
    let error = null

    const responder = this._responders.get(method)

    if (responder === undefined) error = `unknown method '${method}'`
    else {
      const {
        valueEncoding = this._defaultValueEncoding,
        requestEncoding = valueEncoding,
        responseEncoding = valueEncoding
      } = responder.options

      if (requestEncoding) value = c.decode(requestEncoding, value)

      this._responding++

      try {
        value = await responder.handler(value)
      } catch (err) {
        safetyCatch(err)
        error = err.message
      }

      this._responding--

      if (!error && responseEncoding && id) {
        value = c.encode(responseEncoding, value)
      }
    }

    if (id) this._response.send({ id, error, value })

    this._endMaybe()
  }

  _onresponse ({ id, error, value }) {
    if (id === 0) return

    const request = this._requests.get(id)

    if (request === undefined) return

    this._requests.delete(id)

    if (request.timeout) clearTimeout(request.timeout)

    if (error) request.reject(errors.REQUEST_ERROR(error))
    else {
      const {
        valueEncoding = this._defaultValueEncoding,
        responseEncoding = valueEncoding
      } = request.options

      if (responseEncoding) value = c.decode(responseEncoding, value)

      request.resolve(value)
    }

    this._endMaybe()
  }

  _ontimeout (id, timeout) {
    const request = this._requests.get(id)

    if (request === undefined) return

    this._requests.delete(id)

    request.reject(errors.TIMEOUT_EXCEEDED(`timeout of ${timeout}ms exceeded`))

    this._endMaybe()
  }

  get closed () {
    return this._channel.closed
  }

  get mux () {
    return this._mux
  }

  get stream () {
    return this._mux.stream
  }

  respond (method, options, handler) {
    if (typeof options === 'function') {
      handler = options
      options = {}
    }

    this._responders.set(method, { options, handler })

    return this
  }

  unrespond (method) {
    this._responders.delete(method)

    return this
  }

  async request (method, value, options = {}) {
    if (this.closed) throw errors.CHANNEL_CLOSED()

    const {
      valueEncoding = this._defaultValueEncoding,
      requestEncoding = valueEncoding,
      timeout = -1
    } = options

    if (requestEncoding) value = c.encode(requestEncoding, value)

    const id = this._id++

    this._request.send({ id, method, value })

    return new Promise((resolve, reject) => this._requests.set(id, {
      options,
      resolve,
      reject,
      timeout: timeout > 0 && setTimeout(this._ontimeout.bind(this, id, timeout), timeout)
    }))
  }

  event (method, value, options = {}) {
    if (this.closed) throw errors.CHANNEL_CLOSED()

    const {
      valueEncoding = this._defaultValueEncoding,
      requestEncoding = valueEncoding
    } = options

    if (requestEncoding) value = c.encode(requestEncoding, value)

    this._request.send({ id: 0, method, value })
  }

  cork () {
    this._channel.cork()
  }

  uncork () {
    this._channel.uncork()
  }

  async end () {
    if (this._ending) return this._ending

    this._ending = EventEmitter.once(this, 'close')
    this._endMaybe()

    return this._ending
  }

  _endMaybe () {
    if (this._ending && this._responding === 0 && this._requests.size === 0) {
      this._channel.close()
    }
  }

  destroy (err) {
    if (this._destroyed) return
    this._destroyed = true

    this._error = err || errors.CHANNEL_DESTROYED()
    this._channel.close()
  }
}

const request = {
  preencode (state, m) {
    c.uint.preencode(state, m.id)
    c.string.preencode(state, m.method)
    c.raw.preencode(state, m.value)
  },
  encode (state, m) {
    c.uint.encode(state, m.id)
    c.string.encode(state, m.method)
    c.raw.encode(state, m.value)
  },
  decode (state) {
    return {
      id: c.uint.decode(state),
      method: c.string.decode(state),
      value: c.raw.decode(state)
    }
  }
}

const flags = bitfield(1)

const response = {
  preencode (state, m) {
    flags.preencode(state)
    c.uint.preencode(state, m.id)
    if (m.error) c.string.preencode(state, m.error)
    else c.raw.preencode(state, m.value)
  },
  encode (state, m) {
    flags.encode(state, bits.of(m.error))
    c.uint.encode(state, m.id)
    if (m.error) c.string.encode(state, m.error)
    else c.raw.encode(state, m.value)
  },
  decode (state) {
    const [error] = bits.iterator(flags.decode(state))

    return {
      id: c.uint.decode(state),
      error: error ? c.string.decode(state) : null,
      value: !error ? c.raw.decode(state) : null
    }
  }
}
