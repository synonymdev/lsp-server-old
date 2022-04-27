'use strict'
const { default: axios } = require('axios')
const { toBtc, SATOSHI } = require('./sats-convert')
const { get } = require('lodash')
const { default: BigNumber } = require('bignumber.js')

async function callAPI (ticker) {
  try {
    const res = await axios.get('https://api-pub.bitfinex.com/v2/tickers?symbols=' + ticker)
    return res
  } catch (err) {
    console.log('Failed to get FRR')
    console.log(err)
    return null
  }
}

async function getRate (ticker) {
  const data = await callAPI(ticker)
  const res = get(data, 'data[0]')
  return {
    price: res ? res[7] : null
  }
}

const ExchangeRate = {
  satsToUSD: async (sats) => {
    if (sats === 0) return 0
    const btcUSD = await ExchangeRate.getBtcUsd()
    const btc = toBtc(sats)
    return BigNumber(btc).times(btcUSD.price).dp(3, BigNumber.ROUND_FLOOR).toString()
  },

  usdToBtc: async (dollar) => {
    if (dollar === 0) return 0
    const btcUSD = await ExchangeRate.getBtcUsd()
    return BigNumber(dollar).dividedBy(btcUSD.price).dp(8, BigNumber.ROUND_FLOOR).toString()
  },

  usdToSats: async (dollar) => {
    const toBtc = await ExchangeRate.usdToBtc(dollar)
    return BigNumber(toBtc).times(SATOSHI).toString()
  },

  getBtcUsd: () => {
    return getRate('tBTCUSD')
  },

  async getRatesRaw (tickers) {
    const res = await callAPI(tickers)
    return res.data
  }
}
module.exports = ExchangeRate
