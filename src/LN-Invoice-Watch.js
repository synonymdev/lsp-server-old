
'use strict'
const async = require('async')
const { ORDER_STATES } = require('./Orders/Order')
const { Client: GrenacheClient } = require('blocktank-worker')
const { LnWorkerApi, Ln2EventListener } = require('@blocktank/ln2-api');
const { waitOnSigint } = require('@blocktank/worker2')

// function getInvoice (order) {
//   return order.state === ORDER_STATES.CREATED
//     ? order.ln_invoice
//     : get(order, 'renewal_quote.ln_invoice', {})
// }

function getUpdatePayload (order) {
  if (order.state === ORDER_STATES.CREATED) {
    return {
      state: ORDER_STATES.PAID,
      amount_received: order.ln_invoice.amountSat
    }
  }

  order.renewals.push({
    previous_channel_expiry: order.channel_expiry_ts,
    ...order.renewal_quote
  })
  return {
    renewals: order.renewals,
    channel_expiry_ts: order.channel_expiry_ts
  }
}

// function getHodlOrders (cb) {
//   async.waterfall([
//     (next) => {
//       getOrder({}, next)
//     },
//     (orders, next) => {
//       async.mapLimit(orders, 5, (order, next) => {
//         const invoice = getInvoice(order)
//         lnWorker('getInvoice', { id: invoice.id }, (err, invoice) => {
//           if (err) return next(err)
//           if (invoice.is_held) {
//             return next(null, { order, invoice })
//           }
//           next(null, null)
//         })
//       }, (err, data) => {
//         if (err) return next(err)
//         next(null, data.filter(Boolean))
//       })
//     }
//   ], cb)
// }

function settleInvoice (order, cb) {
  const txt = `remote: ${order.remote_balance} | local: ${order.local_balance} | total: ${order.local_balance + order.remote_balance}`
  alert('info', 'payment', `Payment ${order._id} received. ${txt}`)
  const invoiceId = order.ln_invoice.id;
  LnWorkerApi.settleHodlInvoice(invoiceId).then(() => {
    cb(null, { settled: true })
  }).catch((err) => {
    console.log('Failed to settle invoice')
    console.log(err)
    return cancelInvoice(order, cb)
  })
}

// function settleInvoice (order, cb) {
//   lnWorker('settleHodlInvoice', { secret: getInvoice(order).secret }, (err) => {
//     if (err) {
//       console.log('Failed to settle invoice')
//       console.log(err)
//       return cancelInvoice(order, cb)
//     }
//     cb(null, { settled: true })
//   })
// }

function cancelInvoice (order, cb) {
  console.log('Cancelling order invoice: ', order._id)
  LnWorkerApi.cancelHodlInvoice(order.ln_invoice_id).then(() => {
    cb(null, { settled: true })
  }).catch((err) => {
    console.log('Failed to cancel invoice')
    console.log(err)
    return cb(err)
  })
}

// function cancelInvoice (order, cb) {
//   console.log('Cancelling order invoice: ', order._id)
//   lnWorker('cancelInvoice', { id: getInvoice(order).id }, (err) => {
//     if (err) {
//       console.log('Failed to cancel invoice')
//       console.log(err)
//       return cb(err)
//     }
//     cb(null, { settled: true })
//   })
// }

async function processHeldInvoice ({ order }, options = {}) {
  console.log(`Invoice is being received and held : ${order.ln_invoice.id}`)

  async.waterfall([
    (next) => {
      settleInvoice(order, next)
    },
    (res, next) => {
      if (!res.settled) return next(null, false)
      updateOrder({
        id: order._id,
        update: getUpdatePayload(order)
      }, next)
    }
  ], (err) => {
    if (err) {
      console.log(`Failed to settle invoice: ${order._id}`)
      console.log(err)
      return
    }
    console.log(`Settled invoice: ${order._id}`)
  })
}

async function startWatch () {
  console.log('Listening on invoice changes')
  const listener = new Ln2EventListener('svc:buy_channel')
  try {
    await listener.init()
    await listener.listenToInvoicesChanged(async (message) => {
      console.log('New invoice changed event', message)
      let orders;
      try {
        orders = await new Promise((resolve, reject) => {
          getOrder({ 'ln_invoice.id': message.content.invoiceId
          }, (err, order) => {
            if (err) return reject(err)
            resolve(order)
          })
        })
      } catch (e) {
        console.log('Failed to get order')
        console.log(err)
        return
      }

      if (!orders || orders.length === 0) {
        console.log('No order found')
        return
      }
      const order = orders[0]
      if (message.content.state.new === 'holding' && order.state === ORDER_STATES.CREATED) {
        console.log('Order invoice change to holding', orders)
        await processHeldInvoice({ order: order })
      }
      // Todo: Process canceled and paid invoice.
    })
    await waitOnSigint()
  } catch (err) {
    console.error('Uncaught global error: ', err)
  } finally {
    await listener.stop()
  }
}

// function startWatch () {
//   let running = false
//   setInterval(() => {
//     if (running) {
//       return console.log('Still processing orders....')
//     }
//     running = true
//     getHodlOrders(async (err, data) => {
//       if (err) {
//         running = false
//         throw err
//       }
//       try {
//         console.log(`Processing ${data.length} invoices`)
//         await Promise.all(data.map((d) => processHeldInvoice(d)))
//       } catch (err) {
//         console.log('Failed to process orders')
//         console.log(err)
//       }
//       running = false
//     })
//   }, 5000)
// }

function alert (level, tag, msg) {
  return new Promise((resolve, reject) => {
    gClient.send('svc:monitor:slack', [level, 'payment', msg], (err, data) => {
      if (err) {
        return reject(err)
      }
      resolve(data)
    })
  })
}

function updateOrder (args, cb) {
  gClient.send('svc:get_order', {
    method: 'updateOrder',
    args: args
  }, cb)
}

function getOrder (args, cb) {
  gClient.send('svc:get_order', {
    method: 'getPendingPaymentOrders',
    args: args
  }, (err, data) => {
    if (err) {
      return cb(err)
    }
    cb(null, data)
  })
}

const gClient = new GrenacheClient()
startWatch()
