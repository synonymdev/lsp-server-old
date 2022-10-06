'use strict'
const { promisify } = require('util')
const { Worker } = require('blocktank-worker')
const { parseUri } = require('../util/lnurl')
const { pick } = require('lodash')
const Order = require('../Orders/Order')
const config = require('../../config/server.json')

class FinaliseChannel extends Worker {
  constructor (config) {
    config.name = 'svc:manual_finalise'
    config.port = 7671
    super(config)
    this.checkNodeCompliance = promisify(this.checkNodeCompliance)
    this._channel_claims = new Set()
  }

  async checkNodeCompliance (pubkey, socket, order, cb) {
    if (!config.constants.compliance_check) return cb(null, { aml_pass: true })
    this.gClient.send('svc:channel_aml', {
      method: 'amlFiatCapactyCheck',
      args: {
        node_public_key: pubkey,
        node_socket: socket,
        order
      }
    }, (err, data) => {
      if (err) {
        console.log(err)
        return cb(new Error('Failed to check node'))
      }
      if (data.error) {
        return cb(new Error(data.error))
      }
      cb(null, data)
    })
  }

  async main (args, options, cb) {
    const params = pick(args, [
      'order_id', 'node_uri', 'uri_src', 'private'
    ])

    const end = (err, data) => {
      this._channel_claims.delete(params.order_id)
      cb(err, data)
    }

    if (this._channel_claims.has(params.order_id)) {
      return cb(null, this.errRes('Channel is being claimed'))
    }

    const db = this.db

    let order
    try {
      order = await db.LnChannelOrders.findOne({
        _id: new db.ObjectId(params.order_id)
      })
    } catch (err) {
      console.log(err)
      return end(null, this.errRes('Failed to find order'))
    }

    if (!order) {
      return end(null, this.errRes('Failed to find order'))
    }

    if (![Order.ORDER_STATES.PAID, Order.ORDER_STATES.URI_SET].includes(order.state)) {
      return end(null, this.errRes('Order not paid or already claimed'))
    }

    const uri = parseUri(params.node_uri)
    if (uri.err) {
      return end(null, this.errRes('Node URI not valid'))
    }

    if (config.constants.compliance_check) {
      const amlCheck = await this.checkNodeCompliance(uri.public_key, uri.addr, order)
      if (!amlCheck.aml_pass) {
        this.alertSlack('notice', `Order failed AML check. Order: ${order._id} . Node: ${uri.public_key} . ${amlCheck.reason || ''}`)
        return end(null, this.errRes(
          'Failed to claim channel: ' + amlCheck.reason
        ))
      }
    }

    order.remote_node = uri
    order.remote_node_src = !params.uri_src ? 'manual' : params.uri_src
    if(+params.private === 0){
      params.private_channel = false
    } else {
      order.private_channel = params.private
    }
    order.state = Order.ORDER_STATES.URI_SET
    Order.updateOrder(params.order_id, order, (err) => {
      if (err) {
        console.log(err)
        return end(err, this.errRes('Failed to claim channel'))
      }
      end(null, { order_id: params.order_id, node_uri: order.remote_node.public_key })
    })
  }
}

module.exports = FinaliseChannel
const n = new FinaliseChannel({})
