'use strict'
const Server = require('./Lightning/Worker')
const ln = new Server({})
ln.start()
