'use strict'
const { Worker } = require('blocktank-worker')
const exchangeAPI = require('../util/exchange-api')
const convert = require('../util/sats-convert')

class ExchangeRate extends Worker {
  constructor (config) {
    config.name = 'svc:exchange_rate'
    config.port = config.port || 8282
    super(config)
  }

  async getBtcUsd (args, cb) {
    let usd
    try {
      usd = await exchangeAPI.getBtcUsd()
    } catch (err) {
      console.log(err)
      return cb(new Error('Failed to convert sats to usd'))
    }
    cb(null, usd)
  }

  satsToBtc ({ sats }, cb) {
    cb(null, {
      sats,
      btc: convert.toBtc(sats)
    })
  }

  async getRatesFrontend (args, config, cb) {
    let rates
    try {
      rates = await exchangeAPI.getRatesRaw('tBTCUSD,tBTCEUR,tBTCJPY,tBTCGBP')
    } catch (err) {
      console.log(err)
      return cb(null, this.errRes('Failed to get rates at this timej'))
    }
    cb(null, rates)
  }
}

module.exports = ExchangeRate

const n = new ExchangeRate({})
