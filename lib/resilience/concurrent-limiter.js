const Signal = require('signal-promise')

class ConcurrentLimiterError extends Error {
  static NEVER_PROMISE = new Promise(() => {})

  constructor (msg, code, fn = ConcurrentLimiterError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name () {
    return 'ConcurrentLimiterError'
  }

  static CONCURRENT_LIMITER_DESTROYED () {
    return new ConcurrentLimiterError(
      'The concurrent limiter is destroyed',
      'CONCURRENT_LIMITER_DESTROYED',
      ConcurrentLimiterError.CONCURRENT_LIMITER_DESTROYED
    )
  }
}

module.exports = class ConcurrentLimiter {
  /**
   * @param {object} options
   * @param {number} options.maxConcurrent - Maximum concurrent executions.
   */
  constructor ({ maxConcurrent } = {}) {
    this._maxConcurrent = maxConcurrent
    this._active = 0
    this._releaseSignal = new Signal()
    this._destroyed = false
  }

  _tryAcquire () {
    if (this._active < this._maxConcurrent) {
      this._active++
      return true
    }

    return false
  }

  _release () {
    this._active--
    this._releaseSignal.notify()
  }

  /**
   * Execute an async function with concurrent limit.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @param {object} [options] - Options for the execution.
   * @param {Promise<void>} [options.abortSignalPromise] - Promise that rejects when the execution should be aborted.
   * @returns {Promise<T>}
   */
  async execute (fn, { abortSignalPromise = ConcurrentLimiterError.NEVER_PROMISE } = {}) {
    while (!this._tryAcquire()) {
      if (this._destroyed) {
        throw ConcurrentLimiterError.CONCURRENT_LIMITER_DESTROYED()
      }

      await Promise.race([this._releaseSignal.wait(), abortSignalPromise])
    }

    if (this._destroyed) {
      throw ConcurrentLimiterError.CONCURRENT_LIMITER_DESTROYED()
    }

    try {
      return await fn()
    } finally {
      this._release()
    }
  }

  destroy () {
    if (this._destroyed) {
      throw ConcurrentLimiterError.CONCURRENT_LIMITER_DESTROYED()
    }

    this._destroyed = true
    // notify any waiting acquire calls so the calling function can fail gracefully
    this._releaseSignal.notify()
  }
}
