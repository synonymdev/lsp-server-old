'use strict'
const express = require('express')
const bodyParser = require('body-parser')
const { EventEmitter } = require('events')
const { Client: GrenacheClient } = require('blocktank-worker')
const Endpoints = require('./Endpoints')
const helmet = require('helmet')
const { ip_block_countries: ipBlocks } = require('../../config/server.json')

const API_VERSION = '//v1'

class Server extends EventEmitter {
  constructor (config) {
    super()
    if (!config.endpoint || !Endpoints[config.endpoint]) throw new Error('Endpoint config not valid')
    this.endpoints = Endpoints[config.endpoint]
    this.config = config
    this.app = express()
    this.app.use(helmet())
    this.app.use(bodyParser.json())
    this.port = config.port || 4000
    this.host = config.host || "localhost"
    this.gClient = new GrenacheClient(config)
  }

  async isLoggedIn (key) {
    return new Promise((resolve, reject) => {
      this.gClient.send('svc:simple_auth', {
        method: 'isLoggedIn',
        args: { key }
      }, (err, data) => {
        if (err || data.error || !data.logged_in) {
          return reject(new Error('Unauthorised'))
        }
        resolve(data)
      })
    })
  }

  async handleRequest (endpoint, req, res) {
    let args

    if (ipBlocks && ipBlocks.includes(req.headers['cf-ipcountry']) && endpoint.config.geoblocked) {
      return res.status(200).send({ error: 'GEO_BLOCKED' })
    }

    if (endpoint.config.method === 'POST') {
      args = req.body
    } else {
      args = req.query
    }

    if (endpoint.config.private) {
      try {
        await this.isLoggedIn(req.headers.authorization)
      } catch (err) {
        return res.status(403).send()
      }
    }

    this.gClient.send(endpoint.config.svc, [args, {
      endpoint,
      user_agent: req.headers["user-agent"] || "NA"
    }], (err, data) => {
      if (err) {
        console.log(err)
        return this._genericErr(res)
      }
      res.status(200).send(data)
    })
  }

  _genericErr (res) {
    return res.status(500).send('Blocktank server error!')
  }

  start () {
    const list = this.endpoints

    Object.keys(list.endpoints).forEach((v, k) => {
      const api = {
        config: list.endpoints[v],
        url: v
      }
      this.app[api.config.method.toLowerCase()](API_VERSION + v, this.handleRequest.bind(this, api))
    })
    this.app.use((err, req, res, next) => {
      if (err && err.stack) {
        return this._genericErr(res)
      }
      next()
    })
    this.app.listen(this.port, this.host, () => {
      console.log(`Express is listening at http://${this.host}:${this.port}`)
    })
  }
}

module.exports = Server
