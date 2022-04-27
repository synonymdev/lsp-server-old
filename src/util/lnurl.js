'use strict'
const { bech32 } = require('bech32')

const limit = 1023

function encode (str) {
  const words = bech32.toWords(Buffer.from(str, 'utf8'))
  return bech32.encode('lnurl', words, 1023)
}

function decode (lnurl) {
  const { words } = bech32.decode(lnurl, { limit })
  return Buffer.from(bech32.fromWords(words), 'utf8').toString()
}

const isPublicKey = n => !!n && /^0[2-3][0-9A-F]{64}$/i.test(n)

function parseUri (uri) {
  const res = {
    err: false,
    port: null,
    ip: null,
    addr: null,
    public_key: null
  }
  uri = uri.split('@')
  const isValidKey = isPublicKey(uri[0])
  if (!isValidKey) {
    res.err = 'NOT_VALID_KEY'
    return res
  }
  res.public_key = uri[0]

  if (uri.length === 2) {
    res.addr = uri[1]
    const parsed = uri[1].split(':')
    res.ip = parsed[0]
    res.port = parsed[1]
  }
  return res
}

module.exports = {
  parseUri,
  encode,
  decode
}
