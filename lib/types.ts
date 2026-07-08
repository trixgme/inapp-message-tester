export type Status = "scheduled" | "live" | "ended" | "deleted";
export type AudienceType = "all" | "segment";
export type TapType = "none" | "in_app_menu" | "external_url";
export type StartType = "immediate" | "scheduled";

/** 국가행 단위의 상태·우선순위·통계 (기획서 §3.3 campaign_country) */
export interface CountryState {
  status: Status;
  priority: number | null; // null = Auto(최신순)
  sent: number;
  views: number;
  clicks: number;
}

export interface Poster {
  from: string;
  to: string;
  title: string;
  subtitle?: string;
}

/** 캠페인 공통 콘텐츠 + 일정 + 대상 규칙 (기획서 §3.2 campaign) */
export interface Campaign {
  id: string;
  name: string;
  audienceType: AudienceType;
  group?: string;
  countries: string[];
  bannerImage?: string; // 업로드된 data URL
  poster?: Poster; // 시드/데모용 그라디언트 배너
  tapType: TapType;
  tapMenu?: string;
  tapUrl?: string;
  startType: StartType;
  startAt?: string;
  endAt?: string;
  createdBy: string;
  createdAt: string;
  perCountry: Record<string, CountryState>;
}

/** 목록에서 캠페인×국가로 펼친 한 행 */
export interface CampaignRow extends CountryState {
  campaign: Campaign;
  country: string;
}

export interface TestSend {
  id: string;
  wallet: string;
  campaignName: string;
  bannerImage?: string;
  poster?: Poster;
  status: "sent" | "failed";
  sentAt: number;
  expiresAt: number;
}
