const errors = require('protomux-rpc/errors')
const router = new ProtomuxRPCRouter()

// in logger middleware
logger(console, {
  // can be overridden by the user, default as below, most of the time you should use default
  errorLogLevel: {
    BAD_REQUEST: 'info',
    FORBIDDEN: 'info',
    TOO_MANY_REQUESTS: 'warn',
    CONFLICT: 'info',
    REQUEST_ERROR: 'error',
    DECODE_ERROR: 'info',
    ENCODE_ERROR: 'info',
    UNKNOWN_METHOD: 'info',
    DUPLICATE_CHANNEL: 'warn',
    CHANNEL_CLOSED: 'warn',
    CHANNEL_DESTROYED: 'warn',
    default: 'error' // special key for unknown error code
  }
})

// in rate limit middleware
{
  onrequest: () => {
    // rate/concurrent limit hits - log as warn
    throw errors.TOO_MANY_REQUESTS('Rate limit exceeded')
  }
}

// in request-id middleware

{
  onrequest: async (req, next) => {
    req.requestId = crypto.randomUUID()

    try {
      return await next()
    } catch (err) {
      err.requestId = req.requestId

      throw err
    }
  }
}

// in handler
router.respond('transfer', async ({ amount, from }, { publicKey }) => {
  let fromAddress
  try {
    fromAddress = parseAddress(from)
  } catch (err) {
    // client error - log as info, still has detailed
    throw errors.BAD_REQUEST('Invalid address', { cause: err })
  }

  if (from !== publicKey) {
    // client error - log as info
    throw errors.FORBIDDEN('Insufficient permissions')
  }

  if (amount < 0) {
    // client error - log as info
    throw errors.BAD_REQUEST('Amount must be positive')
  }

  const currentBalance = await getBalance(fromAddress)
  if (currentBalance < amount) {
    // client error - log as info
    throw errors.CONFLICT('Insufficient balance')
  }

  if (shouldShowErrorDetail) {
    // cause will be serialized to client
    throw errors.REQUEST_ERROR('Request failed', { cause: new Error('Something went wrong') })
  } else {
    // cause will not be serialized to client, client only see REQUEST_ERROR
    throw new Error('Something went wrong')
  }
})
