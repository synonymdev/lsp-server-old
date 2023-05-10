import { GrenacheClient } from 'blocktank-worker2'


export class LnWorkerService {
    private client: GrenacheClient;
    private lnProxy: any;

    async init() {
        this.client = new GrenacheClient()
        this.client.start()
        this.lnProxy = this.client.encapsulateWorker('svc:ln2')
    }


    async stop() {
        if (this.client) {
            this.client.stop()
            this.lnProxy = undefined
        }
    }

    async isNodeForChannelOpenAvailable(minSat: number): Promise<boolean> {
        try {
            return await this.lnProxy.isNodeWithMinimumOnchainBalanceAvailable(minSat)
        } catch (e) {
            console.error(e)
            return false
        }

    }
}