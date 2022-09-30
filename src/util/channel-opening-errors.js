'use strict'

const err = [
  ['PEER_NOT_REACHABLE',{
    giveup: false
  }],
  [ 'PEER_TOO_MANY_PENDING_CHANNELS',{
    giveup: false
  }],
  [ 'PEER_REJECT_MULTI_CHAN',{
    giveup: true
  }],
  [ 'CHAN_SIZE_TOO_BIG',{
    giveup: true
  }],
  [ 'CHAN_SIZE_TOO_SMALL',{
    giveup: true,
    alert: false
  }],
  [ 'BLOCKTANK_NOT_READY',{
    giveup: false,
    alert: true
  }],
  [ 'SERVICE_FAILED_TO_OPEN_CHANNEL',{
    giveup: true
  }],
  ["NO_TX_ID",{
    giveup: true,
    alert: true
  }]
]

class ChannelOpenError {
  constructor(name, config, raw){
    this.giveup = config.giveup
    this.alert = config.alert || false
    this.name = name
    this.raw = this.parseRaw(raw)
    this.ts = Date.now()
  }

  parseRaw(raw){
    return raw.message || raw
  }

  toString(){
    return JSON.stringify({
      error: this.name,
      channel_error: this.raw,
      giveup: this.giveup,
      ts: this.ts
    })
  }
}


function parseChannelOpenErr (err) {
  
  const errMsg = (txt)=>{
    if(Array.isArray(txt)){
      return txt.filter((txt)=>{
        return err.message.includes(txt)
      }).length > 0
    }
    return err.message.includes(txt)
  }

  if (errMsg(['RemotePeerDisconnected', 'PeerIsNotOnline', 'RemotePeerExited'])) {
    return errors.PEER_NOT_REACHABLE(err)
  }
  if (errMsg('PeerPendingChannelsExceedMaximumAllowable')) {
    return errors.PEER_TOO_MANY_PENDING_CHANNELS(err)
  }

  if (errMsg('FailedToOpenChannel')) {
    if (errMsg('exceeds maximum chan size')) {
      return errors.CHAN_SIZE_TOO_BIG(err)
    }
    if (errMsg('below min chan size')) {
      return errors.CHAN_SIZE_TOO_SMALL(err)
    }
    
    if(errMsg("No connection established")){
      return errors.PEER_NOT_REACHABLE(err)
    }
  }
  if (errMsg(['InsufficientFundsToCreateChannel','WalletNotFullySynced'])) {
    return errors.BLOCKTANK_NOT_READY(err)
  }

  if(errMsg("RemoteNodeDoesNotSupportMultipleChannels")){
    return errors.PEER_REJECT_MULTI_CHAN(err)
  }
  console.log("UNHANDLED_CHANNEL_OPEN_ERR")
  console.log(err.message ? err.message : err)

  return errors.SERVICE_FAILED_TO_OPEN_CHANNEL(err)
}


const errors = err.reduce((obj, [name,config])=>{
  obj[name] = (raw) => new ChannelOpenError(name,config,raw)
  return obj
},{})

module.exports = {
  parseChannelOpenErr,
  errors,
}