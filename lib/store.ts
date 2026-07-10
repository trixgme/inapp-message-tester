import type { Campaign, CampaignRow, Status, TestSend } from "./types";
import { COUNTRIES, COUNTRY_BASE, SEED_CAMPAIGNS } from "./data";

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
    const parsed = JSON.parse(raw) as Campaign[];
    // 구모델(Auto/수동 혼합, 전체국가 선노출 고정) 데이터 마이그레이션: 통합 위치 1..N 자동 부여
    const normalized = normalizePriorities(parsed);
    if (normalized !== parsed) saveCampaigns(normalized);
    return normalized;
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

/* ---------------- 노출 순서 (통합 캐러셀 모델) ----------------
 * - 국가 캐러셀 = 국가 타깃 배너 + 전체 국가(All) 배너를 하나의 리스트로 통합, 위 = 먼저 노출.
 * - 국가 타깃 행 위치: perCountry[국가].priority (1..N)
 * - 전체 국가 배너 위치: allPriority[국가] (국가마다 독립, 1..N)
 * - perCountry.All.priority: 전체 국가 배너들 "간의" 상대 순서 (보드 상단 All 섹션)
 */

/** 전체 국가(Show to all users) 캠페인 여부 */
export function isGlobalCampaign(c: Campaign): boolean {
  return c.audienceType === "all" && c.perCountry.All != null;
}

/** 국가 통합 리스트에서 이 캠페인의 저장된 위치 */
export function countryPos(c: Campaign, country: string): number | null {
  if (isGlobalCampaign(c)) return c.allPriority?.[country] ?? null;
  return c.perCountry[country]?.priority ?? null;
}

function withCountryPos(c: Campaign, country: string, p: number): Campaign {
  if (isGlobalCampaign(c)) return { ...c, allPriority: { ...c.allPriority, [country]: p } };
  const st = c.perCountry[country];
  if (!st || st.priority === p) return c;
  return { ...c, perCountry: { ...c.perCountry, [country]: { ...st, priority: p } } };
}

/**
 * 섹션 내부의 Live 정렬 (perCountry[section].priority 오름차순, 미부여는 맨 뒤 최신순).
 * section = "All" → 전체 국가 배너들의 상대 순서, 개별 국가 → 그 국가 "타깃" 배너만.
 */
export function sectionOrder(list: Campaign[], section: string): Campaign[] {
  return list
    .filter((c) => c.countries.includes(section) && c.perCountry[section]?.status === "live")
    .sort((a, b) => {
      const pa = a.perCountry[section].priority ?? Number.POSITIVE_INFINITY;
      const pb = b.perCountry[section].priority ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * 국가 캐러셀의 실제 노출 순서 = 통합 위치 오름차순.
 * 위치 미부여(마이그레이션 전) 행은: 전체 국가 배너 → 맨 앞(All 섹션 순서), 국가 배너 → 맨 뒤(최신순).
 * (구모델 "전체 국가 선노출 고정 + 국가 배너 Auto 최신순"의 화면 순서를 그대로 보존하기 위한 규칙)
 */
export function carouselOrder(list: Campaign[], country: string): Campaign[] {
  if (country === "All") return sectionOrder(list, "All");
  const key = (c: Campaign) =>
    countryPos(c, country) ?? (isGlobalCampaign(c) ? -1 : Number.POSITIVE_INFINITY);
  return list
    .filter(
      (c) =>
        (c.countries.includes(country) && c.perCountry[country]?.status === "live") ||
        (isGlobalCampaign(c) && c.perCountry.All.status === "live")
    )
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka !== kb) return ka - kb;
      if (ka === -1) {
        // 미부여 전체 국가 배너끼리는 All 섹션 상대 순서
        const ga = a.perCountry.All.priority ?? Number.POSITIVE_INFINITY;
        const gb = b.perCountry.All.priority ?? Number.POSITIVE_INFINITY;
        if (ga !== gb) return ga - gb;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/** All 섹션(전체 국가 배너 상대 순서)을 1..M으로 재압축. 변경 없으면 원본 반환 */
function renumberAllSection(list: Campaign[]): Campaign[] {
  const want = new Map<string, number>();
  sectionOrder(list, "All").forEach((c, i) => want.set(c.id, i + 1));
  let changed = false;
  const next = list.map((c) => {
    const w = want.get(c.id);
    if (w == null || c.perCountry.All?.priority === w) return c;
    changed = true;
    return { ...c, perCountry: { ...c.perCountry, All: { ...c.perCountry.All, priority: w } } };
  });
  return changed ? next : list;
}

/** 국가 통합 리스트(또는 "All" 섹션)의 위치를 현재 순서 기준 1..N으로 재압축. 변경 없으면 원본 반환 */
export function renumberCountry(list: Campaign[], country: string): Campaign[] {
  if (country === "All") return renumberAllSection(list);
  const want = new Map<string, number>();
  carouselOrder(list, country).forEach((c, i) => want.set(c.id, i + 1));
  let changed = false;
  const next = list.map((c) => {
    const w = want.get(c.id);
    if (w == null || countryPos(c, country) === w) return c;
    changed = true;
    return withCountryPos(c, country, w);
  });
  return changed ? next : list;
}

/** 전체 불변식 정리: All 섹션 1..M, 국가 통합 리스트 1..N, 비Live 행 순서값 제거 */
export function normalizePriorities(list: Campaign[]): Campaign[] {
  let changed = false;
  let next = list.map((c) => {
    let per: Campaign["perCountry"] | null = null;
    for (const [cc, st] of Object.entries(c.perCountry)) {
      if (st.status !== "live" && st.priority != null) {
        per = per ?? { ...c.perCountry };
        per[cc] = { ...st, priority: null };
      }
    }
    const dropAll = c.allPriority != null && !(isGlobalCampaign(c) && c.perCountry.All.status === "live");
    if (!per && !dropAll) return c;
    changed = true;
    const base: Campaign = per ? { ...c, perCountry: per } : { ...c };
    if (dropAll) delete base.allPriority;
    return base;
  });

  const afterAll = renumberAllSection(next);
  if (afterAll !== next) changed = true;
  next = afterAll;

  const countries = new Set<string>();
  for (const c of next) {
    for (const cc of Object.keys(c.perCountry)) if (cc !== "All") countries.add(cc);
    if (isGlobalCampaign(c) && c.perCountry.All.status === "live")
      for (const cc of COUNTRIES) countries.add(cc);
  }
  for (const cc of countries) {
    const after = renumberCountry(next, cc);
    if (after !== next) changed = true;
    next = after;
  }
  return changed ? next : list;
}

/**
 * 드래그앤드롭 저장.
 * - 개별 국가: 통합 리스트(국가 배너 + 전체 국가 배너)를 orderedIds 순서 그대로 1..N 부여.
 * - "All" 섹션: 전체 국가 배너 간 상대 순서를 바꾸고, 각 국가에서는 글로벌 배너들이
 *   차지하고 있던 슬롯 집합을 유지한 채 새 상대 순서로 재배치한다 (국가별 개별 조정은 보존).
 */
export function reorderCountry(list: Campaign[], country: string, orderedIds: string[]): Campaign[] {
  if (country === "All") return reorderAllSection(list, orderedIds);
  const pos = new Map(orderedIds.map((id, i) => [id, i + 1] as const));
  const next = list.map((c) => {
    const p = pos.get(c.id);
    if (p == null) return c;
    const live = isGlobalCampaign(c)
      ? c.perCountry.All.status === "live"
      : c.perCountry[country]?.status === "live";
    if (!live || countryPos(c, country) === p) return c;
    return withCountryPos(c, country, p);
  });
  return renumberCountry(next, country);
}

function reorderAllSection(list: Campaign[], orderedIds: string[]): Campaign[] {
  const pos = new Map(orderedIds.map((id, i) => [id, i + 1] as const));
  let next = list.map((c) => {
    if (!isGlobalCampaign(c) || c.perCountry.All.status !== "live") return c;
    const p = pos.get(c.id);
    if (p == null || c.perCountry.All.priority === p) return c;
    return { ...c, perCountry: { ...c.perCountry, All: { ...c.perCountry.All, priority: p } } };
  });
  next = renumberAllSection(next);
  // 각 국가: 글로벌 슬롯 집합 유지 + 새 상대 순서로 재배치
  for (const cc of COUNTRIES) {
    const globalsHere = carouselOrder(next, cc).filter(isGlobalCampaign);
    if (globalsHere.length >= 2) {
      const slots = globalsHere.map((g) => countryPos(g, cc) ?? 0).sort((a, b) => a - b);
      const inAllOrder = [...globalsHere].sort(
        (a, b) => (a.perCountry.All.priority ?? 0) - (b.perCountry.All.priority ?? 0)
      );
      inAllOrder.forEach((g, i) => {
        next = next.map((c) => (c.id === g.id ? withCountryPos(c, cc, slots[i]) : c));
      });
    }
    next = renumberCountry(next, cc);
  }
  return next;
}

/**
 * 신규 캠페인 저장 (D-02 최신 우선 계승):
 * - 국가 타깃 Live 행 → 해당 국가 통합 리스트 맨 위(1번) 진입.
 * - 전체 국가 Live → 모든 국가 맨 위(1번) + All 섹션 맨 위 진입.
 */
export function addCampaign(list: Campaign[], campaign: Campaign): Campaign[] {
  const per: Campaign["perCountry"] = {};
  for (const [cc, st] of Object.entries(campaign.perCountry))
    per[cc] = { ...st, priority: st.status === "live" ? 0 : null }; // 0 = 임시 최상단, 아래서 1..N 재압축
  const fresh: Campaign = { ...campaign, perCountry: per };
  const globalLive = campaign.audienceType === "all" && per.All?.status === "live";
  if (globalLive) fresh.allPriority = Object.fromEntries(COUNTRIES.map((cc) => [cc, 0]));
  let next: Campaign[] = [fresh, ...list];
  if (globalLive) {
    next = renumberAllSection(next);
    for (const cc of COUNTRIES) next = renumberCountry(next, cc);
  } else {
    for (const [cc, st] of Object.entries(per))
      if (st.status === "live") next = renumberCountry(next, cc);
  }
  return next;
}

/** 국가 캐러셀에 실제 노출되는 Live 수 (전체 국가 배너 포함) */
export function liveCount(list: Campaign[], country: string): number {
  return carouselOrder(list, country).length;
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

/** Stop now: Live → Ended + 순서에서 제외, 영향받는 섹션/국가 1..N 재압축 (H-04) */
export function stopRow(list: Campaign[], campaignId: string, country: string): Campaign[] {
  const target = list.find((c) => c.id === campaignId);
  const wasLive = target?.perCountry[country]?.status === "live";
  let next = mutateCountry(list, campaignId, country, (s) => {
    if (s.status === "live") {
      s.status = "ended";
      s.priority = null;
    }
  });
  if (!wasLive) return next;
  if (country === "All") {
    // 전체 국가 캠페인 정지 → 모든 국가 캐러셀에서 제외
    next = next.map((c) => (c.id === campaignId ? { ...c, allPriority: undefined } : c));
    next = renumberAllSection(next);
    for (const cc of COUNTRIES) next = renumberCountry(next, cc);
    return next;
  }
  return renumberCountry(next, country);
}

/** Delete(soft): Live 불가 — 먼저 Stop now (H-05). Stop 시점에 순서는 이미 해제됨 */
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
  return { list: mutateCountry(list, campaignId, country, (s) => (s.status = "deleted")) };
}

export function restoreRow(list: Campaign[], campaignId: string, country: string): Campaign[] {
  return mutateCountry(list, campaignId, country, (s) => {
    if (s.status === "deleted") s.status = "ended";
  });
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
