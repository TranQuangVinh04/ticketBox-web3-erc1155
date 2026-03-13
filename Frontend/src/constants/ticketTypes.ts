export const FIXED_TICKET_TYPES = [
  { tokenId: '1', label: 'Thường' },
  { tokenId: '2', label: 'VIP' },
  { tokenId: '3', label: 'VVIP' },
] as const

export type FixedTicketTypeId = (typeof FIXED_TICKET_TYPES)[number]['tokenId']

export function ticketTypeLabelById(tokenId?: string) {
  const found = FIXED_TICKET_TYPES.find((x) => x.tokenId === (tokenId || '1'))
  return found?.label || `Vé #${tokenId || '1'}`
}
