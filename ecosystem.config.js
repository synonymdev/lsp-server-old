'use strict'

const DEBUG_FLAG = 'LH:*'

const settings = {
  ignore_watch: 'status',
  watch: ['./src', './*js']
}

module.exports = {
  apps: [
    {
      name: 'ln:channel-opener',
      script: './LN-Channel-Opener.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'order:expiry-watch',
      script: './Order-Expiry-Watch.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'ln:invoice-watch',
      script: './LN-Invoice-Watch.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'ln:channel-watch',
      script: './LN-Channel-Watch.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'btc:address-watch',
      script: './src/Bitcoin/AddressWatch.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:btc-zero-conf',
      script: './src/Channel/ZeroConf.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'server:express',
      script: './Start-Express.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:get-order',
      script: './src/Channel/GetOrder.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:node-info',
      script: './src/Channel/NodeInfo.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:buy-channel',
      script: './src/Channel/BuyChannel.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:finalise-channel',
      script: './src/Channel/FinaliseChannel.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:lnurl-channel',
      script: './src/Channel/LnUrlChannel.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:auth',
      script: './src/Auth/Auth.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },

    {
      name: 'server:admin',
      script: './Start-Admin.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },

    {
      name: 'api:channel-admin',
      script: './src/Admin/ChannelAdmin.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    },
    {
      name: 'api:exchange-rate',
      script: './src/Channel/ExchangeRate.js',
      env: {
        DEBUG: DEBUG_FLAG
      },
      env_production: {},
      ...settings
    }

  ]
}
