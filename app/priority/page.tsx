"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COUNTRIES, COUNTRY_GROUP, GROUPS } from "@/lib/data";
import type { Campaign } from "@/lib/types";
import {
  carouselOrder,
  isGlobalCampaign,
  liveCount,
  loadCampaigns,
  reorderCountry,
  saveCampaigns,
  sectionOrder,
} from "@/lib/store";
import MobilePreview from "@/components/MobilePreview";
import PageTabs from "@/components/PageTabs";

/**
 * 국가별 노출 순서(Display Order) 보드.
 * 각 국가 카드는 국가 배너 + 🌍 전체 국가 배너를 하나의 통합 목록으로 보여주고,
 * 전체 국가 배너의 위치도 국가마다 자유롭게 드래그할 수 있다 (allPriority[국가]).
 * 맨 위 🌍 섹션은 전체 국가 배너들 "간의" 상대 순서를 바꿔 전 국가에 일괄 반영한다.
 * 어느 쪽이든 위에서부터 1..N이 자동 부여·즉시 저장된다.
 */

// 그룹에 매핑된 국가가 없는 corridor(예: Western)는 보드에 표시하지 않는다
const GROUP_SECTIONS = GROUPS.map((g) => ({
  group: g,
  countries: COUNTRIES.filter((c) => COUNTRY_GROUP[c] === g),
})).filter((s) => s.countries.length > 0);

const scrollToSection = (key: string) =>
  document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

export default function PriorityBoardPage() {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [selected, setSelected] = useState<string>("Cambodia");
  const [toast, setToast] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ section: string; id: string } | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const focusRef = useRef<string | null>(null); // ?country= 진입 시 스크롤 대상

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("country");
    if (q && (q === "All" || COUNTRIES.includes(q))) {
      if (COUNTRIES.includes(q)) setSelected(q);
      focusRef.current = q;
    }
    setList(loadCampaigns());
  }, []);

  // 목록 화면의 Priority 배지로 진입한 경우 해당 섹션 카드로 스크롤
  useEffect(() => {
    if (!list || !focusRef.current) return;
    scrollToSection(focusRef.current);
    focusRef.current = null;
  }, [list]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!list) {
    return <div className="p-10 text-sm text-gray-400">불러오는 중…</div>;
  }

  const persist = (next: Campaign[]) => {
    setList(next);
    saveCampaigns(next);
  };

  const cancelDrag = () => {
    setDrag(null);
    setOverIdx(null);
  };

  /** 섹션의 현재 순서: "All" = 전체 국가 배너 상대 순서, 국가 = 통합 캐러셀 순서 */
  const rowsOf = (section: string) =>
    section === "All" ? sectionOrder(list, "All") : carouselOrder(list, section);

  const savedToast = (section: string, pos: number, n: number) =>
    section === "All"
      ? `전체 국가 배너 상대 순서 변경 — ${pos}번 (전 국가 캐러셀에 일괄 반영)`
      : `노출 순서 저장됨 — ${section}: ${pos}번 위치로 이동 (1~${n} 자동 재부여)`;

  /** 드롭 확정: 섹션 내 재배열 */
  const dropOn = (section: string) => {
    if (!drag || drag.section !== section || overIdx == null) return cancelDrag();
    const ids = rowsOf(section).map((c) => c.id);
    const from = ids.indexOf(drag.id);
    if (from < 0) return cancelDrag();
    const to = overIdx > from ? overIdx - 1 : overIdx; // 제거 후 삽입 인덱스 보정
    if (to === from) return cancelDrag();
    ids.splice(from, 1);
    ids.splice(to, 0, drag.id);
    persist(reorderCountry(list, section, ids));
    setToast(savedToast(section, to + 1, ids.length));
    cancelDrag();
  };

  const move = (section: string, id: string, delta: number) => {
    const ids = rowsOf(section).map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    persist(reorderCountry(list, section, ids));
    setToast(savedToast(section, j + 1, ids.length));
  };

  const globals = sectionOrder(list, "All");
  const globalScheduled = scheduledOf(list, "All");
  const liveCampaignCount = list.filter((c) =>
    Object.values(c.perCountry).some((s) => s.status === "live")
  ).length;
  const previewLive = carouselOrder(list, selected);
  const previewItems = previewLive.map((c) => ({
    name: c.name,
    bannerImage: c.bannerImage,
    poster: c.poster,
    tapType: c.tapType,
    tapMenu: c.tapMenu,
    tapUrl: c.tapUrl,
  }));

  /** 섹션 공용: 드래그 가능한 Live 행 목록 (위 = 1 = 먼저) */
  const renderSortable = (section: string, rows: Campaign[]) => {
    const dragHere = drag?.section === section;
    return (
      <div
        className="border-t border-gray-100 pb-1"
        onDragOver={(e) => {
          if (dragHere) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          dropOn(section);
        }}
      >
        {rows.map((c, i) => {
          const isDragging = drag?.id === c.id && dragHere;
          return (
            <div key={c.id}>
              {dragHere && overIdx === i && <DropLine />}
              <div
                draggable={rows.length > 1}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.id);
                  setDrag({ section, id: c.id });
                }}
                onDragEnd={cancelDrag}
                onDragOver={(e) => {
                  if (!dragHere) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setOverIdx(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                className={
                  "flex select-none items-center gap-2.5 px-3 py-2 " +
                  (rows.length > 1 ? "cursor-grab active:cursor-grabbing " : "") +
                  (isDragging ? "opacity-40" : "hover:bg-gray-50")
                }
              >
                <span
                  className={
                    "w-[14px] text-center text-[13px] leading-none " +
                    (rows.length > 1 ? "text-gray-300" : "text-gray-200")
                  }
                >
                  ⠿
                </span>
                <PosBadge n={i + 1} first={i === 0} />
                <Thumb c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-gray-800">{c.name}</span>
                    {isGlobalCampaign(c) ? (
                      <span
                        className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-600"
                        title={
                          section === "All"
                            ? "모든 국가 캐러셀에 노출됩니다. 국가별 위치는 각 국가 카드에서 조정하세요."
                            : "전체 국가 배너 — 이 국가에서의 위치입니다. 배너 간 상대 순서는 상단 🌍 섹션에서 일괄 조정됩니다."
                        }
                      >
                        🌍 전체 국가
                      </span>
                    ) : (
                      c.countries.length > 1 && (
                        <span
                          className="shrink-0 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-500"
                          title="여러 국가에 노출되는 캠페인입니다. 순서는 국가별로 독립 적용됩니다."
                        >
                          {c.countries.length}개국 공용
                        </span>
                      )
                    )}
                  </div>
                  <div className="truncate text-[11px] text-gray-400">
                    {c.createdBy} · {c.createdAt}
                    {c.endAt ? ` · ~${c.endAt}` : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <button
                    aria-label="위로"
                    disabled={i === 0}
                    onClick={() => move(section, c.id, -1)}
                    className="grid h-4 w-5 place-items-center rounded border border-gray-200 text-[9px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    aria-label="아래로"
                    disabled={i === rows.length - 1}
                    onClick={() => move(section, c.id, 1)}
                    className="grid h-4 w-5 place-items-center rounded border border-gray-200 text-[9px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {dragHere && overIdx === rows.length && <DropLine />}
        {/* 맨 아래로 드롭하기 위한 여백 존 */}
        <div
          className="h-1.5"
          onDragOver={(e) => {
            if (!dragHere) return;
            e.preventDefault();
            setOverIdx(rows.length);
          }}
        />
      </div>
    );
  };

  const renderScheduled = (rows: Campaign[], enterNote: string) =>
    rows.length > 0 && (
      <div className="border-t border-dashed border-gray-200 bg-gray-50/70 px-3 py-1.5">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5 py-1 opacity-75">
            <span className="w-[14px]" />
            <span className="badge badge-scheduled">대기</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-gray-600">{c.name}</div>
              <div className="text-[10px] text-gray-400">
                {c.startAt ? `${c.startAt} 시작 예정` : "시작 예정"} · {enterNote}
              </div>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="mb-2 text-[12px] text-gray-500">
        Home / Other Services / Campaign / In-App Message History /{" "}
        <span className="font-semibold text-gray-700">Display Order</span>
      </div>
      <PageTabs />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href="/" className="btn btn-outline btn-xs">← Back to history</Link>
        <h1 className="text-[15px] font-extrabold text-gray-800">국가별 노출 순서 (Display Order)</h1>
        <span className="ml-auto text-[12px] text-gray-400">Live 캠페인 {liveCampaignCount}개</span>
      </div>
      <div className="info-strip mt-3">
        <b>위에 있을수록 먼저 노출</b>됩니다. 각 국가 카드는 국가 배너와 <b>🌍 전체 국가 배너를 하나의
        목록</b>으로 보여주며, 전체 국가 배너의 위치도 <b>국가마다 자유롭게</b> 드래그할 수 있습니다. 맨 위
        🌍 섹션에서는 전체 국가 배너들 <b>간의</b> 상대 순서를 바꿔 전 국가에 일괄 반영합니다. 순서는 즉시
        저장되고, 새로 Live되는 캠페인은 맨 위(1번)로 진입합니다.
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* -------- 보드 -------- */}
        <div className="flex flex-col gap-6">
          {/* 🌍 전체 국가 섹션 — 배너 간 상대 순서 (전 국가 일괄 반영) */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[13px] font-extrabold tracking-wide text-gray-700">🌍 전체 국가 (All Countries)</h2>
              <span className="text-[11px] text-gray-400">배너 간 상대 순서 · 전 국가 일괄 반영</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <div id="section-All" className="rounded-lg border border-gray-300 bg-white">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-[13px] font-bold text-gray-800">All Countries</span>
                {globals.length > 0 ? (
                  <span className="badge badge-live">Live {globals.length}</span>
                ) : (
                  <span className="text-[11px] text-gray-300">Live 없음</span>
                )}
                {globalScheduled.length > 0 && (
                  <span className="badge badge-scheduled">Scheduled {globalScheduled.length}</span>
                )}
                <span className="ml-auto text-[11px] text-gray-400">
                  국가별 위치는 아래 각 국가 카드에서 조정
                </span>
              </div>
              {globals.length > 0 ? (
                renderSortable("All", globals)
              ) : (
                <p className="border-t border-gray-100 px-3 py-4 text-center text-[12px] text-gray-400">
                  전체 국가 Live 배너가 없습니다 — “Show to all users” 캠페인이 Live 되면 여기 표시됩니다.
                </p>
              )}
              {renderScheduled(globalScheduled, "Live 전환 시 모든 국가 맨 위(1번) 진입")}
            </div>
          </section>

          {/* 그룹 → 국가 섹션 */}
          {GROUP_SECTIONS.map(({ group, countries }) => {
            const groupLocal = countries.reduce((sum, c) => sum + sectionOrder(list, c).length, 0);
            return (
              <section key={group}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-[13px] font-extrabold tracking-wide text-gray-700">{group}</h2>
                  <span className="text-[11px] text-gray-400">
                    {countries.length}개국 · 국가 배너 {groupLocal}건
                  </span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>

                <div className="flex flex-col gap-3">
                  {countries.map((country) => {
                    const rows = carouselOrder(list, country); // 국가 배너 + 🌍 전체 국가 배너 통합
                    const scheduled = scheduledOf(list, country);
                    const isSel = selected === country;

                    return (
                      <div
                        key={country}
                        id={`section-${country}`}
                        className={
                          "rounded-lg border bg-white transition-shadow " +
                          (isSel ? "border-[#c8102e]/40 ring-2 ring-[#c8102e]/10" : "border-gray-200")
                        }
                      >
                        {/* 국가 헤더 */}
                        <div
                          className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                          onClick={() => setSelected(country)}
                          title="클릭하면 우측 미리보기가 이 국가로 바뀝니다"
                        >
                          <span className="text-[13px] font-bold text-gray-800">{country}</span>
                          {rows.length > 0 ? (
                            <span className="badge badge-live">Live {rows.length}</span>
                          ) : (
                            <span className="text-[11px] text-gray-300">Live 없음</span>
                          )}
                          {scheduled.length > 0 && (
                            <span className="badge badge-scheduled">Scheduled {scheduled.length}</span>
                          )}
                          <span className="ml-auto flex items-center gap-1">
                            {isSel && <span className="text-[11px] font-semibold text-[#c8102e]">📱 미리보는 중</span>}
                          </span>
                        </div>

                        {/* 통합 목록: 국가 배너 + 전체 국가 배너 모두 드래그 가능 */}
                        {rows.length > 0 ? (
                          renderSortable(country, rows)
                        ) : (
                          scheduled.length === 0 && (
                            <p className="border-t border-gray-100 px-3 py-3 text-center text-[11px] text-gray-300">
                              Live 캠페인 없음
                            </p>
                          )
                        )}

                        {renderScheduled(scheduled, "Live 전환 시 이 국가 맨 위(1번) 진입")}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* -------- 실시간 미리보기 -------- */}
        <div>
          <div className="sticky top-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-gray-600">실시간 캐러셀 미리보기</span>
              <select
                className="select !w-auto !py-1 text-[12px]"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c} ({liveCount(list, c)} live)
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
              {previewItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-400">{selected}에 Live 캠페인이 없습니다.</p>
              ) : (
                <MobilePreview items={previewItems} autoAdvance width={240} />
              )}
            </div>
            {previewLive.length > 0 && (
              <ol className="mt-3 flex flex-col gap-1">
                {previewLive.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-2 text-[11px] text-gray-600">
                    <PosBadge n={i + 1} first={i === 0} small />
                    <span className="truncate">
                      {c.audienceType === "all" ? "🌍 " : ""}
                      {c.name}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              국가 카드의 통합 순서(🌍 전체 국가 배너 포함) 그대로 노출됩니다. 왼쪽에서 순서를 바꾸면 이 폰
              화면과 순서 목록이 즉시 갱신되고, 국가 카드를 클릭하면 미리보기 국가가 전환됩니다.
            </p>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/** 섹션의 Scheduled 대기열 (시작 예정 시각 순) */
function scheduledOf(list: Campaign[], section: string): Campaign[] {
  return list
    .filter((c) => c.perCountry[section]?.status === "scheduled")
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
}

/** 캐러셀 위치 번호 배지 — 1번(첫 노출)은 GME 레드 */
function PosBadge({ n, first, small }: { n: number; first: boolean; small?: boolean }) {
  return (
    <span
      className={
        "grid shrink-0 place-items-center rounded-md font-extrabold " +
        (small ? "h-5 w-5 text-[10px] " : "h-6 w-6 text-[12px] ") +
        (first ? "bg-[#c8102e] text-white" : "bg-gray-100 text-gray-600")
      }
    >
      {n}
    </span>
  );
}

/** 드롭 위치 표시선 */
function DropLine() {
  return <div className="mx-3 my-0.5 h-[3px] rounded-full bg-[#c8102e]" />;
}

/** 배너 미니 썸네일 (4:5) */
function Thumb({ c }: { c: Campaign }) {
  if (c.bannerImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.bannerImage} alt="" className="h-11 w-9 shrink-0 rounded border border-gray-200 object-cover" />;
  }
  if (c.poster) {
    return (
      <span
        className="block h-11 w-9 shrink-0 rounded border border-gray-200"
        style={{ backgroundImage: `linear-gradient(150deg, ${c.poster.from}, ${c.poster.to})` }}
      />
    );
  }
  return (
    <span className="grid h-11 w-9 shrink-0 place-items-center rounded border border-gray-200 bg-slate-100 text-[10px] text-slate-400">
      🖼
    </span>
  );
}
