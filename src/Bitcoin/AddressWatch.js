
'use strict'
const Bignumber = require('bignumber.js')
const async = require('async')
const { find } = require('lodash')
const { Worker } = require('blocktank-worker')
const Order = require('../Orders/Order')
const { ORDER_STATES } = require('../Orders/Order')
const { constants } = require('../../config/server.json')

class BtcAddressWatch extends Worker {
  constructor (config) {
    config.name = 'svc:btc_address_watch'
    config.port = 8718
    super(config)
    this.processing = new Map()
  }

  async onNewBlock (height, cb) {
    cb()
    // Look for new order payments in new blocks and store in db
    await processNewBlock({}, +height)
    // Check payments are confirmed
    confirmPayments(+height)
  }

  async main (args, options, cb) {
    this.manualConfirm(args, cb)
  }

  async manualConfirm (args, cb) {
    if (this.processing.get(args.order_id)) {
      return cb(null, this.errRes('Order is being processed. Please wait'))
    }
    const done = (err, data) => {
      this.processing.delete(args.order_id)
      cb(err, data)
    }
    this.processing.set(args.order_id, Date.now())
    try {
      const tx = await api.callBlocks('parseTransaction', { id: args.tx_id })
      const order = await Order.findOne({
        _id: args.order_id,
        state: ORDER_STATES.CREATED
      })

      if (!order) {
        return done(null, this.errRes('Order not found. Order might be processed already.'))
      }

      if (!tx || tx.length === 0) {
        return done(null, this.errRes(`Transaction not found or not included in a block yet: ${args.tx_id}`))
      }
      const payments = await processOnChainTx([order], tx)
      confirmOrder({
        currentHeight: 'SKIP'
      }, payments[args.order_id], (err) => {
        if (err) {
          return done(null, this.errRes('Failed to confirm order'))
        }
        done(null, {
          order_id: args.order_id,
          success: true
        })
      })
    } catch (err) {
      console.log('Error: ', err)
      done(err)
    }
  }

  callBlocks (method, args, cb) {
    return new Promise((resolve, reject) => {
      this.gClient.send('svc:btc:blocks', {
        method,
        args
      }, (err, data) => {
        if (err) {
          return cb ? cb(err) : reject(err)
        }
        cb ? cb(null, data) : resolve(data)
      })
    })
  }
}

function getOrders (args = {}) {
  return api.callWorker('svc:get_order', 'getPendingPaymentOrders', {})
}

function updateOrder (args) {
  return api.callWorker('svc:get_order', 'updateOrder', args)
}

function confirmOrder (config, order, cb) {
  const { currentHeight } = config
  console.log('Confirming order: ', order._id)
  let totalConfirmed = new Bignumber(0)

  async.mapSeries(order.onchain_payments, async (p) => {
    await api.callBlocks('getTransaction', p.hash)
    if (currentHeight === 'SKIP' || currentHeight >= (p.height + constants.min_confirmation)) {
      totalConfirmed = totalConfirmed.plus(p.amount_base)
      p.confirmed = true
    }
    return p
  }, async (err, payments) => {
    if (err) {
      console.log(err)
      return cb(err)
    }
    order.onchain_payments = payments
    if (totalConfirmed.gte(order.total_amount)) {
      order.state = ORDER_STATES.PAID
    }
    order.amount_received = totalConfirmed.toString()
    try {
      await updateOrder({ id: order._id, update: order })
    } catch (err) {
      return cb(err)
    }
    cb(null)
  })
}

async function confirmPayments (currentHeight) {
  const orders = await getOrders()
  async.mapSeries(orders, (order, next) => {
    confirmOrder({ currentHeight }, order, next)
  })
}

async function checkForBlacklistedAddress (blockTx) {
  return async.filter(blockTx, async ([order, block]) => {
    const res = await api.callWorker('svc:channel_aml', 'isAddressBlacklisted', {
      address: block.from
    })
    if (res.blacklisted) {
      console.log('Order paid from blacklisted address.', block, res)
      api.alertSlack('notice', 'compliance', `Detected payment from blacklisted address. Not accepting payment.\nOrder:${order._id}\nTransaction:\n${JSON.stringify(block)}\n${JSON.stringify(res.address)}`)
    }
    return !res.blacklisted
  })
}

async function processOnChainTx (orders, block) {
  const addr = orders.map((tx) => tx.btc_address).filter(Boolean)
  console.log(`Orders pending payment: ${addr.length}`)
  const payments = {}
  let blockTx = block.map((b) => {
    const index = addr.indexOf(b.to)
    if (index < 0) return null
    return [orders[index], b]
  }).filter(Boolean)
  blockTx = await checkForBlacklistedAddress(blockTx)

  blockTx.forEach(([order, block]) => {
    const orderId = order._id.toString()
    let p = payments[orderId]
    if (!p) {
      p = payments[orderId] = order
    }
    if (find(p.onchain_payments, { hash: block.hash })) return
    payments[orderId].onchain_payments.push(block)
  })
  return payments
}

async function processNewBlock (config, height) {
  console.log(`Processing new height: ${height}`)
  return new Promise(async (resolve, reject) => {
    let block, orders
    try {
      orders = await getOrders({ state: ORDER_STATES.CREATED })
      const orderAddr = orders.map((o) => o.btc_address)
      block = await api.callBlocks('getHeightTransactions', { height, address: orderAddr })
    } catch (err) {
      console.log('Failed to process block height: ' + height)
      console.log(err)
      return reject(err)
    }
    const payments = await processOnChainTx(orders, block)
    const p = Object.keys(payments)
    console.log(`Payments to process : ${p.length}`)
    async.each(p, async (k, next) => {
      const order = payments[k]
      return updateOrder({ id: order._id, update: order })
    }, (err) => {
      if (err) {
        return reject(err)
      }
      resolve()
    })
  })
}

const api = new BtcAddressWatch({})
