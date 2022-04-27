'use strict'
const { Worker } = require('blocktank-worker')
const Order = require('../Orders/Order')
const { intersectionWith, get } = require('lodash')
const { promisify } = require('util')
const async = require('async')
const { ORDER_STATES } = require('../Orders/Order')

class ChannelAdmin extends Worker {
  constructor (config) {
    super({
      name: 'svc:channel_admin',
      port: 5819
    })
    this._getOrders = promisify(this.main)
    this._timers = new Map()
  }

  _closeOrders (orders, cb) {
    this.alertSlack('info', 'admin', `Closing ${orders.length} channels`)
    console.log(`Closing ${orders.length} channels`)

    async.map(orders, async (order) => {
      let closeTx
      try {
        closeTx = await this.callLn('closeChannel', { id: order.lightning_channel_id })
      } catch (err) {
        console.log(err)
        return { order, error: true }
      }
      closeTx.tx = Date.now()
      order.channel_close_tx = closeTx
      await Order.updateOrder(order._id, { channel_close_tx: closeTx, state: ORDER_STATES.CLOSING })
      return { order, error: false }
    }, (err, data) => {
      this._stopTimer('chan_close')
      if (err) {
        console.log(err)
        return cb(err)
      }
      const res = data.map(({ order, error }) => {
        const res = { order_id: order._id }
        if (!error) {
          res.channel_close_tx = order.channel_close_tx
          return res
        }
        res.error = true
        return res
      })
      cb(null, res)
    })
  }

  _stopTimer (n) {
    const timer = this._timers.get(n)
    if (!timer) throw new Error('Timer not found: ' + n)
    clearTimeout(timer)
    this._timers.delete(n)
  }

  async login (args, options, cb) {
    let login
    try {
      login = await this.callWorker('svc:simple_auth', 'login', args)
    } catch (err) {
      console.log('Failed to login ', args.username)
      return (null, this.errRes('Unauthorised'))
    }
    if (login.error) {
      return cb(null, this.errRes(login.error))
    }
    cb(null, { key: login.key })
  }

  async closeChannelsSync (args, options, cb) {
    const timerName = 'chan_close'
    if (this.channel_closer_timer) { // Channel closure can be stopped
      this._stopTimer(timerName)
      return cb(null, this.errRes('Stopped channel closing processs'))
    }
    const closeQuery = args.order_id === 'ALL' ? null : args.order_id

    this.alertSlack('notice', 'admin', `Closing channel. order: ${closeQuery}`)

    let liveChans
    try {
      liveChans = await this.callLn('listChannels', null)
    } catch (err) {
      console.log(err)
      return cb(null, this.errRes('Failed to get active channels'))
    }

    let expiredChans
    try {
      expiredChans = await this.getOrders({ expired_channels: true, order_id: closeQuery })
      expiredChans = intersectionWith(expiredChans, liveChans, (order, chan) => {
        return chan.transaction_id === get(order, 'channel_open_tx.transaction_id')
      })
    } catch (err) {
      console.log(err)
      return cb(null, this.errRes('Failed to get expired channels'))
    }

    if (expiredChans.length === 0) {
      return cb(null, this.errRes('No channels to close'))
    }

    this.alertSlack('info', 'admin', 'Will start to close channels in 30 seconds.')
    const timer = setTimeout(() => {
      this._closeOrders(expiredChans, cb)
    }, 30000)

    this._timers.set(timerName, timer)
  }

  async sweepOnchainFunds (args, options, cb) {
    // TODO: Sweep onchain funds
  }

  main (args, options, cb) {
    this.getOrders(args, cb)
  }

  getOrdersQuery (query, cb) {
    Order.find(query, (err, data) => {
      if (err) {
        console.log(err)
        return cb(null, this.errRes('Failed to query db'))
      }
      cb(null, data)
    })
  }

  getOrders (args, cb) {
    const query = {
      _sort: { created_at: -1 },
      _limit: 100,
      _skip: +args.page || 0
    }

    if (args.state) {
      query.state = args.state
    }

    if (args.expired_channels) {
      query.channel_expiry_ts = { $lte: Date.now() }
      query.state = Order.ORDER_STATES.OPEN
    }

    if (args.opening_channels && args.opened_channels) {
      query.state = { $in: [ORDER_STATES.OPENING, ORDER_STATES.OPEN] }
    }

    if (args.remote_node) {
      query['remote_node.public_key'] = args.remote_node
    }

    if (args.order_id) {
      query._id = args.order_id
    }

    Order.find(query, (err, data) => {
      if (err) {
        console.log(err)
        return cb(null, this.errRes('Failed to query db'))
      }
      cb(null, data)
    })
  }

  refund (args, options, cb) {
    if (!args.order_id || !args.refund_tx) {
      return cb(null, this.errRes('Invalid args passed'))
    }
    async.waterfall([
      (next) => {
        Order.findOne({ _id: args.order_id }, next)
      },
      (order, next) => {
        if (!order) return next(new Error('Order not found'))
        Order.updateOrder(args.order_id, {
          state: ORDER_STATES.REFUNDED,
          refund_tx: args.refund_tx,
          refunded_at: Date.now()
        }, next)
      }], (err, data) => {
      if (err) {
        console.log(err)
        return cb(null, this.errRes('Refund failed'))
      }
      this.alertSlack('notice', 'admin', `Order: ${args.order_id} Refunded`)
      return cb(null, { success: true })
    })
  }

  pendingChannelOpens (args, options, cb) {
    Order.find({
      state: Order.ORDER_STATES.URI_SET,
      created_at: { $gte: Date.now() - 172800000 }
    }, (err, data) => {
      if (err) {
        console.log(err)
        return cb(null, this.errRes('Failed to get channel openings'))
      }
      cb(null, data)
    })
  }
}

module.exports = ChannelAdmin
const n = new ChannelAdmin({})
