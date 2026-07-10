"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { COUNTRIES, COUNTRY_GROUP, GROUPS } from "@/lib/data";
import type { Campaign, CampaignRow, Status } from "@/lib/types";
import {
  STATUS_LABEL,
  carouselOrder,
  deleteRow,
  liveCount,
  loadCampaigns,
  resetCampaigns,
  restoreRow,
  saveCampaigns,
  stopRow,
  toRows,
  uid,
} from "@/lib/store";
import MobilePreview from "@/components/MobilePreview";
import PageTabs from "@/components/PageTabs";

const STATUS_OPTS: (Status | "all")[] = ["all", "scheduled", "live", "ended", "deleted"];

/** 헤더 클릭 정렬 대상 컬럼 */
type SortKey = "country" | "createdAt" | "status" | "start" | "end" | "sent" | "views" | "clicks" | "ctr";
const STATUS_RANK: Record<Status, number> = { live: 0, scheduled: 1, ended: 2, deleted: 3 };
/** 지표 컬럼은 첫 클릭에 내림차순(큰 값 먼저)이 자연스럽다 */
const NUMERIC_KEYS: SortKey[] = ["sent", "views", "clicks", "ctr"];

function sortValue(r: CampaignRow, key: SortKey): string | number {
  switch (key) {
    case "country": return r.country;
    case "createdAt": return r.campaign.createdAt;
    case "status": return STATUS_RANK[r.status];
    case "start": return r.campaign.startAt ?? "";
    case "end": return r.campaign.endAt ?? "";
    case "sent": return r.sent;
    case "views": return r.views;
    case "clicks": return r.clicks;
    case "ctr": return r.views ? r.clicks / r.views : -1; // 노출 없으면 최하위
  }
}

function fmtNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

export default function HistoryPage() {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("all");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [previewCountry, setPreviewCountry] = useState<string>("Cambodia");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  useEffect(() => setList(loadCampaigns()), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const persist = (next: Campaign[]) => {
    setList(next);
    saveCampaigns(next);
  };

  const rows = useMemo(() => {
    if (!list) return [];
    return toRows(list).filter((r) => {
      if (r.status === "deleted" && status !== "deleted") return false;
      if (name && !r.campaign.name.toLowerCase().includes(name.toLowerCase())) return false;
      if (group !== "all" && r.campaign.group !== group) return false;
      if (country !== "all" && r.country !== country) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [list, name, group, country, status]);

  const counts = useMemo(() => {
    const c = { live: 0, scheduled: 0, ended: 0 };
    rows.forEach((r) => {
      if (r.status === "live") c.live++;
      else if (r.status === "scheduled") c.scheduled++;
      else if (r.status === "ended") c.ended++;
    });
    return c;
  }, [rows]);

  /** 보드와 동일한 섹션 분할: 🌍 전체 국가 + corridor 그룹별 (빈 섹션은 숨김) */
  const sections = useMemo(() => {
    const allRows = rows.filter((r) => r.country === "All");
    const groups = GROUPS.map((g) => ({
      group: g,
      rows: rows.filter((r) => COUNTRY_GROUP[r.country] === g),
    })).filter((s) => s.rows.length > 0);
    return { allRows, groups };
  }, [rows]);

  /** 헤더 클릭 정렬 — 모든 섹션 테이블에 공통 적용 (미지정 시 최신 생성순), 동률은 최신 생성순 */
  const applySort = (arr: CampaignRow[]) => {
    if (!sort) return arr;
    const { key, dir } = sort;
    return [...arr].sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      const d = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      if (d) return d * dir;
      return b.campaign.createdAt.localeCompare(a.campaign.createdAt);
    });
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: NUMERIC_KEYS.includes(key) ? -1 : 1 }
    );

  if (!list) {
    return <div className="p-10 text-sm text-gray-400">불러오는 중…</div>;
  }

  const clearFilters = () => {
    setName("");
    setGroup("all");
    setCountry("all");
    setStatus("all");
  };

  const duplicate = (c: Campaign) => {
    const per: Campaign["perCountry"] = {};
    for (const cc of c.countries)
      per[cc] = { status: "scheduled", priority: null, sent: 0, views: 0, clicks: 0 };
    const copy: Campaign = {
      ...c,
      id: uid("c"),
      name: `${c.name} (copy)`,
      createdBy: "trixh",
      createdAt: fmtNow(),
      startType: "scheduled",
      startAt: undefined,
      endAt: undefined,
      perCountry: per,
    };
    persist([copy, ...list]);
    setToast("복제됨 — 통계 0 · 일정 비움 · Scheduled (저장 전 변경+이름 필요, C-02/03)");
  };

  const onStop = (c: Campaign, cc: string) => {
    persist(stopRow(list, c.id, cc));
    setToast(`Stop now — ${c.name} · ${cc} → Ended (back-dating 없음)`);
  };

  const onDelete = (c: Campaign, cc: string) => {
    const res = deleteRow(list, c.id, cc);
    if (res.error) return setToast("⚠ " + res.error);
    persist(res.list);
    setToast(`소프트 삭제 — ${c.name} · ${cc} (Deleted 필터에서 복구 가능)`);
  };

  const onRestore = (c: Campaign, cc: string) => {
    persist(restoreRow(list, c.id, cc));
    setToast(`복구됨 — ${c.name} · ${cc} → Ended`);
  };

  const previewItems = carouselOrder(list, previewCountry).map((c) => ({
    name: c.name,
    bannerImage: c.bannerImage,
    poster: c.poster,
    tapType: c.tapType,
    tapMenu: c.tapMenu,
    tapUrl: c.tapUrl,
  }));

  const head = (
    <thead>
      <tr>
        <th>Priority</th>
        <th>Campaign</th>
        <SortTh k="country" sort={sort} onToggle={toggleSort}>Country</SortTh>
        <th>Created by</th>
        <SortTh k="createdAt" sort={sort} onToggle={toggleSort}>Created at</SortTh>
        <SortTh k="status" sort={sort} onToggle={toggleSort}>Status</SortTh>
        <SortTh k="start" sort={sort} onToggle={toggleSort}>Start</SortTh>
        <SortTh k="end" sort={sort} onToggle={toggleSort}>End</SortTh>
        <SortTh k="sent" sort={sort} onToggle={toggleSort} num>Sent</SortTh>
        <SortTh k="views" sort={sort} onToggle={toggleSort} num>Views</SortTh>
        <SortTh k="clicks" sort={sort} onToggle={toggleSort} num>Clicks</SortTh>
        <SortTh k="ctr" sort={sort} onToggle={toggleSort} num>CTR</SortTh>
        <th>Actions</th>
      </tr>
    </thead>
  );

  const renderRow = (r: CampaignRow) => {
    const c = r.campaign;
    const ctr = r.views ? ((r.clicks / r.views) * 100).toFixed(2) + "%" : "—";
    return (
      <tr key={c.id + r.country}>
        <td>
          {r.status === "live" ? (
            <Link
              href={`/priority?country=${encodeURIComponent(r.country)}`}
              title={`${r.country} 노출 순서 관리에서 변경 (위에서부터 1..N 자동 부여)`}
              className={
                "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[12px] font-bold " +
                (r.priority === 1 ? "bg-[#c8102e] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")
              }
            >
              {r.priority ?? "—"}
            </Link>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="font-semibold text-gray-800">{c.name}</td>
        <td>{r.country}</td>
        <td className="text-gray-600">{c.createdBy}</td>
        <td className="text-gray-600">{c.createdAt}</td>
        <td><StatusBadge s={r.status} /></td>
        <td className="text-gray-600">{c.startType === "immediate" && r.status === "live" ? c.startAt : c.startAt ?? "—"}</td>
        <td className="text-gray-600">{c.endAt ?? "—"}</td>
        <td className="num">{r.sent ? r.sent.toLocaleString() : "—"}</td>
        <td className="num">{r.views ? r.views.toLocaleString() : "—"}</td>
        <td className="num">{r.clicks ? r.clicks.toLocaleString() : "—"}</td>
        <td className="num">{ctr}</td>
        <td>
          <div className="flex gap-1">
            {r.status === "deleted" ? (
              <button className="btn btn-outline btn-xs" onClick={() => onRestore(c, r.country)}>Restore</button>
            ) : (
              <>
                <button className="btn btn-outline btn-xs" onClick={() => setToast(`Modify — ${c.name} (프로토타입)`)}>Modify</button>
                <button className="btn btn-outline btn-xs" onClick={() => duplicate(c)}>Duplicate</button>
                {r.status === "live" ? (
                  <button className="btn btn-amber btn-xs" onClick={() => onStop(c, r.country)}>Stop now</button>
                ) : (
                  <button className="btn btn-xs" style={{ background: "#dc2626", color: "#fff" }} onClick={() => onDelete(c, r.country)}>Delete</button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  /** 보드와 같은 룩의 섹션: 제목 + 카운트 + 구분선, 그 아래 정렬 가능한 테이블 */
  const renderSection = (title: string, sectionRows: CampaignRow[], key: string) => {
    const live = sectionRows.filter((r) => r.status === "live").length;
    return (
      <section key={key} className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[13px] font-extrabold tracking-wide text-gray-700">{title}</h2>
          <span className="text-[11px] text-gray-400">Live {live}건 · 총 {sectionRows.length}건</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="dtable">
            {head}
            <tbody>{applySort(sectionRows).map(renderRow)}</tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* breadcrumb + tabs */}
      <div className="mb-2 text-[12px] text-gray-500">
        Home / Other Services / Campaign / Master History For Campaign /{" "}
        <span className="font-semibold text-gray-700">In-App Message History</span>
      </div>
      <PageTabs />

      {/* filter bar */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="field-label">Campaign Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="캠페인명 검색" />
          </div>
          <div>
            <label className="field-label">Group</label>
            <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">Select Country Group</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Country</label>
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">All</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All" : STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Start Date</label>
            <input className="input" type="date" />
          </div>
          <div>
            <label className="field-label">End Date</label>
            <input className="input" type="date" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-red" onClick={() => setToast("필터 적용됨")}>Filter</button>
          <button className="btn btn-outline" onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      {/* action row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/campaigns/new" className="btn btn-red">+ New campaign</Link>
        <Link href="/priority" className="btn btn-outline">🎯 노출 순서 관리</Link>
        <Link href="/test-sends" className="btn btn-outline">Test Sends log</Link>
        <button className="btn btn-outline" onClick={() => setPreviewOpen(true)}>📱 모바일 미리보기(캐러셀)</button>
        <button
          className="btn btn-ghost"
          onClick={() => { const s = resetCampaigns(); setList(s); setToast("시드 데이터로 초기화"); }}
        >
          ↺ 시드 초기화
        </button>
        <span className="ml-auto text-[12px] text-gray-400">10 per page</span>
      </div>

      <div className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-600">
        <b className="text-green-700">{counts.live} live</b> · {counts.scheduled} scheduled · {counts.ended} ended
      </div>

      {/* 섹션별 테이블: 🌍 전체 국가 → corridor 그룹 (보드와 동일 구조) */}
      {rows.length === 0 ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
          조건에 맞는 캠페인이 없습니다.
        </div>
      ) : (
        <>
          {sections.allRows.length > 0 &&
            renderSection("🌍 전체 국가 (All Countries)", sections.allRows, "All")}
          {sections.groups.map((s) => renderSection(s.group, s.rows, s.group))}
        </>
      )}

      {/* carousel preview overlay */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">모바일 캐러셀 미리보기</h3>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setPreviewOpen(false)}>✕</button>
            </div>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[12px] text-gray-500">국가</span>
              <select className="select !w-auto" value={previewCountry} onChange={(e) => setPreviewCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c} ({liveCount(list, c)} live)</option>
                ))}
              </select>
            </div>
            {previewItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">{previewCountry}에 Live 캠페인이 없습니다.</p>
            ) : (
              <MobilePreview items={previewItems} autoAdvance width={260} />
            )}
            <p className="mt-3 text-[11px] text-gray-400">
              우선순위 순서(수동 숫자 → Auto 최신순)로 자동 슬라이드됩니다. 좌우 화살표·스와이프로 이동, Close/오늘 안 보기 동작을 확인하세요.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/** 클릭 정렬 헤더: 첫 클릭 = 기본 방향(지표는 내림차순), 재클릭 = 반전 */
function SortTh({
  k,
  sort,
  onToggle,
  num,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  onToggle: (k: SortKey) => void;
  num?: boolean;
  children: React.ReactNode;
}) {
  const active = sort?.key === k;
  return (
    <th
      className={(num ? "num " : "") + "cursor-pointer select-none hover:!bg-gray-200"}
      title="클릭하여 정렬 (재클릭 시 반전)"
      onClick={() => onToggle(k)}
    >
      {children}
      <span className={"ml-0.5 text-[10px] " + (active ? "text-[#c8102e]" : "text-gray-400")}>
        {active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const cls =
    s === "live" ? "badge badge-live" : s === "scheduled" ? "badge badge-scheduled" : s === "ended" ? "badge badge-ended" : "badge badge-deleted";
  return <span className={cls}>{STATUS_LABEL[s]}</span>;
}
