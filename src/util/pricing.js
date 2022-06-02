'use strict'
const { default: axios } = require('axios')
const BN = require('bignumber.js')
const { get } = require('lodash')
const config = require('../../config/server.json')
const { toBtc, toSatoshi } = require('./sats-convert')

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

async function getChannelFee ({ channel_expiry: expiry, local_balance: localBalance }) {

  if (config.constants.free_channels) return 0
  
  const amount = toBtc(localBalance)
  const _FRR = await getFRR()
  if (!_FRR) return null
  const FRR = BN(_FRR)
  // Price = Loan amount x Rate X Duration
  // Using: https://support.bitfinex.com/hc/en-us/articles/115004554309-Margin-Funding-interest-on-Bitfinex
  const t = BN(expiry).times(604800)
  const price = BN(amount).times((FRR)*(t/86400))
  // const price = BN(amount).times(FRR).times(12)
  if (price.isNaN() || price.lte(0)) {
    throw new Error('Failed to create channel fee')
  }
  const priceSats = BN(toSatoshi(price))
  if (priceSats.lte(MIN_PRICE)) {
    return MIN_PRICE.toString()
  }

  return priceSats.toFixed(0)
}

/**
 * @desc Calculate price of a channel
 * @param {Object} args
 * @param {Number} args.channel_expiry Channel expiry in weeks
 * @param {Number} args.local_balance The balance on Blokctank's side in SATOSHI
 * @param {Number} args.remote_balance The balance on custuomer's side in SATOSHI
 * @returns {Number} price in satoshi.
 * @returns {Number} totalAmount in satoshi. The amount the customer must payu
 */
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
  getChannelPrice, 
  MIN_PRICE
}
