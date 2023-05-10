'use strict'
const Server = require('./Server/Http')
const config = require("../config/server.json")
const s = new Server({
  port: config.http.port,
  host: config.http.host,
  endpoint: 'USER_ENDPOINTS'
})
s.start()
