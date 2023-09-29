# Protomux RPC

Simple RPC over [Protomux](https://github.com/mafintosh/protomux) channels.

```sh
npm install protomux-rpc
```

## Usage

On the server side:

```js
const ProtomuxRPC = require('protomux-rpc')

const rpc = new ProtomuxRPC(stream)

rpc.respond('echo', (req) => req)
```

On the client side:

```js
const ProtomuxRPC = require('protomux-rpc')

const rpc = new ProtomuxRPC(stream)

await rpc.request('echo', Buffer.from('hello world')))
// <Buffer 'hello world'>
```

## API

#### `const rpc = new ProtomuxRPC(stream[, options])`

Construct a new RPC channel from a framed stream.

Options include:

```js
{
  // Optional binary ID to identify this RPC channel
  id: buffer,
  // Optional protocol name
  protocol: 'protomux-rpc',
  // Optional default value encoding
  valueEncoding: encoding,
  // Optional handshake
  handshake: buffer,
  // Optional encoding for the handshake
  handshakeEncoding: encoding
}
```

#### `const rpc = new ProtomuxRPC(mux[, options])`

Construct a new RPC channel from an existing muxer.

Options are the same as `new ProtomuxRPC(stream)`.

#### `rpc.closed`

Whether or not the RPC channel is closed.

#### `rpc.mux`

The muxer used by the channel.

#### `rpc.stream`

The stream used by the channel.

#### `rpc.respond(method[, options], handler)`

Register a handler for an RPC method. The handler is passed the request value and must either return the response value or throw an error.

Only a single handler may be active for any given method; any previous handler is overwritten when registering a new one.

Options include:

```js
{
  // Optional encoding for both requests and responses, defaults to raw
  valueEncoding: encoding,
  requestEncoding: encoding, // Optional encoding for requests
  responseEncoding: encoding // Optional encoding for responses
}
```

#### `rpc.unrespond(method)`

Remove a handler for an RPC method.

#### `const response = await rpc.request(method, value[, options])`

Perform an RPC request, returning a promise that will resolve with the value returned by the request handler or reject with an error.

Options are the same as `rpc.respond()` with the addition of:

```js
{
  timeout: -1 // Optional request timeout in milliseconds
}
```

#### `rpc.event(method, value[, options])`

Perform an RPC request but don't wait for a response.

Options are the same as `rpc.respond()`.

#### `rpc.cork()`

Cork the underlying channel. See [`channel.cork()`](https://github.com/mafintosh/protomux#channelcork) for more information.

#### `rpc.uncork()`

Uncork the underlying channel. See [`channel.uncork()`](https://github.com/mafintosh/protomux#channeluncork) for more information.

#### `await rpc.end()`

Gracefully end the RPC channel, waiting for all inflights requests and response handlers before closing.

#### `rpc.destroy([err])`

Forcefully close the RPC channel, rejecting any inflight requests.

#### `rpc.on('open', [handshake])`

Emitted when the remote side adds the RPC protocol.

#### `rpc.on('close')`

Emitted when the RPC channel closes, i.e. when the remote side closes or rejects the RPC protocol or we closed it.

#### `rpc.on('destroy')`

Emitted when the RPC channel is destroyed, i.e. after `close` when all pending promises has resolved.

## Protocol

### Messages

All types are specified as their corresponding [compact-encoding](https://github.com/compact-encoding) codec.

#### `request` (`0`)

1.  `uint` The ID of the request
2.  `string` The method to call
3.  `raw` The request value

A request ID of `0` indicates an event call and must not be responded to.

#### `response` (`1`)

1.  `bitfield(1)` Flags
    1.  `error`
2.  `uint` The ID of the request
3.  (if `error` is set) `string` The error message
4.  (if `error` is not set) `raw` The response value

## License

Apache-2.0
