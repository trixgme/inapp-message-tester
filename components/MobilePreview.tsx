"use client";

import { useEffect, useRef, useState } from "react";
import type { Poster, TapType } from "@/lib/types";

export interface PreviewItem {
  name?: string;
  bannerImage?: string;
  poster?: Poster;
  tapType?: TapType;
  tapMenu?: string;
  tapUrl?: string;
}

interface Props {
  items: PreviewItem[];
  autoAdvance?: boolean;
  /** 폰 프레임 폭(px) */
  width?: number;
}

const DWELL = 3600;

export default function MobilePreview({ items, autoAdvance = false, width = 264 }: Props) {
  const list = items.length ? items : [{}];
  const [idx, setIdx] = useState(0);
  const [closed, setClosed] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

  const clampIdx = (n: number) => (n + list.length) % list.length;
  const go = (d: number) => setIdx((i) => clampIdx(i + d));

  // keep index valid when the item list changes
  useEffect(() => {
    setIdx((i) => (i >= list.length ? 0 : i));
  }, [list.length]);

  // auto-advance carousel
  useEffect(() => {
    if (!autoAdvance || list.length < 2 || closed || dontShow) return;
    const t = setInterval(() => setIdx((i) => clampIdx(i + 1)), DWELL);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, list.length, closed, dontShow]);

  // transient toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const cur = list[idx] ?? {};
  const phoneH = Math.round(width * 2.06);

  function bannerTap() {
    const type = cur.tapType ?? "none";
    if (type === "in_app_menu") setToast(`→ 앱 메뉴 이동: ${cur.tapMenu || "Home"}`);
    else if (type === "external_url")
      setToast(`→ 외부 브라우저: ${cur.tapUrl || "https://…"}`);
    else setToast("정보성 이미지 · 이동 없음");
  }

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startX.current == null || list.length < 2) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 28) go(dx < 0 ? 1 : -1);
    startX.current = null;
  }

  const reopen = () => {
    setClosed(false);
    setDontShow(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* phone */}
      <div
        className="relative rounded-[34px] border-[10px] border-gray-900 bg-gray-800 shadow-2xl"
        style={{ width, height: phoneH }}
      >
        {/* notch */}
        <div className="absolute left-1/2 top-1 z-20 h-4 w-24 -translate-x-1/2 rounded-full bg-gray-900" />
        {/* app screen */}
        <div className="absolute inset-0 overflow-hidden rounded-[24px] bg-gray-100">
          {/* app top bar */}
          <div className="flex items-center justify-between bg-white px-3 py-2 text-[11px] text-gray-700 shadow-sm">
            <span className="font-semibold">☰ GME</span>
            <span className="flex items-center gap-2 text-amber-500">
              🔔 <span className="text-gray-400">⚙</span>
            </span>
          </div>

          {/* dimmed home behind modal */}
          <div className="relative h-full w-full bg-gray-500/60">
            {closed || dontShow ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[12px] font-medium text-white drop-shadow">
                  {dontShow
                    ? "오늘 하루 안 봄 · 내일 00:00 재노출"
                    : "닫힘 · 홈 재진입 시 다시 노출"}
                </p>
                <button
                  onClick={reopen}
                  className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-gray-700"
                >
                  ↺ 다시 열기
                </button>
              </div>
            ) : (
              // modal card
              <div className="absolute left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2 select-none">
                {/* story progress */}
                <div className="mb-1.5 flex gap-1 px-0.5">
                  {list.map((_, i) => (
                    <span
                      key={i}
                      className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/40"
                    >
                      <span
                        className="block h-full rounded-full bg-white"
                        style={{
                          width: i < idx ? "100%" : i === idx ? "100%" : "0%",
                          transition: i === idx ? `width ${DWELL}ms linear` : "none",
                        }}
                      />
                    </span>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
                  {/* banner (4:5) */}
                  <div
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    onClick={bannerTap}
                    className="relative flex cursor-pointer items-center justify-center"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    {cur.bannerImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cur.bannerImage}
                        alt="banner"
                        className="h-full w-full object-cover"
                      />
                    ) : cur.poster ? (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center gap-2 text-center"
                        style={{
                          backgroundImage: `linear-gradient(150deg, ${cur.poster.from}, ${cur.poster.to})`,
                        }}
                      >
                        <div className="whitespace-pre-line text-[19px] font-extrabold leading-tight text-white drop-shadow">
                          {cur.poster.title}
                        </div>
                        {cur.poster.subtitle && (
                          <div className="px-3 text-[10px] font-medium text-white/90">
                            {cur.poster.subtitle}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <span className="text-2xl">🖼️</span>
                        <span className="text-[10px]">배너 이미지 미리보기</span>
                        <span className="text-[9px] text-slate-400">1080 × 1350 (4:5)</span>
                      </div>
                    )}

                    {/* nav hint arrows for carousel */}
                    {list.length > 1 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            go(-1);
                          }}
                          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/25 px-1.5 text-white"
                          aria-label="prev"
                        >
                          ‹
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            go(1);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/25 px-1.5 text-white"
                          aria-label="next"
                        >
                          ›
                        </button>
                      </>
                    )}
                  </div>

                  {/* fixed 2-button bar (기획서 C-13) */}
                  <div className="grid grid-cols-2 border-t border-gray-200 text-[11px]">
                    <button
                      onClick={() => setDontShow(true)}
                      className="border-r border-gray-200 py-2 font-medium text-gray-500 hover:bg-gray-50"
                    >
                      Don&apos;t show for today
                    </button>
                    <button
                      onClick={() => setClosed(true)}
                      className="py-2 font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {toast && (
                  <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[10px] text-white">
                    {toast}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* meta under phone */}
      <div className="text-center text-[11px] text-gray-500">
        {list.length > 1 ? (
          <span>
            캐러셀 {idx + 1} / {list.length} · 자동전환 · 좌우 스와이프
          </span>
        ) : (
          <span>{cur.name ? `“${cur.name}”` : "실시간 미리보기"}</span>
        )}
      </div>
    </div>
  );
}
