export type LandingPricingData = {
  monthlyPrice: number
  annualPrice: number
  trialDays: number
}

export const DEFAULT_LANDING_PRICING: LandingPricingData = {
  monthlyPrice: 9,
  annualPrice: 79,
  trialDays: 14,
}

type BackendPricingPayload = {
  id?: unknown
  monthlyPrice?: unknown
  annualPrice?: unknown
  trialDays?: unknown
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

function normalizeLandingPricing(payload: BackendPricingPayload | undefined): LandingPricingData {
  const monthlyPrice = parsePositiveNumber(
    payload?.monthlyPrice,
  ) ?? DEFAULT_LANDING_PRICING.monthlyPrice

  const annualPrice = parsePositiveNumber(
    payload?.annualPrice,
  ) ?? DEFAULT_LANDING_PRICING.annualPrice

  const trialDays = Math.round(
    parsePositiveNumber(
      payload?.trialDays,
    ) ?? DEFAULT_LANDING_PRICING.trialDays,
  )

  return {
    monthlyPrice,
    annualPrice,
    trialDays,
  }
}

export async function getLandingPricing(): Promise<LandingPricingData> {
  const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
  if (!apiBaseUrl) {
    return DEFAULT_LANDING_PRICING
  }

  try {
    const response = await fetch(`${apiBaseUrl}/plans/pro`)
    if (!response.ok) {
      return DEFAULT_LANDING_PRICING
    }

    return normalizeLandingPricing((await response.json()) as BackendPricingPayload)
  } catch {
    return DEFAULT_LANDING_PRICING
  }
}