/* eslint-env mocha */
'use strict'
const assert = require('assert')
const BuyChannel = require('../../src/Channel/BuyChannel')
const { constants } = require('../../config/server.json')


jest.setTimeout(10000)

let buyChannel
beforeAll(function () {
  buyChannel = new BuyChannel({
    test_env: false,
    port: (Math.random() * 10000).toFixed(0)
  })
})





describe('BuyChannel - Validate order', () => {
  let order
  beforeEach(() => {
    order = {
      channel_expiry: 1,
      local_balance: 100000000,
      remote_balance: 10000000
    }
  })

  it('accept valid order', () => {
    const res = buyChannel._validateOrder(order)
    assert.ok(!res)
  })

  it('throw error for invalid channel expiry', () => {
    order.channel_expiry = 1.1
    const res = buyChannel._validateOrder(order)
    assert.ok(res)
  })

  it('throw error for local float channel amounts', () => {
    order.local_balance = order.local_balance + 0.1
    const res = buyChannel._validateOrder(order)
    assert.ok(res)
  })

  it('throw error for remote float channel amounts', () => {
    order.remote_balance = order.remote_balance + 0.1
    const res = buyChannel._validateOrder(order)
    assert.ok(res)
  })

  it('throw error for max remote channel size', () => {
    order.local_balance = constants.max_channel_size + 2
    order.remote_balance = constants.max_channel_size + 1
    const res = buyChannel._validateOrder(order)
    assert.ok(res)
  })
})

describe('Buy Channel', () => {
  it('It should fail if product id is incorrect', (done) => {
    jest.setTimeout(3000)
    buyChannel.main({
      product_id: 'aaaa',
      local_balance: 100000,
      remote_balance: 100000,
      channel_expiry: 4
    }, {}, (err, data) => {
      if (err) return done(err)

      assert.equal(data.error, 'Failed to find product')
      return done()
    })
  })

  it('It should create an order', (done) => {
    jest.setTimeout(3000)
    buyChannel.main({
      product_id: constants.product_id,
      local_balance: 1000000,
      remote_balance: 0,
      channel_expiry: 4
    }, {}, (err, data) => {
      if (err) return done(err)
      assert.ok(data.price > 0)
      assert.ok(data.total_amount > 0)
      assert.ok(data.order_expiry > 0)
      assert.ok(data.btc_address)
      assert.ok(data.order_id)
      assert.ok(data.ln_invoice)
      assert.ok(data.lnurl_channel)
      return done()

    })
  })

})

