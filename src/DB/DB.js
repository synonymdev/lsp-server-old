'use strict'

const { MongoClient, ObjectId } = require('mongodb')
const config = require('../../config/server.json')
let _db = null

function getDb (cb) {
  const url = config.db_url
  const dbName = 'Lighthouse'
  MongoClient.connect(url, { useUnifiedTopology: true }, function (err, client) {
    if (err) throw err
    const db = client.db(dbName)
    _db = {
      db,
      LnChannelOrders: db.collection('LnChannelOrders'),
      Inventory: db.collection('Inventory'),
      BtcAddress: db.collection('BtcAddress'),
      ObjectId
    }
    cb(null, _db)
  })
}

module.exports = (cb) => {
  return new Promise((resolve, reject) => {
    if (_db) {
      return cb ? cb(null, _db) : resolve(_db)
    }
    getDb((err, db) => {
      if (err) {
        return cb ? cb(err) : reject(err)
      }
      cb ? cb(null, db) : resolve(db)
    })
  })
}
