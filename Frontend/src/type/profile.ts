export type TicketStatus = 'active' | 'inactive'


export type TokenMetadata = {
  name?: string
  description?: string
  image?: string
  // Một số metadata sẽ có field "ticketType" hoặc "type" để phân biệt Thường/VIP/VVIP
  ticketType?: string
  type?: string
  event?: {
    title?: string
    date?: string
    time?: string
    location?: string
    organizer?: string
  }
}