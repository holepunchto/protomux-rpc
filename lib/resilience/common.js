/**
 * Generic execute function type where the template is on the function.
 *
 * @template T
 * @callback ExecuteFn
 * @param {() => Promise<T>} fn
 * @param {any} [options]
 * @returns {Promise<T>}
 */

/**
 * Minimal executor interface.
 *
 * @typedef {object} Executor
 * @property {ExecuteFn} execute
 * @property {() => void} [destroy]
 */

/**
 * Compose executors left-to-right. Calls `execute` and `destroy` in order.
 *
 * @param {...Executor} executors
 * @returns {Executor}
 */
exports.compose = (...executors) => {
  return executors.reduce((acc, executor) => {
    return {
      execute: (fn, options) => executor.execute(() => acc.execute(fn, options), options),
      destroy: () => {
        if (acc.destroy) {
          acc.destroy()
        }
        if (executor.destroy) {
          executor.destroy()
        }
      }
    }
  }, { execute: (fn) => fn() })
}
