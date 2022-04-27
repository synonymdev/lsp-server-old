# Blocktank Server

Main Repo for handling selling lightning channels.


### ⚠️ **Warning** ⚠️
**Run this program at your own risk.**


## Dependencies

* Mongodb
* LND
* Node.js >v12
* PM2
* [Grenache Grape](https://github.com/bitfinexcom/grenache-grape)

## How to run:

Start 2 Grapes for microservice communication:
```
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001
```
Create the settings files located in `./config`
```
cp ./config/server.json.example ./config/server.json
cp ./config/auth.json ./config/auth.json
```

Create Inventory item
```
cd ./cli
node update-inventory
```

Add the new inventory id to ` ./config/server.json` under `product_id`

Run all microservice workers (including the dependent workers)

```
pm2 run ecosystem.config.js
```

## Public API:

* [README.io](https://synonym.readme.io/reference/nodeinfo)



## Architecture

### Microservices
* Blocktank Server is a series of small scripts communicating with each other via [Grenache](https://blog.bitfinex.com/tutorial/bitfinex-loves-microservices-grenache/) - [Github](https://github.com/bitfinexcom/grenache). 

### Workers in this repo

* LN-Channel-Opener: 
  * Fetches orders that have been paid and claimed, then opens the channel.
* LN-Channel-Watch
  * Watch channels that are opened and update an order's channel.
* LN-Invoice-Watch
  * Listens for payments on from Lightning.
* Order-Expiry-Watch
  * Update orders that have been expired
* AddressWatch
  * Watch for on chain payments for orders
* ZeroConf
  * Watch for on chain zero conf payments for orders
* Start-Express
  * Express Server for routing requests to workers.
* GetOrder
  * Handle the get order api endpoint.
* NodeInfo
  * Handle the get node info api endpoint
* BuyChannel
  * Creates an order.
* FinaliseChannel
  * Claim a paid channels
* LnUrlChannel
  * Handlers for LNURL Channel. Prowxies to FinaliseChannel endpoint
* Auth.js
  * Authenticate Admin endpoints
* ChannelAdmin
  * Handle admin endpoints
* Exchange Rate
  * Handle currency conversions api endpoint.
  
### Dependent Repos:
  * Blocktank-worker-ln
    * Worker for interacting with Lightning Network Node 
  * Blocktank-worker-btc
    * Worker for interacting with Bitcoin node
  * Blocktank-worker-router
    * Handle fee managment and various other routing node features.


### HTTP API Call flow:
1. When starting application. API endpoints are set by looking at `Endpoints.js`
2. `Http.js` runs express and listens to HTTP calls
3. When an API is called, it uses config in `Endpoints.js` to find the microservice worker name and calls it.
4. If the API call is GET, query parameters are passed to the worker, if POST, body is passed. This is done in `HTTP.js`

### Worker to Worker calls
1. Looking at Controller class in `util/Worker.js` you can see some pre written helper functions for calling popular workers like The bitcoin worker or the LN worker. Most microservice workers extend from the Controller class.
2. Every worker is running a Grenache server and a client
3. Grenache server is listening to calls from other workers. 
4. Grenache client is used to call other workers.

## Admin API:
These are some admin endpoints that should only be accessed by authorised BT admins.

### Create a user
you need to call `createUser` locate in `./src/Auth/Auth.js` with a username and password. and save the output to `./config/auth.json`

### `POST: /v1/channel/manual_credit`

Credit a channel manually, if it hasn't been picked up automatically.

**Parameters:**
```
{
  "tx_id":"10a646815e29b0780c6525d39dfcf32b1fc44453a0e38ce4e05d21539831d3a3", // Bitcoin Txid
  "order_id":"6147e8ca19d94f8a1226a212" // Order id
}
```

### `GET: /v1/channel/orders`

Credit a channel manually, if it hasn't been picked up automatically.

**Parameters:**
```
{
  "state" : 100 // Get orders in a state
  "expired_channels": true // Get all channels that can be closed
  "order_id": "6147e8ca19d94f8a1226a212" // Get a single order
  "page": 1 // Pagination
}
```

### `POST: /v1/channel/close`

Begin channel closing process.

**NOTE: When calling this api, you have 30 seconds to stop the process by calling the api again.**

**Parameters:**
```
{
  "order_id":"ALL || order ir" // pass ALL to close all expired channels, pass order id to close a channel
}
```


### `POST: /v1/channel/refund`

Save refund info and change order state to REFUNDED.

**Parameters:**
```
{
  "order_id": // Order id
  "refund_tx": // Transaction id or invoice 
}
```


### Testing

1. In order to start testing you need to install the `devDependencies` and [Mocha](https://mochajs.org/)
2. Update `test.config.js.example` with your local **Regtest** Bitcoin and Lightning node.
   1. You must make sure you have enough Bitcoin liquidity before running test.
3. Run `mocha ./test/BuyChannel.e2e.test.js`

