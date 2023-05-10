'use strict'
const { Worker, StatusFile } = require('blocktank-worker')
const Bignumber = require('bignumber.js')
const async = require('async')
const _ = require('lodash')
const Order = require('../Orders/Order')
const { ORDER_STATES } = require('../Orders/Order')
const { zero_conf: zcConfig } = require('../../config/server.json')

async function main () {
  class ZeroConf extends Worker {
    constructor (config) {
      config.name = 'svc:btc_zero_conf_orders'
      config.port = 8768
      super(config)
    }

    checkZeroConfAmount (args, cb) {
      const state = statusFile.data
      let res = true
      if (state.amount_processed >= zcConfig.max_total_amount) res = false
      if (state.orders_processed > zcConfig.max_orders) res = false

      const capacity = (zcConfig.max_total_amount - state.amount_processed) - args.amount
      if (capacity < 10000) res = false
      this.callWorker('svc:btc:mempool', 'getCurrrentFeeThreshold', {}, (err, data) => {
        if (err) {
          console.log(err)
          return cb(null, this.errRes('Failed to get zero conf fee threshold'))
        }
        cb(null, {
          accepted: res,
          minimum_satvbyte: data.min_fee,
          fee_expiry: data.min_fee_expiry
        })
      })
    }

    mempoolNewTransactions (data, cb) {
      cb()
      pendingOrders(data)
    }

    async onNewBlock (height, cb) {
      cb()
      console.log(`New Block : ${height}`)
      await statusFile.updateFile({
        block_height: height,
        orders_processed: 0,
        amount_processed: 0
      })
    }

    _getMempoolTx (filter) {
      return this.callWorker('svc:btc:mempool', 'getMempoolTx', filter)
    }
  }

  function getOrders (state) {
    return new Promise((resolve, reject) => {
      Order.find({
        state,
        zero_conf: { $exists: false },
        total_amount: { $lte: zcConfig.max_amount },
        order_expiry: { $lte: Date.now() + 10800000 }
      }, (err, orders) => {
        if (err) return reject(err)
        resolve(orders)
      })
    })
  }

  function checkPayment (payments) {

    // Payment must be less than maximum amount    
    const isValidPayment = payments.filter((p) => p.amount_base >= zcConfig.max_amount)
    if (isValidPayment.length !== 0) {
      return 'PAYMENT_TOO_LARGE'
    }

    // Check if maximum VALUE per block is reached
    const paymentAmount = payments[0].amount_base
    const totalValue = new Bignumber(statusFile.data.amount_processed).plus(paymentAmount)
    if (totalValue.gte(zcConfig.max_amount)) {
      zcWorker.alertSlack('info', 'Maximum amount of Bitcoin zero conf reached for current block')
      return 'MAX_VALUE_REACHED'
    }

    // Check if maximum COUNT per block is reached
    const totalCount = new Bignumber(payments.length).plus(statusFile.data.orders_processed)

    if (totalCount.gt(zcConfig.max_count)) {
      zcWorker.alertSlack('info', 'Maximum count of zero conf payments accepted for this block')
      return 'MAX_COUNT_REACHED'
    }
    return null
  }

  async function isBlacklistedPayment (payments) {
    return false
    // Todo: Fix blacklisting
    console.log('Checking blacklisted payments: ', payments.length)
    const addr = payments.map((tx) => tx.from)
    const res = await zcWorker.callWorker('svc:channel_aml', 'isAddressBlacklisted', {
      address: addr
    })
    return res
  }

  async function pendingOrders () {
    const orders = await getOrders(ORDER_STATES.CREATED)
    console.log(`Pending orders: ${orders.length}`)
    const address = orders.map((tx) => tx.btc_address).filter(Boolean)
    const mempoolTx = await zcWorker._getMempoolTx({ address })
    return async.map(orders, async (order) => {
      let totalAmount = null
      // Find transactions that belong to this order
      if(order.onchain_payments.length !== 0) return null
       
      const payments = _.filter(mempoolTx, { to: order.btc_address })
      if (payments.length === 0) return null

      const addrCheck = await isBlacklistedPayment(payments)
      if (addrCheck.blacklisted) {
        order.state = Order.ORDER_STATES.REJECTED
        const str = `Mempool detected blacklisted payment. Rejecting order:\n order: ${order._id} \n${JSON.stringify(payments)}`
        zcWorker.alertSlack('notice', str)
        console.log(str)
        await Order.updateOrder(order._id, order)
        return null
      }
      // Add payments to list
      const alreadyExists = payments.filter((p) => {
        return _.find(order.onchain_payments, { hash: p.hash })
      })
      if (alreadyExists.length > 0) return null
      order.onchain_payments = order.onchain_payments.concat(payments)
      const validZeroConf = _.filter(payments, { zero_conf: true })

      // Verify that payment is a valid Zero conf payment so we can process it.
      if (validZeroConf.length === payments.length && !checkPayment(payments)) {
        order.zero_conf = true

        totalAmount = order.onchain_payments.reduce((current, tx) => {
          return current.plus(tx.amount_base)
        }, new Bignumber(0))

        if (totalAmount.gte(order.total_amount)) {
          order.state = Order.ORDER_STATES.PAID
        }
        console.log('New zero conf payment')
        zcWorker.alertSlack('info', `Zero conf payment detected: \n order: ${order._id} \n txid: ${_.map(order.onchain_payments, 'hash').join('\n')}`)
        order.amount_received = totalAmount.toString()
      }

      await Order.updateOrder(order._id, order)
      if (totalAmount) {
        await statusFile.updateFile({
          block_height: statusFile.data.block_height,
          amount_processed: totalAmount.plus(statusFile.data.amount_processed),
          orders_processed: totalAmount.plus(statusFile.data.orders_processed)
        })
      }
      return null
    })
  }

  const statusFile = new StatusFile({
    tag: 'orders',
    postfix: 'zero_conf'
  })

  await statusFile.loadFile({
    block_height: 0,
    orders_processed: 0,
    amount_processed: 0
  })
  const zcWorker = new ZeroConf({})

  let _checkingOrders = false
  setInterval(async () => {
    if (_checkingOrders) return
    _checkingOrders = true
    try {
      await pendingOrders()
    } catch (err) {
      console.log('Failed checking for zero conf')
      console.log(err)
    }
    _checkingOrders = false
  }, 5000)

  return zcWorker
}

module.exports = main()
