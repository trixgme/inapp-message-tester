export type Status = "scheduled" | "live" | "ended" | "deleted";
export type AudienceType = "all" | "segment";
export type TapType = "none" | "in_app_menu" | "external_url";
export type StartType = "immediate" | "scheduled";

/** 국가행 단위의 상태·우선순위·통계 (기획서 §3.3 campaign_country) */
export interface CountryState {
  status: Status;
  priority: number | null; // Live 행의 노출 순서(1 = 첫 노출). 목록 위에서부터 1..N 자동 부여, 비Live는 null
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
  /**
   * 전체 국가(audienceType "all") 캠페인의 국가별 캐러셀 위치 (국가 통합 리스트 안의 슬롯).
   * 상태·통계는 perCountry.All 한 행으로 관리하고, perCountry.All.priority는
   * 전체 국가 배너들 "간의" 상대 순서(보드 상단 All 섹션)로 쓴다.
   */
  allPriority?: Record<string, number>;
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
