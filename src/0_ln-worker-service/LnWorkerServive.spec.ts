import { LnWorkerApi, Ln2EventListener } from '@blocktank/ln2-api';



jest.setTimeout(2*60*1000)

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

describe('LnWorkerService', () => {

    it('isNodeForChannelOpenAvailable', async () => {
        const res = await LnWorkerApi.isNodeForChannelOpenAvailable(0)
        expect(res).toBe(true)
    })


    it('createInvoice', async () => {
        const listener = new Ln2EventListener('myFirstWorker')
        await listener.init()
        listener.listenToInvoicesChanged(async message => {
            console.log('invoices changed', message)
        })
        const invoice = await LnWorkerApi.createInvoice(1000, 'test', 60*1000)
        expect(invoice.amountSat).toEqual(1000)
        console.log(invoice.request)
        await sleep(1000)
        await listener.stop()
    })

});


