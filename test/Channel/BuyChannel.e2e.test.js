/* eslint-env mocha */
'use strict'
const { default: client } = require('@synonymdev/blocktank-client')
const nodeman = require('blocktank-worker-ln')
const { Bitcoin, Converter } = require('blocktank-worker-btc')
const assert = require('assert')
const { promisify } = require('util')

const {
  config, btcConfig, lnConfig
} = require('./test.config')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let nodeInfo
let serviceInfo
let clientLN
let btc

async function setupBtc(cb) {
  console.log('Setting up Bitcoin client')
  btc = new Bitcoin(btcConfig)
  btc.getHeight({}, async (err, data) => {
    if (err) throw err
    if (!Number.isInteger(data)) throw new Error('Bitcoin worker not ready')
    btc.mineRegtestCoin = promisify(btc.mineRegtestCoin.bind(btc))
    btc.sendToAddr = promisify(btc.sendToAddr.bind(btc))
    // if (block.length !== 6) throw new Error('Blocks not mined')
    cb()
  })
}

async function quickMine() {
  console.log("Mining blocks")
  const block = await btc.mineRegtestCoin({ blocks: 3 })
  await sleep(5000)
  console.log("Finished mining")
}

function setupClientLib(cb) {
  console.log('Setting up Blocktank lib')
  client.host = config.api_host
  client.getInfo().then((res) => {
    nodeInfo = res
    serviceInfo = res.services[0]
    cb()
  }).catch((err) => {
    console.log(err)
    throw err
  })
}

function setupLN(cb) {
  console.log('Setting up LN client')
  clientLN = nodeman(lnConfig)
  clientLN.start((err) => {
    if (err) throw err
    nodeInfo = clientLN.nodes[0].info
    clientLN.pay = promisify(clientLN.pay.bind(clientLN, clientLN.getNode()))
    cb()
  })
}

async function createOrder() {
  const orderParams = {
    product_id: serviceInfo.product_id,
    remote_balance: 0,
    local_balance: 2000000,
    channel_expiry: 4
  }

  console.log('Creating order...')
  const order = await client.buyChannel(orderParams)
  console.log('Created order')

  assert(order.btc_address)
  assert(order.order_id)
  assert(order.ln_invoice)
  assert(Number.isInteger(order.total_amount))
  assert(Number.isInteger(order.price))
  assert(Number.isInteger(new Date(order.order_expiry).getTime()))
  return {
    order, orderParams
  }
}

function validatePaidOrder(paidOrder, orderParams) {
  assert(paidOrder._id)
  assert(paidOrder.state === 100)
  assert(paidOrder.remote_balance === orderParams.remote_balance)
  assert(paidOrder.local_balance === orderParams.local_balance)
  console.log('Order is ok.')
}

function validateFinalisedChannel(claim, paidOrder) {
  assert(claim.order_id === paidOrder._id)
  assert(claim.node_uri === nodeInfo.pubkey)
}

function payOnChain(order, testConf) {
  return btc.sendToAddr({
    address: order.btc_address,
    tag: 'End to end testing',
    amount: Converter.toBtc(order.total_amount),
    replaceable: !testConf.zero_conf
  })
}

async function testOnChain(testConf) {
  const { orderParams, order } = await createOrder()

  console.log('Paying order via on on chain...')
  await sleep(2000)
  const pay = await payOnChain(order, testConf)
  console.log('Payed order: ', pay.txid)

  if (!testConf.zero_conf) {
    await btc.mineRegtestCoin({ blocks: 3 })
    await sleep(5000)
  }
  console.log('Fetching order...')
  assert(pay.txid)
  let paidOrder
  for (let x = 0; x <= 50; x++) {
    await sleep(5000)
    paidOrder = await client.getOrder(order.order_id)

    if (x === 50) throw new Error('Zero conf not detected')
    if (paidOrder.state !== 100) {
      console.log('Waiting.. state: ', paidOrder.state)
      continue
    }
    validatePaidOrder(paidOrder, orderParams)
    break
  }
  console.log('Claiming order...')
  const claim = await client.finalizeChannel({
    order_id: paidOrder._id,
    node_uri: nodeInfo.uris[0],
    private: false
  })
  validateFinalisedChannel(claim, paidOrder)

  console.log('Claimed order')
  console.log('Checking order status...')
  for (let x = 0; x <= 50; x++) {
    if (x === 50) throw new Error('Failed to claim channel')
    await sleep(1000)
    paidOrder = await client.getOrder(order.order_id)
    if (paidOrder.state === 200 && paidOrder.remote_node.public_key === nodeInfo.pubkey) break
  }

  let orderClaimed = false
  let channelOpen = false
  for (let x = 0; x <= 50; x++) {
    console.log('Checking...')
    await sleep(5000)
    paidOrder = await client.getOrder(order.order_id)
    if (paidOrder.state === 300) {
      console.log('Order status is claimed. Mining blocks')
      orderClaimed = true
      await btc.mineRegtestCoin({ blocks: 6 })
      continue
    }



    if (orderClaimed && paidOrder.state === 500) {
      console.log('Order status: Channel is now open')
      checkOnChainPayConfirmation(paidOrder, orderParams, testConf.zero_conf)
      channelOpen = true
      break
    }
  }
  if (!orderClaimed || !channelOpen) throw new Error('Order failed to be claimed or channel did not open')
}

function checkOnChainPayConfirmation(paidOrder, orderParams, isZeroConf) {
  const onchain = paidOrder.onchain_payments.forEach((p) => {
    if (p.total_amount !== paidOrder.amount_base) throw new Error("payment amounts dont match")
    if (isZeroConf && p.height) throw new Error("height must be null for zero conf")
    if (!isZeroConf && !p.height) throw new Error("height must be set for non zero conf")
    if (!p.hash) throw new Error("payment hash not set")
    if (isZeroConf && !p.zero_conf) throw new Error("Zero conf not set")
    if (p.from.length === 0) throw new Error("Sender address not set")
    if (p.fee_base <= 0) throw new Error("Fee is invalid")
  })
}

beforeAll(function (done) {
  console.log('Setting up libs')
  setupClientLib(() => {
    setupLN(() => {
      setupBtc(done)
    })
  })
})

jest.setTimeout(100000)

describe('E2E - On chain payments', function () {

  it("On chain zero conf payment array", async function () {
    jest.setTimeout(10000)
    const { orderParams, order } = await createOrder()
    const testConf = { zero_conf: true }
    await payOnChain(order, testConf)
    await sleep(5000)
    let paidOrder = await client.getOrder(order.order_id)
    checkOnChainPayConfirmation(paidOrder, orderParams, testConf)
  })

})

it('should create an order for a channel, pay via LN and claim channel', async function () {
  jest.setTimeout(100000)
  await quickMine()
  const { orderParams, order } = await createOrder()

  console.log('Paying order via LN...')
  await sleep(2000)
  const pay = await clientLN.pay({ invoice: order.ln_invoice })
  console.log('Paid order')

  console.log('Fetching order...')
  await sleep(10000)
  assert(pay.is_confirmed)
  let paidOrder = await client.getOrder(order.order_id)
  validatePaidOrder(paidOrder, orderParams)
  assert(paidOrder.state === 100)

  console.log('Claiming order...')
  const claim = await client.finalizeChannel({
    order_id: paidOrder._id,
    node_uri: nodeInfo.uris[0],
    private: false
  })
  validateFinalisedChannel(claim, paidOrder)
  assert(paidOrder.onchain_payments.length === 0)
  console.log('Claimed order')
  console.log('Checking order status...')
  await sleep(5000)
  paidOrder = await client.getOrder(order.order_id)
  expect(paidOrder.state).toEqual(300)
  // assert(paidOrder.state === 300)
  // assert(paidOrder.remote_node.public_key === nodeInfo.pubkey)
  expect(paidOrder.remote_node.public_key).toEqual(nodeInfo.pubkey)

  let orderClaimed = false
  let channelOpen = false
  for (let x = 0; x <= 50; x++) {
    console.log('Checking...')
    await sleep(5000)
    paidOrder = await client.getOrder(order.order_id)

    if (!orderClaimed && paidOrder.state === 300) {
      console.log('Order status claimed')
      orderClaimed = true
      await btc.mineRegtestCoin({ blocks: 6 })
      continue
    }

    if (orderClaimed && paidOrder.state === 500) {
      console.log('Order status: Channel is now open')
      channelOpen = true
      break
    }
  }
  if (!orderClaimed || !channelOpen) throw new Error('Order failed to be claimed or channel did not open')
})

it('Should create an order and pay with zero conf payment, claim channel', async () => {
  await testOnChain({
    zero_conf: true
  })
})

it('Should create an order and pay with on chain payment , claim channel', async () => {
  await testOnChain({
    zero_conf: false
  })
})

