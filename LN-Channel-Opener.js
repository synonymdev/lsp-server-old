'use strict'
const Db = require('./src/DB/DB')
const Order = require('./src/Orders/Order')
const config = require('./config/server.json')
const async = require('async')
const { Client: GrenacheClient } = require('blocktank-worker')
const { lnWorker } = require('./src/util/common-workers')
const { find } = require('lodash')

console.log('Starting Channel Opener...')

const MAX_CHANNEL_OPEN_ATTEMPT = config.constants.max_attempt_channel_open

Db((err) => {
  if (err) throw err
  console.log('Started database')
})

async function getPaidOrders () {
  const db = await Db()
  return db.LnChannelOrders.find({
    state: Order.ORDER_STATES.URI_SET,
    created_at: { $gte: Date.now() - 172800000 }
  }).limit(100).toArray()
}

async function getProducts (productIds) {
  const db = await Db()
  return db.Inventory.find({ _id: { $in: productIds } }).toArray()
}

async function updateOrders (orders) {
  return Promise.all(orders.map(async ({ order, result }) => {
    result.ts = Date.now()
    let state

    if (order.order_result.length === MAX_CHANNEL_OPEN_ATTEMPT || result.giveup) {
      // GIVE UP OPENING CHANNEL
      // Tried too many times or node has issues
      state = Order.ORDER_STATES.GIVE_UP
      order.order_result.push(result)
      alert('notice', `Gave up opening channel: ${order._id} \n ${JSON.stringify(result.error, null, 2)}`)
    } else if (result.channel_tx && result.channel_tx.transaction_id) {
      // CHANNEL IS OPENING
      state = Order.ORDER_STATES.OPENING
      order.channel_open_tx = result.channel_tx
      alert('info', `Opening Channel: ${order._id} - txid: ${JSON.stringify(result.channel_tx, null, 2)}`)
    } else {
      if (order.order_result.length === 0 || order.order_result[order.order_result.length - 1].channel_error !== result.channel_error) {
        order.order_result.push(result)
      } else {
        order.order_result[order.order_result.length - 1] = result
      }
      state = order.state
    }

    if (result.error) {
      console.log('Failing to open channel: ', order._id)
    }
    await Order.updateOrder(order._id, {
      state,
      order_result: order.order_result,
      channel_open_tx: order.channel_open_tx
    })
  }))
}

function parseChannelOpenErr (err) {
  if (err.message.includes('PeerIsNotOnline')) return ['PEER_NOT_REACHABLE', false]
  if (err.message.includes('PeerPendingChannelsExceedMaximumAllowable')) return ['PEER_TOO_MANY_PENDING_CHANNELS', false]
  if (err.message.includes('FailedToOpenChannel')) {
    const errMsg = err.message
    if (errMsg.includes('exceeds maximum chan size')) {
      return ['CHAN_SIZE_TOO_BIG', true]
    }
    if (errMsg.includes('below min chan size')) {
      return ['CHAN_SIZE_TOO_SMALL', true]
    }
  }
  if (err.message.includes('InsufficientFundsToCreateChannel')) {
    return ['WALLET_EMPTY', true]
  }

  if (err.message.includes('WalletNotFullySynced')) {
    return ['NODE_NOT_SYNCED', false]
  }
  return ['SERVICE_FAILED_TO_OPEN_CHANNEL', false]
}

function parseChannelOptions (product, order) {
  if (product.product_type === 'LN_CHANNEL') {
    let localBal = order.local_balance
    if (order.remote_balance > order.local_balance) {
      localBal = order.remote_balance
    }
    return {
      remote_amt: order.remote_balance,
      local_amt: localBal
    }
  }
  return false
}

function addPeer ({ order, product }, cb) {
  lnWorker('addPeer', {
    socket: order.remote_node.addr,
    public_key: order.remote_node.public_key
  }, (err, data) => {
    if (err) {
      console.log('Adding peer failed. Could already be connected')
      console.log(err)
    }
    cb(null, data)
  })
}

function channelOpener () {
  let count = 0
  setInterval(() => {
    count = 0
  }, 60000)
  const max = 10

  function openChannel ({ order, product }, cb) {
    if (count >= max) {
      alert('info', 'Channel opening is being throttled.')
      return cb(new Error('Throttled channel opening'))
    }
    count++
    console.log(`Opening LN Channel to: ${order.remote_node.public_key}`)
    const res = { order }
    const op = parseChannelOptions(product, order)
    if (!op) return cb(new Error('invalid order options'))
    lnWorker('openChannel', {
      ...op,
      remote_pub_key: order.remote_node.public_key,
      is_private: order.private_channel
    }, (err, data) => {
      if (err) {
        const [errStr, giveup] = parseChannelOpenErr(err)
        res.result = {
          error: errStr, channel_error: err.message || err, giveup
        }
        console.log('Failed to open channel', order._id)
        console.log(err)
        return cb(null, res)
      }
      if (!data.transaction_id) {
        console.log('Failed to open channel, no txid:', order._id)
        res.result = {
          error: 'FAILED_OPENING',
          giveup: true,
          channel_error: JSON.stringify(err)
        }
        return cb(null, res)
      }
      res.result = { channel_tx: data }
      cb(null, res)
    })
  }

  return openChannel
}

function alert (level, msg) {
  gClient.send('svc:monitor:slack', [level, 'ln_channel', msg], () => {})
}

const gClient = new GrenacheClient()
async function main (cb) {
  const orders = await getPaidOrders()
  if (orders.length === 0) {
    console.log(`No orders to process. ${Date.now()}`)
    return cb()
  }
  const openChannel = channelOpener()

  const products = await getProducts(orders.map(({ product_id }) => product_id))

  console.log(`Processing ${orders.length} for ${products.length} Products`)

  async.mapSeries(orders, (order, next) => {
    const product = find(products, ({ _id }) => order.product_id.equals(_id))
    if (!product) return next(new Error('Failed to find product'))
    addPeer({ product, order }, () => {
      openChannel({ product, order }, next)
    })
  }, async (err, data) => {
    if (err) {
      console.log('Error processing orders', err)
      return cb(err)
    }
    try {
      await updateOrders(data)
    } catch (err) {
      console.log('Failed to update orders', err)
    }
    cb()
  })
}

let running = false
setInterval(() => {
  if (running) {
    console.log('Channel opener is already running.')
    return
  }
  running = true
  try {
    main(() => {
      running = false
    })
  } catch (err) {
    console.log('Channel opener failed')
    console.log(err)
    running = false
  }
}, 5000)
