'use strict'
const db = require('./../DB/DB')
const { EventEmitter } = require('events')

class Item {
  constructor (params) {
    this.data = params
  }

  toDocument () {
    return this.data
  }
}

class Inventory extends EventEmitter {
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

  static addNewItem (params, cb) {
    const inv = new Inventory()
    inv.on('ready', () => {
      inv.db.Inventory.insertMany([new Item(params).toDocument()], cb)
    })
  }

  static find (query, cb) {
    const inv = new Inventory()
    inv.on('ready', () => {
      inv.db.Inventory.find(query).toArray(cb)
    })
  }

  static updateOne (id, data, cb) {
    const inv = new Inventory()
    inv.on('ready', () => {
      inv.db.Inventory.updateOne(
        { _id: new inv.db.ObjectId(id) },
        { $set: data }
        , cb)
    })
  }

  static updateSoldStats (id, cb) {
    const inv = new Inventory()
    inv.on('ready', () => {
      inv.db.Inventory.updateOne(
        { _id: new inv.db.ObjectId(id) },
        { $inc: { 'stats.sold_count': 1, 'stats.available': -1 } }
        , cb)
    })
  }
}

module.exports = Inventory
