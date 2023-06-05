import { LnWorkerApi, LnEventListener } from '@synonymdev/blocktank-lsp-ln2-client';



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
        const listener = new LnEventListener('myFirstWorker')
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


