'use strict'
const fs = require('fs/promises')
const path = require('path')
const debug = require('debug')('LH:StatusFile')

class StatusFile {
  constructor (config) {
    this.config = config
    this.statusFile = path.join(__dirname, `../../status/${config.tag}.${config.postfix}.json`)
    this._data = {}
  }

  async loadFile (init) {
    let f
    try {
      f = JSON.parse(await fs.readFile(this.statusFile))
      return f
    } catch (err) {
      debug(`Creating ${this.statusFile}`)
      await this.updateFile(init)
    }
  }

  updateFile (data) {
    this._data = data
    return fs.writeFile(this.statusFile, JSON.stringify(data))
  }

  get data () {
    return this._data || {}
  }
}
module.exports = StatusFile
