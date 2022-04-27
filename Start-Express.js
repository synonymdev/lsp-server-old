'use strict'
const Server = require('./src/Server/Http')

const s = new Server({
  port: 4000,
  endpoint: 'USER_ENDPOINTS'
})
s.start()
