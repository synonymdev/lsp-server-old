'use strict'
const { promisify } = require('util')
const { Worker, DB } = require('blocktank-worker')
const { parseUri } = require('../util/lnurl')
const { pick } = require('lodash')
const async = require('async')
const Inventory = require('../Inventory/Inventory')
const { ORDER_STATES } = require('../Orders/Order')
const config = require('../../config/server.json')

class PromoChannels extends Worker {
  constructor (config) {
    config.name = 'svc:promo_channels'
    config.port = 7671
    super(config)
    this.checkNodeCompliance = promisify(this.checkNodeCompliance)
    this.product_id = "6305726c806073342fb42e43"
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

  async getStats(cb){
    Inventory.find({
      _id : this.product_id
    },cb)
  }

  async _updateOrder(args,cb){
    return new Promise((resolve,reject)=>{
      this.callWorker('svc:get_order', "updateOrder",args, (err,data) =>{
        if(err){
          return reject(err)
        }
        resolve(data)
      })
    })
  }

  async checkCapcity(){
    let inv 
    try{
      inv = await promisify(this.getStats.bind(this))()
    } catch(err) {
      console.log(err)
      throw new Error("FAILED_TO_GET_INVENTORY")
    }
    const newTotal = inv.stats.capacity_available_tick - inv.product_meta.chan_size
    if( newTotal >= 0){
      return true
    }
    return false
  }

  _getOrders (query, cb) {
    this.callWorker('svc:channel_admin', "getOrders",  query, (err, data) => {
      if (err) {
        return cb(err)
      }
      cb(null, data)
    })
  }

  async processOrders (cb) {
    const orders = await promisify(this._getOrders.bind(this))({
      product_id: this.product_id,
      state: 0
    })

    async.map(orders,async (order)=>{
      if(!this.checkCapcity()){
        order.state = ORDER_STATES.GIVE_UP
      }
      //update order
      return order
    },(err,data)=>{
      console.log(err,data)
      if(err){
        return cb(err)
      }
      cb(null, {
        orders_processed: data.length
      })
    })
  }
}

module.exports = PromoChannels
