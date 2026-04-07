export type WeeklyDeltaMetric = {
  current: number
  previous: number
  delta: number
  delta_pct: number | null
}

export type WeeklyLongestRide = {
  id: number
  name: string
  distance_m: number
  distance_km: number
  start_date_local: string
} | null

export type WeeklySummary = {
  total_activities: number
  active_days: number
  total_distance_m: number
  total_distance_km: number
  total_moving_time_s: number
  total_moving_time_h: number
  total_elapsed_time_s: number
  total_elapsed_time_h: number
  total_elevation_gain_m: number
  total_kilojoules: number
  total_suffer_score: number
  total_pr_count: number
  total_achievement_count: number
  avg_speed_mps: number
  avg_speed_kmh: number
  avg_power_w: number | null
  weighted_avg_power_w: number | null
  avg_heartrate_bpm: number | null
  max_heartrate_bpm: number | null
  avg_cadence_rpm: number | null
  max_watts: number | null
  trainer_ratio: number
  commute_ratio: number
  power_data_coverage_pct: number
  heartrate_data_coverage_pct: number
  cadence_data_coverage_pct: number
  device_watts_coverage_pct: number
  longest_ride: WeeklyLongestRide
}

export type WeeklyIntensity = {
  estimated_if: number | null
  estimated_tss: number | null
}

export type WeeklyTrends = {
  activities: WeeklyDeltaMetric
  distance_km: WeeklyDeltaMetric
  moving_time_h: WeeklyDeltaMetric
  elevation_gain_m: WeeklyDeltaMetric
  kilojoules: WeeklyDeltaMetric
}

export type WeeklyDayRollup = {
  date: string
  activities: number
  distance_m: number
  distance_km: number
  moving_time_s: number
  moving_time_h: number
  elapsed_time_s: number
  elevation_gain_m: number
  kilojoules: number
}

export type WeeklyActivity = {
  id: number
  name: string
  sport_type: string
  start_date_local: string
  distance_m: number
  distance_km: number
  moving_time_s: number
  moving_time_h: number
  elapsed_time_s: number
  elevation_gain_m: number
  avg_speed_kmh: number | null
  avg_power_w: number | null
  weighted_power_w: number | null
  avg_heartrate_bpm: number | null
  max_heartrate_bpm: number | null
  avg_cadence_rpm: number | null
  kilojoules: number
  suffer_score: number
  pr_count: number
  achievement_count: number
  trainer: boolean
  commute: boolean
  has_heartrate: boolean
  device_watts: boolean
}

export type WeeklySummaryResponse = {
  week: {
    start_date: string
    end_date: string
    days: number
    after_epoch: number
    before_epoch: number
    previous_start_date: string
    previous_end_date: string
  }
  filters: {
    sport_types: string[]
    include_activity_zones: boolean
    zone_sample_limit: number
  }
  athlete: {
    id: number | null
    firstname: string | null
    lastname: string | null
    measurement_preference: string | null
    ftp: number | null
    weight: number | null
  }
  summary: WeeklySummary
  intensity: WeeklyIntensity
  trends: WeeklyTrends
  daily: WeeklyDayRollup[]
  activities: WeeklyActivity[]
  zones: {
    available: boolean
    reason?: string
    sampled_activities: number
    distribution: Record<string, Array<{ min: number; max: number; time_s: number; pct_of_week_moving_time: number }>>
  }
  benchmarks?: {
    available?: boolean
    reason?: string
    biggest_ride_distance?: number
    biggest_climb_elevation_gain?: number
    recent_ride_totals?: Record<string, unknown>
    ytd_ride_totals?: Record<string, unknown>
    all_ride_totals?: Record<string, unknown>
  } | null
}
