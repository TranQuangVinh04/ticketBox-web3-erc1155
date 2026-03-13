import { apiFetch } from './http'

export type IssueTicketResponse = {
  ok: boolean
  ticket: {
    id: string
    eventId: string
    tokenId: string
    amount: number
    status: string
    expiresAt: string | null
  }
  qr: { text: string; dataUrl?: string }
}

export type CheckinResponse = {
  ok: boolean
  ticket?: {
    id: string
    status: string
    checkedInAt: string
    event?: { name: string | null }
  }
  onchain?: {
    chainId: number
    contractAddress: string
    ownerWallet: string
    tokenId: string
    burnedAmount: number
    balanceBefore: string
    balanceAfter: string
    burnTxHash?: string
  }
  welcome?: {
    eventName?: string
    ticketType: 'Thường' | 'VIP' | 'VVIP'
    message: string
    seatingHint: string
  }
}

export async function issueTicket(body: {
  eventId?: string
  contractAddress?: string
  tokenId?: string
  chainId?: number
  amount?: number
}): Promise<IssueTicketResponse> {
  return apiFetch<IssueTicketResponse>('/tickets/issue', {
    method: 'POST',
    body: {
      eventId: body.eventId,
      contractAddress: body.contractAddress,
      tokenId: body.tokenId,
      chainId: body.chainId,
      amount: body.amount ?? 1,
    },
  })
}

export async function checkin(qrText: string): Promise<CheckinResponse> {
  return apiFetch<CheckinResponse>('/checkin', {
    method: 'POST',
    body: { qrText },
    skipAuth: true,
  })
}

export async function getTakenSeats(params: {
  chainId: number
  contractAddress: string
  tokenId: string
}): Promise<{ takenSeats: string[]; mySeats: string[] }> {
  const qs = new URLSearchParams({
    chainId: String(params.chainId),
    contractAddress: params.contractAddress,
    tokenId: params.tokenId,
  })
  const res = await apiFetch<{ ok?: boolean; takenSeats?: string[]; mySeats?: string[] }>(
    `/setpurchase/seats?${qs.toString()}`,
    { method: 'GET', skipAuth: true },
  )
  return {
    takenSeats: Array.isArray(res?.takenSeats) ? res.takenSeats : [],
    mySeats: Array.isArray(res?.mySeats) ? res.mySeats : [],
  }
}
