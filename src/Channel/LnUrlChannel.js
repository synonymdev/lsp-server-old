'use strict'
const { Worker } = require('blocktank-worker')
const Order = require('../Orders/Order')
const async = require('async')
const { ORDER_STATES } = require('../Orders/Order')
const { public_uri: publicUri } = require('../../config/server.json')

class LNUrlChannel extends Worker {
  constructor (config) {
    config.name = 'svc:lnurl_channel'
    config.port = 8799
    super(config)
  }

  getNodeInfo (cb) {
    this.callLn('getInfo', {}, cb)
  }

  lnurlErr (txt) {
    return {
      status: 'ERROR', reason: txt || 'Failed to finish process'
    }
  }

  connectToNode (args, options, cb) {
    async.parallel([
      (next) => {
        Order.findOne({ _id: args.order_id }, next)
      },
      (next) => {
        this.getNodeInfo(next)
      }
    ], (err, [order, nodeinfo]) => {
      if (err) {
        console.log(err)
        return cb(null, this.lnurlErr())
      }
      if (!order) return cb(null, this.lnurlErr('Order not found'))
      if (order.state !== ORDER_STATES.PAID) return cb(null, this.lnurlErr('Order not in the right state'))

      const uri = nodeinfo.uris.pop()
      if (!uri) return cb(null, this.lnurlErr("Node isn't ready"))

      cb(null, {
        uri,
        callback: publicUri + '/v1/lnurl/channel',
        k1: args.order_id,
        tag: 'channelRequest'
      })
    })
  }

  openChannel (args, options, cb) {
    this.gClient.send('svc:manual_finalise', [{
      order_id: args.k1,
      node_uri: args.remoteid,
      uri_src: 'lnurl',
      private: args.private
    }, {}], (err, data) => {
      if (err) {
        return cb(null, this.lnurlErr('Failed to setup channel'))
      }
      if (data && data.error) {
        return cb(null, this.lnurlErr(data.error))
      }
      cb(null, { status: 'OK' })
    })
  }

  main (args, options, cb) {
    const {
      order_id: orderId,
      k1,
      remoteid
    } = args

    if (orderId) return this.connectToNode(args, options, cb)

    if (k1 && remoteid) return this.openChannel(args, options, cb)

    return cb(null, this.lnurlErr('Invalid request'))
  }
}

module.exports = LNUrlChannel

const n = new LNUrlChannel({})
