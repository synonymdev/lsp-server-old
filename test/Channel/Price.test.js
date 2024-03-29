/* eslint-env mocha */
'use strict'
const assert = require('assert')
const {
  getChannelFee,
  getChannelPrice,
  MIN_PRICE
}= require('../../src/util/pricing')
const { BigNumber } = require('bignumber.js')
const nock = require('nock')

describe('Pricing', () => {
  let buyChannel

  describe('Validate Price', () => {

    it('Should return numbers', async() => {
      const p = await getChannelPrice({
        remote_balance: 0,
        local_balance: 1,
        channel_expiry:12,
      })
      assert(p.price === MIN_PRICE.toString() )
      assert(p.totalAmount === MIN_PRICE.toString())
    })
    it('Should return the correct variables', async() => {

      const scope = nock('https://api-pub.bitfinex.com')
        .get('/v2/tickers?symbols=fBTC')
        .reply(200, [["fBTC",0.00010332054794520548,0.1,120,42.2102839,0.00000371,2,11.833589810000001,0.00000758,0.0758,0.00001,6259.34687856,0.00026,1e-8,null,null,2735.90018801]])

      const p = await getChannelPrice({
        remote_balance: 0,
        local_balance: 500000000,
        channel_expiry:12,
      })
      assert(+p.price === 4339463)
      assert(+p.totalAmount === 4339463)
    })
    it('Should have higher totalAmount when channel has remote balance', async() => {

      const scope = nock('https://api-pub.bitfinex.com')
        .get('/v2/tickers?symbols=fBTC')
        .reply(200, [["fBTC",0.00010332054794520548,0.1,120,42.2102839,0.00000371,2,11.833589810000001,0.00000758,0.0758,0.00001,6259.34687856,0.00026,1e-8,null,null,2735.90018801]])

      const remoteBal = 100000000
      const p = await getChannelPrice({
        remote_balance: remoteBal,
        local_balance: 500000000,
        channel_expiry:12,
      })
      assert(+p.price === 4339463)
      assert(+p.totalAmount === 104339463)
    })
    after(()=>{
      nock.cleanAll()
    })
  })

})
