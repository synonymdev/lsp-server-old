'use strict'

const Inventory = require('../src/Inventory/Inventory')

async function main () {
  return Inventory.find({}, (err, data) => {
    if (err) throw err
    console.log(data)
  })
}

main()
