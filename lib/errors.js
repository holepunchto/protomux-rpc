module.exports = class RPCError extends Error {
  constructor (msg, code, fn = RPCError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name () {
    return 'RPCError'
  }

  static DUPLICATE_CHANNEL (msg = 'duplicate channel') {
    return new RPCError(msg, 'DUPLICATE_CHANNEL', RPCError.DUPLICATE_CHANNEL)
  }

  static CHANNEL_CLOSED (msg = 'channel closed') {
    return new RPCError(msg, 'CHANNEL_CLOSED', RPCError.CHANNEL_CLOSED)
  }

  static CHANNEL_DESTROYED (msg = 'channel destroyed') {
    return new RPCError(msg, 'CHANNEL_DESTROYED', RPCError.CHANNEL_DESTROYED)
  }

  static REQUEST_ERROR (msg, cause) {
    return new RPCError(msg,'REQUEST_ERROR', RPCError.REQUEST_ERROR, { cause })
  }

  static TIMEOUT_EXCEEDED (msg) {
    return new RPCError(msg, 'TIMEOUT_EXCEEDED', RPCError.TIMEOUT_EXCEEDED)
  }
}
