'use strict'
const { promisify } = require('util')
const _ = require('lodash')
const async = require('async')
const Db = require('./src/DB/DB')
const Order = require('./src/Orders/Order')
const { lnWorker } = require('./src/util/common-workers')
const { ORDER_STATES } = require('./src/Orders/Order')
const { Client: GrenacheClient } = require('blocktank-worker')
const gClient = new GrenacheClient({})

function alertSlack (lvl, msg) {
  gClient.send('svc:monitor:slack', [lvl, 'channel_watch', msg], (err) => {
    if (err) {
      return console.log(err)
    }
  })
}
console.log('Starting Channel Watcher...')

Db((err) => {
  if (err) throw err
  console.log('Started database')
})

async function getOrders () {
  const db = await Db()
  return db.LnChannelOrders.find({
    state: { $in: [ORDER_STATES.OPENING, ORDER_STATES.OPEN, ORDER_STATES.CLOSING] }
  }).limit(100).toArray()
}

const getOpenedChannels = promisify((cb) => {
  lnWorker('listChannels', null, cb)
})

const getClosedChannels = promisify((cb) => {
  lnWorker('listClosedChannels', null, cb)
})

const processOrder = (order, openedChans, closedChans, cb) => {
  const openChannelTxId = _.get(order, 'channel_open_tx.transaction_id')

  if (!openChannelTxId) return cb(null, order)

  const openedChannel = _.find(openedChans, { transaction_id: openChannelTxId })
  if (openedChannel && !_.get(openedChannel, 'is_opening') && !_.get(openedChannel, 'is_closing') && order.state !== ORDER_STATES.OPEN) {
    console.log(`Order: ${order._id} : Channel Opened: ${openedChannel.id}`)
    alertSlack('info', `channel for order ${order._id} is now open`)
    order.lightning_channel_id = openedChannel.id
    order.state = Order.ORDER_STATES.OPEN
    return cb(null, order)
  }

  const closedChannel = _.find(closedChans, { transaction_id: openChannelTxId })
  if (closedChannel) {
    alertSlack('notice', `Order: ${order._id} channel closed.`)
    order.state = Order.ORDER_STATES.CLOSED
    order.channel_close_tx = {
      transaction_id: closedChannel.close_transaction_id,
      ts: Date.now()
    }

    if (order.channel_expiry_ts > Date.now()) {
      order.channel_closed_early = true
      alertSlack('notice', `Order: ${order._id} channel closed before expiry.`)
    }
    console.log(`Order: ${order._id} : Channel Closed: ${closedChannel.close_transaction_id}`)
    return cb(null, order)
  }

  cb(null, order)
}

async function updateOrders (orders) {
  const db = await Db()
  return Promise.all(orders.map((order) => {
    return db.LnChannelOrders.updateOne(
      { _id: order._id },
      { $set: { ...order } })
  }))
}

async function main () {
  const channels = await getOpenedChannels()
  const closedChannels = await getClosedChannels()
  const orders = await getOrders()
  if (orders.length === 0) {
    console.log(`No orders to process. ${Date.now()}`)
    return
  }

  async.mapSeries(orders, (order, next) => {
    processOrder(order, channels, closedChannels, next)
  }, (err, data) => {
    if (err) {
      console.log('Failed process')
      return console.log(err)
    }
    updateOrders(data)
  })
}

setInterval(() => {
  try {
    main()
  } catch (err) {
    console.log('Channel watcher failed')
    console.log(err)
  }
}, 5000)

main()
