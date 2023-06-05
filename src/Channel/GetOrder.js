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
      order_expiry: { $lte: Date.now() + 5000 },
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
      $or:[
        {
          order_expiry: { $lte: Date.now() },
          state: ORDER_STATES.CREATED,
          'onchain_payments.0': { $exists: false }
        },
        {
          order_expiry: { $lte: Date.now() - 8.64e+7 },
          state: ORDER_STATES.CREATED,
        },
      ]
    }
    Order.updateOrders(query, {
      state: ORDER_STATES.EXPIRED
    }, (err, orders) => {
      if (err) return cb(err)
      cb(null, orders)
    })
  }

  _shouldAcceptZeroConf(order){

    if (order.state !== ORDER_STATES.CREATED || order.zero_conf) return false 

    if(order.zero_conf_satvbyte_expiry && order.zero_conf_satvbyte_expiry > Date.now()) return false

    return true
  }

  async _formatOrders(nodeInfo, data, fullData){
    data.product_id = data.product_id._id
    data.purchase_invoice = data.ln_invoice.request
    if (data.state === ORDER_STATES.GIVE_UP) {
      const res = data.order_result.pop()
      data.channel_open_error = res.error
    }

    data.lnurl_decoded = {
      uri: nodeInfo.uris.pop(),
      k1: data._id,
      tag: 'channelRequest'
    }
    data.lnurl_string = lnurl.encode(`${publicUri}/v1/lnurl/channel?order_id=` + data._id)
    data.renewals = data.renewals.map((r) => {
      r.ln_invoice = r.ln_invoice.request
      return r
    })


    if(this._shouldAcceptZeroConf(data)) {
      data.zero_conf_satvbyte = false
      try {
        const zc = await this._getZeroConfQuote(data.total_amount)
        if (zc.accepted) {
          data.zero_conf_satvbyte = zc.minimum_satvbyte
          data.zero_conf_satvbyte_expiry = zc.fee_expiry
          Order.updateOrder(data._id, {
            zero_conf_satvbyte_expiry:  data.zero_conf_satvbyte_expiry,
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

    if(+fullData === 1) {
      data.opening_attempts = data.order_result
    }

    privateProps.forEach((k) => {
      delete data[k]
    })

    return data
  }

  async main (args, options, cb) {
    const orderId = args.order_id
    const fullData = args.full_data
    if(!orderId) return this.errRes("Order id not passed")
    const nodeInfo = await this.callLn('getInfo', {})
    const orders = orderId.split(",")
    if(orders.length >= 50) return this.errRes("too many orders passed. max 50 orders")
    Order.find({ _id: orders }, async (err, data) => {
      if (err || !data || data?.length === 0) {
        console.log(err, data)
        return cb(null, this.errRes('Order not found'))
      }
      const formatted = await Promise.all(data.map((d)=> this._formatOrders(nodeInfo, d, fullData) ))
      if(orders.length === 1){
        return cb(null, formatted.pop())
      }
      cb(null, formatted)
    })
  }
}

module.exports = GetOrder

const n = new GetOrder({})
