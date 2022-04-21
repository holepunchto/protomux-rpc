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

### `const rpc = new ProtomuxRPC(stream[, options])`

Construct a new RPC channel from a framed stream.

Options include:

```js
{
  // Optional binary ID to identify this RPC channel
  id: buffer,
  // Optional encoding for a handshake
  handshake: encoding
}
```

### `const rpc = new ProtomuxRPC(muxer[, options])`

Construct a new RPC channel from an existing muxer.

Options are the same as above.

### `rpc.open([handshake])`

Open the RPC channel.

### `rpc.respond(method[, options][, handler])`

Register a handler for an RPC method. The handler is passed the request value and must either return the response value or throw an error.

Only a single handler may be active for any given method; any previous handler is overwritten when registering a new one.

Options include:

```js
{
  // Optional encoding for both requests and responses, defaults to binary
  valueEncoding: 'binary' | 'json' | 'utf-8' | encoding
  // Optional encoding for requests
  requestEncoding: 'binary' | 'json' | 'utf-8' | encoding
  // Optional encoding for responses
  reponseEncoding: 'binary' | 'json' | 'utf-8' | encoding
}
```

### `const response = await rpc.request(method[, value[, options]])`

Perform an RPC request, returning a promise that will resolve with the value returned by the request handler or reject with an error.

Options are the same as above.

### `rpc.cork()`

Cork the underlying channel. See [`channel.cork()`](https://github.com/mafintosh/protomux#channelcork) for more information.

### `rpc.uncork()`

Uncork the underlying channel. See [`channel.uncork()`](https://github.com/mafintosh/protomux#channeluncork) for more information.

### `rpc.close()`

Close the RPC channel.

## License

ISC
