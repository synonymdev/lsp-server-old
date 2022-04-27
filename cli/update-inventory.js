'use strict'

const Inventory = require('../src/Inventory/Inventory')
const data = require('./create-inventory-item.json')

function update (item) {
  return new Promise((resolve, reject) => {
    const handle = (err, data) => {
      if (err) return reject(err)
      resolve(data)
    }

    if (item.type === 'add_item') {
      console.log('adding')
      console.log(item.data)
      return Inventory.addNewItem(item.data, handle)
    }

    if (item.type === 'update_item') {
      return Inventory.updateOne(item.id, item.data, handle)
    }

    throw new Error('Invalid operation')
  })
}

async function main () {
  console.log(`Running Inventory : ${data.length} Items \n\n\n`)
  await Promise.all(data.map(update))
  console.log('Finished')
}

main()
