module.exports = class PassthroughExecutor {
  static INSTANCE = new PassthroughExecutor()

  execute (fn) {
    return fn()
  }

  destroy () {
    // noop
  }
}
