'use strict'
const db = require('../DB/DB')
const { EventEmitter } = require('events')

const promcb = (resolve, reject, cb) => {
  return (err, data) => {
    if (err) {
      return cb ? cb(err, data) : reject(err)
    }
    cb ? cb(err, data) : resolve(data)
  }
}

class Order extends EventEmitter {
  constructor (params) {
    super()
    this.data = params
    this.ready = false
    db((err, db) => {
      if (err) throw err
      this.db = db
      this.ready = true
      process.nextTick(() => this.emit('ready'))
    })
  }

  static ORDER_STATES = {
    CREATED: 0,
    PAID: 100,
    REFUNDED: 150,
    URI_SET: 200,
    OPENING: 300,
    CLOSING: 350,
    GIVE_UP: 400,
    EXPIRED: 410,
    REJECTED: 450,
    CLOSED: 450,
    OPEN: 500
  }

  static from (params) {
    return new Order(params)
  }

  static updateOrder(id,data, cb){
    return new Promise((resolve, reject) => {
      const order = new Order()
      order.on('ready', () => {
        if(data._id){
          delete data._id
        }
        if(data.product_id){
          data.product_id = new order.db.ObjectId(data.product_id)
        }

        return order.db.LnChannelOrders.updateOne(
          { _id: new order.db.ObjectId(id) },
          {
            $set: data
          }, promcb(resolve, reject, cb))
      })
    })
  }

  static updateOrders(query,data, cb){
    return new Promise((resolve, reject) => {
      const order = new Order()
      order.on('ready', () => {
        return order.db.LnChannelOrders.update(query,
          { $set: data }, promcb(resolve, reject, cb))
      })
    })
  }

  static getOrdersInState(options,cb){
    Order.find({
      ...options,
      order_expiry: { $gte: Date.now() }
    }, cb)
  }

  static newLnChannelOrder (params, cb) {
    const order = new Order()
    order.on('ready', () => {
      order.db.LnChannelOrders.insertOne({
        ...params,
        product_id: new order.db.ObjectId(params.product_id),
        created_at: Date.now(),
        order_result: [],
        state: Order.ORDER_STATES.CREATED
      }, cb)
    })
  }

  static find (query, cb) {
    const order = new Order()
    order.on('ready', () => {
      let limit, sort, skip
      if(query._limit){
        limit = query._limit
      }

      if(query._sort){
        sort = query._sort
      }

      if(query._skip && query._skip > 0 & query._skip <= 100){
        skip = query._skip
      }

      try{
        if(query._id) {
          if(Array.isArray(query._id)){
            query._id =  { $in : query._id.map((id)=> new order.db.ObjectId(id)) }
          } else {
            query._id = new  order.db.ObjectId(query._id)
          }
        }
      } catch(err){
        console.log(err)
        return cb(new Error("invalid order id"))
      }

      delete query._sort
      delete query._skip
      delete query._limit


      let dbCall = order.db.LnChannelOrders.find(query)
      
      if(sort){
        dbCall = dbCall.sort(sort)
      }
      
      if(skip){
        dbCall = dbCall.skip(skip)
      }

      if(limit){
        dbCall = dbCall.limit(limit)
      }

      dbCall.toArray(cb)
    })
  }

  static findOne (query, cb) {
    return new Promise((resolve, reject) => {
      const order = new Order()
      order.on('ready', () => {
        if(query._id){
          query._id = new order.db.ObjectId(query._id)
        }
        order.db.LnChannelOrders.findOne(query, promcb(resolve, reject, cb))
      })
    })
  }
}

module.exports = Order
