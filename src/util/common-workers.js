'use strict'
const { Client: GrenacheClient } = require('blocktank-worker')

const gClient = new GrenacheClient()

function lnWorker (method, args, cb) {
  return new Promise((resolve, reject) => {
    gClient.send('svc:ln', {
      method,
      args: Array.isArray(args) ? args : [args]
    }, (err, data) => {
      if (err) {
        return cb ? cb(err) : reject(err)
      }
      cb ? cb(null, data) : resolve(data)
    })
  })
}

function callWorker (svc, method, args, cb) {
  return new Promise((resolve, reject) => {
    gClient.send(svc, {
      method,
      args: Array.isArray(args) ? args : [args]
    }, (err, data) => {
      if (err) {
        return cb ? cb(err) : reject(err)
      }
      cb ? cb(null, data) : resolve(data)
    })
  })
}

module.exports = {
  lnWorker,
  callWorker
}
