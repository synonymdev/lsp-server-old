'use strict'
const Server = require('./Server/Http')

const s = new Server({
  port: 4001,
  endpoint: 'ADMIN_ENDPOINTS'
})
s.start()
