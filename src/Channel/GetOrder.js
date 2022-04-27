'use strict'
const { Worker } = require('blocktank-worker')
const Order = require('../Orders/Order')
const { public_uri: publicUri } = require('../../config/server.json')
const { ORDER_STATES } = require('../Orders/Order')
const { get, find } = require('lodash')
const lnurl = require('../util/lnurl')

const privateProps = [
  'remote_node_src',
  'renewal_quote',
  'onchain_payment_swept',
  'order_result',
  'ln_invoice',
  'product_info',
  'onchain_payment_swept',
  'channel_closed_early',
  'renewals'
]

class GetOrder extends Worker {
  constructor (config) {
    config.name = 'svc:get_order'
    config.port = 8761
    super(config)
  }

  async _getLnStats (order) {
    const nodePub = get(order, 'remote_node.public_key')
    const chanId = get(order, 'lightning_channel_id')
    let channels
    try {
      channels = await this.callLn('listChannels', { partner_public_key: nodePub })
    } catch (err) {
      console.log(err)
      return null
    }
    const ch = find(channels, { id: chanId })
    if (!ch) return null
    return {
      remote_balance: ch.remote_balance,
      local_balance: ch.local_balance
    }
  }

  async updateOrder (args, cb) {
    console.log('Updating order: ', args.id)
    Order.updateOrder(args.id, args.update, cb)
  }

  getPendingPaymentOrders (args, cb) {
    const query = {
      order_expiry: { $lte: Date.now() + 10800000 },
      state: ORDER_STATES.CREATED,
      ...args
    }
    Order.getOrdersInState(query, (err, orders) => {
      if (err) return cb(err)
      cb(null, orders)
    })
  }

  markOrdersExpired (args, cb) {
    const query = {
      order_expiry: { $lte: Date.now() },
      state: ORDER_STATES.CREATED,
      'onchain_payments.0': { $exists: true }
    }
    Order.updateOrders(query, {
      state: ORDER_STATES.EXPIRED
    }, (err, orders) => {
      if (err) return cb(err)
      cb(null, orders)
    })
  }

  async main (args, options, cb) {
    const orderId = args.order_id
    const nodeInfo = await this.callLn('getInfo', {})
    Order.findOne({ _id: orderId }, async (err, data) => {
      if (err || !data) {
        console.log(err, data)
        return cb(null, this.errRes('Order not found'))
      }
      data.product_id = data.product_id._id
      data.purchase_invoice = data.ln_invoice.request
      if (data.state === ORDER_STATES.GIVE_UP) {
        const res = data.order_result.pop()
        data.channel_open_error = res.error
      }

      data.lnurl_decoded = {
        uri: nodeInfo.uris.pop(),
        k1: args.order_id,
        tag: 'channelRequest'
      }
      data.lnurl_string = lnurl.encode(`${publicUri}/v1/lnurl/channel?order_id=` + orderId)
      data.renewals = data.renewals.map((r) => {
        r.ln_invoice = r.ln_invoice.request
        return r
      })
      if (data.state === ORDER_STATES.CREATED && !data.zero_conf) {
        data.zero_conf_satvbyte = false
        try {
          const zc = await this._getZeroConfQuote(data.total_amount)
          if (zc.accepted) {
            data.zero_conf_satvbyte = zc.minimum_satvbyte
            data.zero_conf_satvbyte_expiry = zc.fee_expiry
            Order.updateOrder(data._id, {
              zero_conf_satvbyte_expiry: data.zero_conf_satvbyte_expiry,
              zero_conf_satvbyte: data.zero_conf_satvbyte
            })
          }
        } catch (err) {
          console.log('Failed to get zero conf', err)
        }
      }

      try {
        data.current_channel_info = await this._getLnStats(data)
      } catch (err) {
        data.channel_info = null
        console.log(err)
      }

      privateProps.forEach((k) => {
        delete data[k]
      })

      cb(null, data)
    })
  }
}

module.exports = GetOrder

const n = new GetOrder({})
