import type { Campaign, CampaignRow, Status, TestSend } from "./types";
import { COUNTRY_BASE, SEED_CAMPAIGNS } from "./data";

const CAMPAIGN_KEY = "iam.campaigns.v1";
const TEST_KEY = "iam.testsends.v1";

const isBrowser = () => typeof window !== "undefined";

export function uid(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/* ---------------- Campaigns ---------------- */

export function loadCampaigns(): Campaign[] {
  if (!isBrowser()) return SEED_CAMPAIGNS;
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) {
      window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(SEED_CAMPAIGNS));
      return structuredClone(SEED_CAMPAIGNS);
    }
    return JSON.parse(raw) as Campaign[];
  } catch {
    return structuredClone(SEED_CAMPAIGNS);
  }
}

export function saveCampaigns(list: Campaign[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(list));
}

export function resetCampaigns(): Campaign[] {
  if (isBrowser()) window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(SEED_CAMPAIGNS));
  return structuredClone(SEED_CAMPAIGNS);
}

/** 목록 표시용: 캠페인×국가로 펼치고 생성일 최신순 정렬 (§5.1.5) */
export function toRows(list: Campaign[]): CampaignRow[] {
  const rows: CampaignRow[] = [];
  for (const c of list) {
    for (const country of c.countries) {
      const st = c.perCountry[country];
      if (!st) continue;
      rows.push({ campaign: c, country, ...st });
    }
  }
  rows.sort((a, b) => b.campaign.createdAt.localeCompare(a.campaign.createdAt));
  return rows;
}

/** 국가 내 캐러셀 순서: 수동 숫자 오름차순 → 나머지 Auto 최신순 (§6, D-02) */
export function carouselOrder(list: Campaign[], country: string): Campaign[] {
  const live = list.filter(
    (c) => c.countries.includes(country) && c.perCountry[country]?.status === "live"
  );
  const withNum = live
    .filter((c) => c.perCountry[country].priority != null)
    .sort((a, b) => (a.perCountry[country].priority! - b.perCountry[country].priority!));
  const auto = live
    .filter((c) => c.perCountry[country].priority == null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...withNum, ...auto];
}

export function liveCount(list: Campaign[], country: string): number {
  return list.filter(
    (c) => c.countries.includes(country) && c.perCountry[country]?.status === "live"
  ).length;
}

/** 수동 우선순위 검증: 1..N 정수, 국가 내 중복 불가 (H-10) */
export function validatePriority(
  list: Campaign[],
  campaignId: string,
  country: string,
  value: number | null
): string | null {
  if (value == null) return null; // Auto 는 항상 유효
  const n = liveCount(list, country);
  if (!Number.isInteger(value) || value < 1 || value > n)
    return `1 ~ ${n} 사이의 정수만 가능합니다 (해당 국가 Live 캠페인 ${n}건).`;
  const dup = list.some(
    (c) =>
      c.id !== campaignId &&
      c.countries.includes(country) &&
      c.perCountry[country]?.status === "live" &&
      c.perCountry[country]?.priority === value
  );
  if (dup) return `${country} 내에 우선순위 ${value} 가 이미 있습니다 (중복 불가).`;
  return null;
}

function mutateCountry(
  list: Campaign[],
  campaignId: string,
  country: string,
  fn: (s: Campaign["perCountry"][string]) => void
): Campaign[] {
  return list.map((c) => {
    if (c.id !== campaignId) return c;
    const st = c.perCountry[country];
    if (!st) return c;
    const next = { ...st };
    fn(next);
    return { ...c, perCountry: { ...c.perCountry, [country]: next } };
  });
}

/** Stop now: Live → Ended (back-dating 없음, 해당 국가행만) (H-04) */
export function stopRow(list: Campaign[], campaignId: string, country: string): Campaign[] {
  return mutateCountry(list, campaignId, country, (s) => {
    if (s.status === "live") s.status = "ended";
  });
}

/** Delete(soft): Live 불가, 수동 우선순위면 Auto 복귀 필요 (H-05/06) */
export function deleteRow(
  list: Campaign[],
  campaignId: string,
  country: string
): { list: Campaign[]; error?: string } {
  const c = list.find((x) => x.id === campaignId);
  const st = c?.perCountry[country];
  if (!st) return { list };
  if (st.status === "live")
    return { list, error: "진행중(Live)은 삭제할 수 없습니다. 먼저 Stop now 하세요." };
  if (st.priority != null)
    return { list, error: "수동 우선순위가 있어 삭제할 수 없습니다. 먼저 Auto로 되돌리세요 (§4.3)." };
  return { list: mutateCountry(list, campaignId, country, (s) => (s.status = "deleted")) };
}

export function restoreRow(list: Campaign[], campaignId: string, country: string): Campaign[] {
  return mutateCountry(list, campaignId, country, (s) => {
    if (s.status === "deleted") s.status = "ended";
  });
}

export function setPriority(
  list: Campaign[],
  campaignId: string,
  country: string,
  value: number | null
): Campaign[] {
  return mutateCountry(list, campaignId, country, (s) => (s.priority = value));
}

/** Preview audience 추정치 (저장 안 함, 데모용) (C-06) */
export function estimateAudience(
  audienceType: "all" | "segment",
  countries: string[]
): number {
  if (audienceType === "all")
    return Object.values(COUNTRY_BASE).reduce((a, b) => a + b, 0);
  return countries.reduce((sum, c) => sum + (COUNTRY_BASE[c] ?? 20000), 0);
}

/* ---------------- Test Sends ---------------- */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function loadTestSends(): TestSend[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(TEST_KEY);
    const list: TestSend[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const alive = list.filter((t) => t.expiresAt > now); // 24h 자동 만료 (T-04)
    if (alive.length !== list.length) saveTestSends(alive);
    return alive;
  } catch {
    return [];
  }
}

export function saveTestSends(list: TestSend[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(TEST_KEY, JSON.stringify(list));
}

export function addTestSend(t: TestSend): TestSend[] {
  const list = [t, ...loadTestSends()];
  saveTestSends(list);
  return list;
}

export function deleteTestSend(id: string): TestSend[] {
  const list = loadTestSends().filter((t) => t.id !== id);
  saveTestSends(list);
  return list;
}

export const STATUS_LABEL: Record<Status, string> = {
  scheduled: "Scheduled",
  live: "Live",
  ended: "Ended",
  deleted: "Deleted",
};
