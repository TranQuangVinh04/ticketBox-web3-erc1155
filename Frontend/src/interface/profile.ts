import { TicketStatus } from "../type/profile"
export interface MyOnchainTicket {
    contract: `0x${string}`
    tokenId: bigint
    name: string
    quantity: bigint
    priceWei?: bigint
    uri?: string
    status: TicketStatus
    
  }
