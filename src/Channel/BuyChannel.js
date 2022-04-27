'use strict'
const lnurl = require('../util/lnurl')
const BN = require('bignumber.js')
const { Worker } = require('blocktank-worker')
const { getBtcUsd } = require('../util/exchange-api')
const { toBtc } = require('../util/sats-convert')
const { waterfall } = require('async')
const { pick, omit } = require('lodash')
const { getChannelPrice } = require('../util/pricing')
const Order = require('../Orders/Order')
const config = require('../../config/server.json')
const { constants } = config
const { public_uri: publicUri } = config

class BuyChannel extends Worker {
  constructor (config) {
    config.name = 'svc:buy_channel'
    config.port = config.port || 7672
    super(config)
  }

  _getOrderExpiry () {
    return Date.now() + constants.order_expiry
  }

  async checkCapacityLimit (totalCapacity) {
    const btcusd = await getBtcUsd()
    const usd = new BN(btcusd.price).times(toBtc(totalCapacity))
    if (usd.gte(constants.max_channel_dollar)) {
      return {
        accept: false,
        usd_size: usd.decimalPlaces(2)
      }
    }
    return { accept: true }
  }

  _getLnInvoice (id, amount) {
    return new Promise((resolve, reject) => {
      this.callLn('createHodlInvoice', {
        memo: `BlockTank ${id}`,
        amount,
        expiry: constants.order_expiry
      }, (err, invoice) => {
        if (err) {
          console.log(err)
          return reject(new Error('Failed to create invoice'))
        }
        resolve(invoice)
      })
    })
  }

  _calExpiry (expiry) {
    return BN(Date.now()).plus(BN(expiry).times(6.048e+8)).toNumber()
  }

  _validateOrder ({ channel_expiry: expiry, local_balance: localBalance, remote_balance: remoteBalance }) {
    if (!Number.isInteger(expiry) || expiry > constants.max_chan_expiry || expiry < constants.min_chan_expiry) {
      return 'Invalid channel expiry'
    }

    if (!Number.isInteger(remoteBalance) || !Number.isInteger(localBalance)) {
      return 'Invalid channel balance requested'
    }

    const totalSize = (remoteBalance + localBalance)
    // Hard limit on any channel size
    if (totalSize > constants.max_channel_size) {
      return 'Requested channel capacity is too large'
    }

    // Local balance must always be bigger than remote balance
    if (remoteBalance > localBalance) {
      return 'Local balance must be bigger than remote balance'
    }

    return false
  }

  async main (args, options, cb) {
    const order = pick(args, [
      'product_id', 'local_balance', 'remote_balance', 'channel_expiry'
    ])

    const orderErr = this._validateOrder(order)
    if (orderErr) {
      return cb(null, this.errRes(orderErr))
    }

    if (!order.product_id) {
      return cb(null, this.errRes('Invalid params'))
    }

    const db = this.db
    let product
    try {
      product = await db.Inventory.findOne({
        _id: new db.ObjectId(order.product_id)
      })
    } catch (err) {
      console.log(err)
      return cb(null, this.errRes('Failed to find product'))
    }

    if (!product) {
      return cb(null, this.errRes('Not in stock'))
    }

    const capLimit = await this.checkCapacityLimit(order.remote_balance + order.local_balance)
    if (!capLimit.accept) {
      return cb(null, this.errRes(`Requested channel capacity is too large. Max channel size: $${constants.max_channel_dollar}. Requested channel: $${capLimit.usd_size} `))
    }

    const totalCapacity = new BN(order.local_balance).plus(order.remote_balance).toString()

    // Fee: How much the service is charging for channel opening
    // totalAmount: Total amount including local balance and remote balance charges
    let price, totalAmount
    try {
      const p = await getChannelPrice({
        channel_expiry: order.channel_expiry,
        local_balance: order.local_balance,
        remote_balance: order.remote_balance
      })
      price = p.price
      totalAmount = p.totalAmount
    } catch (err) {
      console.log(err)
      return cb(null, this.errRes())
    }

    waterfall([
      (next) => {
        this.callLn('getOnChainBalance', null, (err, balance) => {
          if (err) return next(err)
          const minBal = constants.min_wallet_balance_buffer + balance
          if (minBal <= totalCapacity) {
            this.alertSlack('warning', 'Low onchain bitcoin balance.')
            return next(true, this.errRes('Service is not available at this time.'))
          }
          next(null, null)
        })
      },
      async (res, next) => {
        const invoice = await this._getLnInvoice(order.product_id, totalAmount)
        order.renewals = []
        order.onchain_payments = []
        order.onchain_payment_swept = false
        order.channel_expiry_ts = this._calExpiry(order.channel_expiry)
        order.order_expiry = Date.now() + constants.order_expiry
        order.ln_invoice = invoice
        order.total_amount = +totalAmount
        order.price = +price
        order.product_info = omit(product, ['_id', 'stats'])
        return order
      },
      (order, next) => {
        this.callBtc('getNewAddress', { tag: 'channel_order' }, (err, data) => {
          if (err) return next(err)
          if (!data.address) {
            this.alertSlack('warning', 'Was not able to generate bitcoin address for order')
          }
          order.btc_address = data.address
          next(null, order)
        })
      },
      (order, next) => {
        Order.newLnChannelOrder(order, (err, data) => {
          if (err || !data.insertedId) {
            console.log('Failed to create ID')
            return next(err || new Error('Failed to save to db'))
          }
          next(null, {
            order_id: data.insertedId,
            ln_invoice: order.ln_invoice.request,
            price: order.price,
            total_amount: order.total_amount,
            btc_address: order.btc_address,
            lnurl_channel: lnurl.encode(publicUri + '/v1/lnurl/channel?order_id=' + data.insertedId),
            order_expiry: order.order_expiry
          })
        })
      }
    ], (err, data) => {
      if (err) {
        console.log(err, data)
        this.alertSlack('warning', 'Failed to create buy order')
        return cb(null, this.errRes())
      }

      cb(null, data)
    })
  }
}

module.exports = BuyChannel
const n = new BuyChannel({})
