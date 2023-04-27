'use strict'

const Inventory = require('../src/Inventory/Inventory')
const data = require('./create-inventory-item.json')
const { ObjectId } = require("mongodb")

function update (item) {
  return new Promise((resolve, reject) => {
    const handle = (err, data) => {
      if (err) return reject(err)
      resolve(data)
    }

    if (item.type === 'add_item') {
      console.log('adding')
      console.log(item.data)
      item.data._id = new ObjectId("625cea4d2c2de64cb734a0d7")
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
  const res = await Promise.all(data.map(update))
  console.log(res)
  console.log('Finished')
}

main()
