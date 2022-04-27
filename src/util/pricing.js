'use strict'
const { default: axios } = require('axios')
const BN = require('bignumber.js')
const { get } = require('lodash')
const config = require('../../config/server.json')

async function getFRR () {
  try {
    const res = await axios.get('https://api-pub.bitfinex.com/v2/tickers?symbols=fBTC')
    return get(res, 'data[0][1]', null)
  } catch (err) {
    console.log('Failed to get FRR')
    console.log(err)
    return null
  }
}

const DUST_LIMIT = BN(546)
const MIN_PRICE = DUST_LIMIT.times(2)

async function getChannelFee ({ channel_expiry: expiry, local_balance: localBalance, remote_balance: remoteBalance }) {
  if (config.constants.free_channels) return 0
  const _FRR = await getFRR()
  if (!_FRR) return null
  // Rate per hour
  const FRR = BN(_FRR)
  // Convert channel duration to hours
  const durationWeek = BN(expiry).times(168)
  // Price = Loan amount x Rate X Duration
  const price = BN(localBalance).times(FRR).times(durationWeek)

  if (price.isNaN() || price.lte(0)) {
    throw new Error('Failed to create channel fee')
  }

  if (price.lte(MIN_PRICE)) {
    return MIN_PRICE.toString()
  }

  return price.toFixed(0)
}

async function getChannelPrice (args) {
  const price = await getChannelFee(args)
  if (!price) throw new Error('Failed to get price')
  const totalAmount = BN(args.remote_balance).plus(price)
  if (totalAmount.isNaN() || totalAmount.lte(0)) throw new Error('Created invalid price')
  return {
    price,
    totalAmount: totalAmount.toFixed(0)
  }
}

module.exports = {
  getChannelFee,
  getChannelPrice
}
