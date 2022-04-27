'use strict'

class BodyParam {
  constructor (txt, mandatory) {
    this.name = txt
    this.is_mandatory = !mandatory
  }

  toString () {
    return JSON.stringify({
      name: this.name,
      mandatory: this.is_mandatory
    })
  }
}


// 
// These are public endpoints
//
class USER_ENDPOINTS {
 static version = '/v1'
  static endpoints = {
    '/channel/order': {
      name: "getOrder",
      description:`Get current status of order`,
      svc: "svc:get_order",
      method: "GET",
      body:[
        new BodyParam('order_id'),
      ],
      geoblocked: true
    },
    '/channel/buy': {
      name: "buyChannel",
      description:`Create an order to open a channel`,
      svc: "svc:buy_channel",
      method: "POST",
      body:[
        new BodyParam('product_id'),
        new BodyParam('local_amount'),
        new BodyParam('remote_amount'),
        new BodyParam('channel_expiry')
      ],
      geoblocked: true
    },
    '/channel/manual_finalise': {
      name: "set node uri of bought channel",
      description:`Set node uri to manually open channel.`,
      svc: "svc:manual_finalise",
      method: "POST",
      body:[
        new BodyParam('order_id'),
        new BodyParam('node_id',false),
        new BodyParam('private',false)
      ],
      geoblocked: true
    },
    '/node/info':{ 
      description:`Get information about Chain Reactor node and current liquidity parameters `,
      name:"getNodeInfo",
      method: "GET",
      svc: "svc:node_info",
      geoblocked: false
    },

    '/lnurl/channel': {
      name: "lnurl channel endpoint",
      description:`Set node uri to manually open channel.`,
      svc: "svc:lnurl_channel",
      method: "GET",
      geoblocked: true
    },
    '/rate': {
      name: "exchangeRate",
      description:`Get exchange rate for node.`,
      svc: "svc:exchange_rate",
      svc_fn : "getRatesFrontend",
      method: "GET",
      geoblocked: false
    }
  }
}


//
// These are ADMIN endpoints.
//
class ADMIN_ENDPOINTS {
  static version = '/v1'
  static endpoints = {
    '/login':{
      name:"adminLogin",
      description:"Admin endpoint login.",
      svc: "svc:channel_admin",
      svc_fn : "login",
      method:"POST",
    },
    '/channel/manual_credit' : {
      private:true,
      name:"manualCredit",
      description:"Manually credit transaction",
      svc: "svc:btc_address_watch",
      method:"POST",
      body:[
        new BodyParam("order_id"),
        new BodyParam("tx_id"),
      ]
    },
    '/channel/orders' : {
      private:true,
      name:"getOrders",
      description:"Get orders",
      svc: "svc:channel_admin",
      method:"GET",
    },
    '/channel/refund' : {
      private:true,
      name:"refund",
      description:"Change order state and save refund tx info",
      svc: "svc:channel_admin",
      svc_fn: "refund",
      method:"POST",
    },
    '/channel/close' : {
      private:true,
      name:"closeChannels",
      description:"Close channels",
      svc: "svc:channel_admin",
      svc_fn : "closeChannelsSync",
      method:"POST",
    },
    '/btc/sweep':{
      private:true,
      name:"sweepOnchain",
      description:"Transfer funds from onchain btc address.",
      svc: "svc:channel_admin",
      svc_fn : "sweepOnchainFunds",
      method:"POST",
    }
  }
 }


module.exports = {
  USER_ENDPOINTS,
  ADMIN_ENDPOINTS,
}