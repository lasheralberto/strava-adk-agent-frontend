export type LandingPricingData = {
  monthlyPrice: number
  annualPrice: number
  trialDays: number
}

export type LandingPlan = {
  id: string
  monthlyPrice: number
  annualPrice: number
  trialDays: number
}

export const DEFAULT_LANDING_PRICING: LandingPricingData = {
  monthlyPrice: 9,
  annualPrice: 79,
  trialDays: 14,
}

export const DEFAULT_LANDING_PLANS: LandingPlan[] = [
  { id: 'free', monthlyPrice: 0, annualPrice: 0, trialDays: 0 },
  { id: 'pro', monthlyPrice: 9, annualPrice: 79, trialDays: 14 },
]

type BackendPricingPayload = {
  id?: unknown
  price?: unknown
  currency?: unknown
  monthlyPrice?: unknown
  annualPrice?: unknown
  trialDays?: unknown
}

type BackendPlansResponse = {
  plans?: BackendPricingPayload[]
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function normalizePlan(payload: BackendPricingPayload): LandingPlan {
  const id = typeof payload?.id === 'string' ? payload.id.trim().toLowerCase() : 'unknown'
  const isFree = id === 'free'

  const monthlyPrice = isFree
    ? 0
    : (parsePositiveNumber(payload?.price) ??
        parsePositiveNumber(payload?.monthlyPrice) ??
        DEFAULT_LANDING_PRICING.monthlyPrice)

  const annualPrice = isFree
    ? 0
    : (parsePositiveNumber(payload?.annualPrice) ?? DEFAULT_LANDING_PRICING.annualPrice)

  const trialDays = isFree
    ? 0
    : Math.round(parsePositiveNumber(payload?.trialDays) ?? DEFAULT_LANDING_PRICING.trialDays)

  return { id, monthlyPrice, annualPrice, trialDays }
}

export async function getLandingPlans(): Promise<LandingPlan[]> {
  const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
  if (!apiBaseUrl) {
    throw new Error('Pricing endpoint not configured.')
  }

  const response = await fetch(`${apiBaseUrl}/plans/pricing`)
  if (!response.ok) {
    throw new Error(`Pricing request failed: ${response.status}`)
  }

  const data = (await response.json()) as BackendPlansResponse
  const plans = Array.isArray(data?.plans) ? data.plans : []

  const mapped = plans
    .filter((p) => typeof p?.id === 'string')
    .map(normalizePlan)

  if (mapped.length === 0) {
    throw new Error('No pricing plans returned.')
  }

  return mapped
}
