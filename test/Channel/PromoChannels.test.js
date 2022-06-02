const { default: client } = require('@synonymdev/blocktank-client')
const assert = require('assert')
const { promisify } = require('util')
const PromoChannels = require('../../src/Channel/PromoChannels')


const getPromoChan = ()=>{
  return new PromoChannels({})
}


let promoChan
describe("Promo Channels",()=>{

  beforeEach( async ()=>{
    promoChan = getPromoChan()
  })
  
  afterEach( async ()=>{
    await promoChan.stopWorker()
  })
  describe('Stats', () => { 
    it("should get stats for inventory", async ()=>{
      const stats = (await promisify(promoChan.getStats.bind(promoChan))())[0]
      const keys = [
        'sold_count_tick',
        'capacity_sold_tick',
        'capacity_available_tick',
        'capacity_total',
        'capacity_tick'
      ]
      assert(stats._id)
      assert(stats.state > 0)
      keys.forEach((k)=>{
        assert(typeof stats.stats[k] === "number")
      })
    })
    it("checkCapacity should return true when we have capacity", async ()=>{
      promoChan.getStats = (cb)=>{
        cb(null,{
          product_meta: {
            chan_size: 1000
          },
          stats : {
            capacity_available_tick : 1000000000
          }
        })
      }
      const cap = await promoChan.checkCapcity()
      assert(cap === true)
    })
    it("checkCapacity should return false when we have capacity", async ()=>{
      promoChan.getStats = (cb)=>{
        cb(null,{
          product_meta: {
            chan_size: 1000
          },
          stats : {
            capacity_available_tick : 1
          }
        })
      }
      const cap = await promoChan.checkCapcity()
      assert(cap === false)
    })
  })

  describe("process orders",()=>{
    it("Should do nothing when there is no orders to process", async ()=>{
      promoChan._getOrders = (q,cb)=>{
        cb(null,[{
          _id:"test",
          state:0
        }])
      }
      const cap = await promisify(promoChan.processOrders.bind(promoChan))()
      assert(cap.orders_processed === 0)
    })
    it("Should give up on order when no capacity", async ()=>{
      promoChan.getStats = (cb)=>{
        cb(null,{
          product_meta: {
            chan_size: 1000
          },
          stats : {
            capacity_available_tick : 1
          }
        })
      }
      promoChan._getOrders = (q,cb)=>{
        cb(null,[])
      }
      const cap = await promisify(promoChan.processOrders.bind(promoChan))()
      assert(cap.orders_processed === 0)
    })
  })
})