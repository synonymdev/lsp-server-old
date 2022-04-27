'use strict'
const { Worker } = require('blocktank-worker')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { users } = require('../../config/auth.json')
const { find } = require('lodash')
const { authenticator } = require('otplib')

const SALT_ROUNDS = 12

const FAILED_LOGIN = 'Unauthorised'

class SimpleAuth extends Worker {
  constructor (config) {
    config.name = 'svc:simple_auth'
    config.port = 8487
    super(config)
    this.loginAttempt = new Map()
    this.sessions = new Map()

    setInterval(() => {
      this.loginAttempt.forEach((a, user) => {
        const delta = Date.now() - a[1]
        if (delta >= 30000) {
          this.loginAttempt.delete(user)
        }
      })
      this.sessions.forEach((val, session) => {
        const delta = Date.now() - val[1]
        if (delta >= 600000) {
          this.sessions.delete(session)
        }
      })
    }, 1000)
  }

  isLoggedIn ({ key }, cb) {
    const user = this.sessions.get(key)
    if (!user) {
      return cb(null, { logged_in: false })
    }
    return cb(null, {
      logged_in: true,
      user_name: user[0]
    })
  }

  attemptedLogin (username, msg, cb) {
    console.log(`Failed to login: ${username} - ${msg}`)
    if (!this.loginAttempt.has(username)) {
      this.loginAttempt.set(username, [0, Date.now()])
    }
    const attempt = this.loginAttempt.get(username)
    ++attempt[0]
    attempt[1] = Date.now()
    this.loginAttempt.set(username, attempt)
    return cb(null, this.errRes(FAILED_LOGIN))
  }

  async login (args, cb) {
    console.log('New login: ', args.username)
    const { username, token, password } = args

    // Check that the user is registered
    const user = find(users, { username })
    if (!user) {
      return this.attemptedLogin(username, 'bad username', cb)
    }

    // Check the users's attempt count
    const attempt = this.loginAttempt.get(username)
    if (attempt && attempt[0] >= 5) {
      return this.attemptedLogin(username, 'too many attempts', cb)
    }

    // Check password
    if (!bcrypt.compareSync(password, user.password)) {
      return this.attemptedLogin(username, 'bad pass', cb)
    }

    // Check two factor auth
    if (!authenticator.check(token, user.token)) {
      return this.attemptedLogin(username, 'bad 2fa', cb)
    }

    // Create session key
    const key = crypto.randomBytes(256).toString('hex')
    this.sessions.set(key, [user.username, Date.now()])

    // Delete login attempts
    this.loginAttempt.delete(username)
    return cb(null, { key })
  }

  async createUser (args, cb) {
    const secret = authenticator.generateSecret(256)
    cb(null, {
      username: args.username,
      token: secret,
      password: bcrypt.hashSync(args.password, SALT_ROUNDS)
    })
  }
}

module.exports = SimpleAuth

const n = new SimpleAuth({})
