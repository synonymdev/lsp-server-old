'use strict'
const { default: axios } = require('axios')
const { default: BigNumber } = require('bignumber.js')
const { toBtc,SATOSHI } = require('./sats-convert')

async function callTicker (ticker) {
  try {
    const res = await axios.get('https://api-pub.bitfinex.com/v2/tickers?symbols=' + ticker)
    return res
  } catch (err) {
    console.log('Failed to get FRR')
    console.log(err)
    return null
  }
}
async function callCandles (ticker) {
  try {
    const res = await axios.get('https://api-pub.bitfinex.com/v2/candles/trade' + ticker)
    return res.data
  } catch (err) {
    console.log('Failed to get FRR')
    console.log(err)
    return null
  }
}


async function getRate (ticker) {
  const data = await callTicker(ticker)
  let res
  if (data.data && data.data[0]) {
    res = data.data[0]
  }
  return {
    price: res[7] || null
  }
}

const ExchangeRate = {
  satsToUSD: async (sats) => {
    if (sats === 0) return 0
    const btcUSD = await ExchangeRate.getBtcUsd()
    const btc = toBtc(sats)
    return BigNumber(btc).times(btcUSD.price).toNumber()
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
    const res = await callTicker(tickers)
    return res.data
  },

  historicalBtcUsd: async (date) =>{
    const res = await callCandles(`:1D:tBTCUSD/last?start=${date}`)
    return {
      price: res? res[2] : null
    }
  }
}
module.exports = ExchangeRate
