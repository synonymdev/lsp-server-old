'use strict'
const { Worker } = require('blocktank-worker')
const { pick } = require('lodash')
const async = require('async')
const { constants } = require('../../config/server.json')
const Order = require('../Orders/Order')
const exchange = require('../util/exchange-api')
const { BigNumber } = require('bignumber.js')

class NodeInfo extends Worker {
  constructor (config) {
    config.name = 'svc:node_info'
    super(config)
  }

  async _calcChanCapacity () {
    const maxDollar = constants.max_channel_dollar.toString()
    const maxRecieve = await exchange.usdToSats(maxDollar)
    const maxSpendSats = BigNumber(maxRecieve).minus(constants.channel_size_buffer_sats).toString()
    const maxspendUsd = await exchange.satsToUSD(maxSpendSats)
    return {
      max_chan_receiving: maxRecieve,
      max_chan_receiving_usd: maxDollar,
      max_chan_spending: maxSpendSats,
      max_chan_spending_usd: maxspendUsd
    }
  }

  async main (args, options, cb) {
    const channelCaps = await this._calcChanCapacity()
    async.auto({
      node_info: (next) => {
        this.callLn('getInfo', {}, (err, data) => {
          if (err) return next(new Error('failed to get node'))
          const node = pick(data, [
            'alias', 'active_channels_count', 'uris', 'public_key'
          ])
          next(null, node)
        })
      },
      capacity: (next) => {
        this.callLn('listChannels', {}, (err, channels) => {
          if (err) return next(new Error('Failed to get channels'))
          const initVals = { local_balance: 0, remote_balance: 0 }
          if (!channels) return next(null, initVals)
          const stats = channels.reduce((total, chan) => {
            if (!chan.is_active || chan.is_private) return total
            total.local_balance += chan.local_balance
            total.remote_balance += chan.remote_balance
            return total
          }, initVals)
          next(null, stats)
        })
      },
      chainBalance: (next) => {
        this.callLn('getOnChainBalance', null, (err, balance) => {
          if (err) return next(err)
          if (constants.min_wallet_balance_buffer > balance) return next(null, false)
          next(null, true)
        })
      },
      maxUsdCap: (next) => {
        if (!constants.compliance_check) {
          return next(null, { max_node_usd_capacity: null })
        }
        this.callWorker('svc:channel_aml', 'getMaxOrderUSD', {}, next)
      },
      services: ['chainBalance', 'maxUsdCap', ({ chainBalance, maxUsdCap }, next) => {
        next(null, [{
          available: chainBalance,
          description: 'Channel Liquidity',
          product_id: constants.product_id,
          min_channel_size: constants.min_channel_size,
          max_channel_size: constants.max_channel_size,
          min_chan_expiry: constants.min_chan_expiry,
          max_chan_expiry: constants.max_chan_expiry,
          max_node_usd_capacity: maxUsdCap.max_node_usd_capacity,
          order_states: Order.ORDER_STATES,
          ...channelCaps
        }])
      }]
    }, (err, data) => {
      if (err) return cb(err)
      delete data.chainBalance
      delete data.maxUsdCap
      cb(null, data)
    })
  }
}

module.exports = NodeInfo

const n = new NodeInfo({})
