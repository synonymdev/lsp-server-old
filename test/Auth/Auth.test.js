/* eslint-env mocha */
'use strict'

const Authenticator = require('attest-auth')
const curve = require('noise-handshake/dh')
const serverKeys = require('../../config/auth.json')
const assert = require('assert')
const Auth = require('../../src/Auth/Auth')

const toBuf = (t) => Buffer.from(t, 'hex')

describe('Auth', () => {
  let auth

  before(() => {
    auth = new Auth({
      test_env: true
    })
  })

  let userKeys
  beforeEach(() => {
    userKeys = {
      publicKey: toBuf('0992a3b7b3a7a867210643ea4da9a6d1637a21b3133b39b7c197e88e855a807e'),
      secretKey: toBuf('851253d2d813a9e16f6085b0a90d3a419089707bbf9cebd28d334cce2a0e25ce')
    }
  })

  it('Can fetch auth challenge', () => {
    auth.main({}, {}, (err, data) => {
      if (err) throw err
      assert.ok(data.challenge)
    })
  })

  it('login', () => {
    const metadata = Buffer.from('User meta data.')
    auth.main({}, {}, (err, data) => {
      if (err) throw err
      const trustedLogin = Authenticator.createClientLogin(userKeys, toBuf(serverKeys.server_public), toBuf(data.challenge), { curve, metadata })
      trustedLogin.on('verify', function (info) {
        console.log(info.publicKey.slice(0, 8), 'Client logged in!', info)
        console.log(Buffer.from(info.metadata, 'base64').toString())
        assert.strictEqual(info.publicKey, userKeys.publicKey.toString('hex'), 'User keys dont match')
      })
      const loginRequest = Buffer.from(trustedLogin.request).toString('hex')
      auth.main({
        metadata: metadata.toString('hex'),
        request: loginRequest
      }, {}, (err, data) => {
        if (err) throw err
        trustedLogin.verify(data.response)
      })
    })
  })
})
