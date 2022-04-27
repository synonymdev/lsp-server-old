'use strict'

const { BigNumber } = require('bignumber.js')

module.exports = {
  toSatoshi: (amt) => {
    return new BigNumber(amt).abs().times(100000000).dp(8, BigNumber.ROUND_FLOOR).toString()
  },
  toBtc: (amt) => {
    return new BigNumber(amt).abs().div(100000000).dp(8, BigNumber.ROUND_FLOOR).toString()
  },
  SATOSHI: 100000000
}
