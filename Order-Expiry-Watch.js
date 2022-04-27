
'use strict'
const { Client: GrenacheClient } = require('blocktank-worker')

function startWatch () {
  let running = false
  setInterval(() => {
    if (running) {
      return console.log('Still processing orders....')
    }
    running = true
    console.log('Marking orders as expired')
    gClient.send('svc:get_order', {
      method: 'markOrdersExpired',
      args: {}
    }, (err) => {
      running = false
      if (err) throw err
      console.log('Done')
    })
    // TODO mark orders given up
  }, 5000)
}

const gClient = new GrenacheClient()
startWatch()
