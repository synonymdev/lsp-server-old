'use strict'
const Server = require('./src/Lightning/Worker')
const ln = new Server({})
ln.start()
