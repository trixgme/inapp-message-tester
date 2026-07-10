"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_MENUS, COUNTRIES, GROUPS, IMAGE_SPEC } from "@/lib/data";
import type { AudienceType, Campaign, StartType, TapType } from "@/lib/types";
import {
  addCampaign,
  addTestSend,
  estimateAudience,
  loadCampaigns,
  saveCampaigns,
  uid,
} from "@/lib/store";
import MobilePreview from "@/components/MobilePreview";

function fmtNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmtDT = (v: string) => (v ? v.replace("T", " ").slice(0, 16) : undefined);

export default function NewCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("segment");
  const [group, setGroup] = useState(GROUPS[0]);
  const [countries, setCountries] = useState<string[]>([]);
  const [addCountry, setAddCountry] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);

  const [bannerImage, setBannerImage] = useState<string | undefined>();
  const [bannerName, setBannerName] = useState<string>("");
  const [tapType, setTapType] = useState<TapType>("in_app_menu");
  const [tapMenu, setTapMenu] = useState(APP_MENUS[0]);
  const [tapUrl, setTapUrl] = useState("");

  const [startType, setStartType] = useState<StartType>("immediate");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const [testWallet, setTestWallet] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!name.trim()) m.push("캠페인 이름");
    if (audienceType === "segment") {
      if (!group) m.push("그룹(corridor)");
      if (countries.length === 0) m.push("국가(1개 이상)");
    }
    if (!bannerImage) m.push("배너 이미지");
    if (tapType === "external_url" && !tapUrl.trim()) m.push("외부 URL");
    if (startType === "scheduled" && !startAt) m.push("시작 일시");
    if (!endAt) m.push("종료 일시");
    return m;
  }, [name, audienceType, group, countries, bannerImage, tapType, tapUrl, startType, startAt, endAt]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500 * 1024) flash("⚠ 500KB 초과 — 실제 spec 확인 필요 (미리보기는 계속 진행)");
    const reader = new FileReader();
    reader.onload = () => {
      setBannerImage(reader.result as string);
      setBannerName(f.name);
    };
    reader.readAsDataURL(f);
  }

  function addCountryChip() {
    if (addCountry && !countries.includes(addCountry)) setCountries([...countries, addCountry]);
    setAddCountry("");
  }

  function sendTest() {
    if (!testWallet.trim()) return flash("지갑번호를 입력하세요");
    const ok = /^\d{4,}$/.test(testWallet.trim()); // 4자리 이상 숫자면 유효로 시뮬레이션
    if (!ok) return flash("❌ 지갑 검증 실패 — 유효한 지갑번호가 아닙니다 (레코드 미생성)");
    addTestSend({
      id: uid("t"),
      wallet: testWallet.trim(),
      campaignName: name || "(제목 없음)",
      bannerImage,
      status: "sent",
      sentAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    flash(`✅ 테스트 전송 완료 → 지갑 ${testWallet} · Test Sends log 기록 (24h 자동만료)`);
  }

  function onSave() {
    if (missing.length) return flash("필수 항목 누락: " + missing.join(", "));
    setReviewOpen(true);
  }

  function confirmSubmit() {
    const list = loadCampaigns();
    const cc = audienceType === "all" ? ["All"] : countries;
    const per: Campaign["perCountry"] = {};
    for (const c of cc)
      per[c] = {
        status: startType === "immediate" ? "live" : "scheduled",
        priority: null,
        sent: 0,
        views: 0,
        clicks: 0,
      };
    const campaign: Campaign = {
      id: uid("c"),
      name: name.trim(),
      audienceType,
      group: audienceType === "segment" ? group : undefined,
      countries: cc,
      bannerImage,
      tapType,
      tapMenu: tapType === "in_app_menu" ? tapMenu : undefined,
      tapUrl: tapType === "external_url" ? tapUrl.trim() : undefined,
      startType,
      startAt: startType === "immediate" ? fmtNow() : fmtDT(startAt),
      endAt: fmtDT(endAt),
      createdBy: "trixh",
      createdAt: fmtNow(),
      perCountry: per,
    };
    // Live 국가행은 해당 국가 노출 순서 맨 위(1번)로 진입, 기존 행은 자동으로 한 칸씩 밀림
    saveCampaigns(addCampaign(list, campaign));
    router.push("/");
  }

  const previewItem = {
    name: name || undefined,
    bannerImage,
    tapType,
    tapMenu,
    tapUrl,
  };

  const displayOrder =
    audienceType === "all"
      ? "모든 국가 캐러셀 맨 위(1번) 진입 — 이후 '노출 순서 관리'에서 국가별 위치 조정"
      : "해당 국가 캐러셀 맨 위(1번) 진입 — 이후 '노출 순서 관리'에서 드래그로 조정";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="mb-2 text-[12px] text-gray-500">
        Home / Other Services / In-App Message /{" "}
        <span className="font-semibold text-gray-700">New Campaign Setup</span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="btn btn-outline btn-xs">← Back to history</Link>
        <span className="text-[13px] text-gray-500">New campaign — blank</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* -------- form -------- */}
        <div className="flex flex-col gap-5">
          {/* 1. name */}
          <section className="section-card">
            <div className="section-title">1. Campaign name <span className="text-[#c8102e]">*</span></div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name or Internal Name" />
          </section>

          {/* 2. audience */}
          <section className="section-card">
            <div className="section-title">2. Audience <span className="text-[#c8102e]">*</span></div>
            <div className="flex flex-col gap-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="radio" checked={audienceType === "all"} onChange={() => setAudienceType("all")} />
                Show to all users
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={audienceType === "segment"} onChange={() => setAudienceType("segment")} />
                Show to particular segment(s)
              </label>
            </div>

            {audienceType === "segment" && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label req">Group (corridor)</label>
                  <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
                    {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label req">Country · one or more</label>
                  <div className="flex gap-2">
                    <select className="select" value={addCountry} onChange={(e) => setAddCountry(e.target.value)}>
                      <option value="">Select country…</option>
                      {COUNTRIES.filter((c) => !countries.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="btn btn-outline" onClick={addCountryChip} disabled={!addCountry}>추가</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {countries.map((c) => (
                      <span key={c} className="chip">
                        {c}
                        <button onClick={() => setCountries(countries.filter((x) => x !== c))}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="hint">Once live, 캠페인은 국가별 1행으로 표시되며 국가마다 독립적인 노출 순서(1~N)를 가집니다.</div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button className="btn btn-outline" onClick={() => setEstimate(estimateAudience(audienceType, countries))}>Preview audience</button>
              {estimate != null && (
                <span className="info-strip">
                  ↻ 실시간 추정 약 <b>{estimate.toLocaleString()}</b> 명 · 이후 가입자도 조건 충족 시 자동 포함 (저장 안 함)
                </span>
              )}
            </div>
          </section>

          {/* 3. message */}
          <section className="section-card">
            <div className="section-title">3. Message content <span className="text-[#c8102e]">*</span></div>
            <label className="field-label req">Banner image</label>
            <div className="flex items-center gap-3">
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>Choose file</button>
              <span className="text-[12px] text-gray-500">{bannerName || "No file chosen"}</span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} />
            </div>
            <div className="info-strip mt-2">Required: {IMAGE_SPEC} · <i>(실제 spec 확인 필요)</i></div>

            <div className="mt-4">
              <label className="field-label">When the banner is tapped</label>
              <div className="hint mb-2">Choose one. A banner can only lead to a single place.</div>
              <div className="flex flex-col gap-2 text-[13px]">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={tapType === "none"} onChange={() => setTapType("none")} />
                  Nothing — image is informational only
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={tapType === "in_app_menu"} onChange={() => setTapType("in_app_menu")} />
                  Open a menu / feature in the app
                </label>
                {tapType === "in_app_menu" && (
                  <select className="select ml-6 !w-64" value={tapMenu} onChange={(e) => setTapMenu(e.target.value)}>
                    {APP_MENUS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <label className="flex items-center gap-2">
                  <input type="radio" checked={tapType === "external_url"} onChange={() => setTapType("external_url")} />
                  Open an external link in the browser
                </label>
                {tapType === "external_url" && (
                  <input className="input ml-6 !w-[calc(100%-1.5rem)]" value={tapUrl} onChange={(e) => setTapUrl(e.target.value)} placeholder="https://" />
                )}
              </div>
            </div>
          </section>

          {/* 4. schedule */}
          <section className="section-card">
            <div className="section-title">4. Schedule <span className="text-[#c8102e]">*</span></div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="field-label">Start showing</label>
                <div className="flex flex-col gap-2 text-[13px]">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={startType === "immediate"} onChange={() => setStartType("immediate")} />
                    Immediately
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={startType === "scheduled"} onChange={() => setStartType("scheduled")} />
                    Specific date &amp; time
                  </label>
                  {startType === "scheduled" && (
                    <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                  )}
                </div>
              </div>
              <div>
                <label className="field-label req">Stop showing</label>
                <input className="input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                <div className="hint">Required. Every campaign has a real end date &amp; time. (숨겨진 먼 미래 기본값 없음)</div>
              </div>
            </div>
            <div className="info-strip mt-3">
              즉시 시작이면 <b>Live</b>, 특정일이면 <b>Scheduled</b>. 조기 종료는 목록의 <b>Stop now</b> 사용 — never by back-dating.
            </div>
          </section>

          {/* 5. test */}
          <section className="section-card">
            <div className="section-title">5. Test this campaign</div>
            <div className="hint mb-2">이미지·설정을 먼저 마친 뒤 테스트로 팝업 렌더링을 확인하세요.</div>
            <div className="flex items-center gap-2">
              <input className="input !w-52" value={testWallet} onChange={(e) => setTestWallet(e.target.value)} placeholder="지갑번호 (예: 9452)" />
              <button className="btn btn-outline" onClick={sendTest}>Send test</button>
            </div>
            <div className="hint mt-2">이 계정에만 전송 · 실제 대상 영향 없음 · Test Sends log에 기록(24h 자동만료) · 캠페인 이력 미생성.</div>
          </section>

          {/* save */}
          <div className="flex items-center gap-3">
            <button className="btn btn-red" onClick={onSave}>Save</button>
            {missing.length > 0 && (
              <span className="text-[12px] text-gray-400">누락: {missing.join(", ")}</span>
            )}
          </div>
        </div>

        {/* -------- live preview -------- */}
        <div>
          <div className="sticky top-4">
            <div className="mb-2 text-[12px] font-semibold text-gray-600">Live preview</div>
            <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
              <MobilePreview items={[previewItem]} width={248} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              입력하는 대로 모바일 팝업이 실시간으로 갱신됩니다. 배너를 탭하면 설정한 이동 동작을,
              하단 버튼으로 <b>Close</b> / <b>오늘 안 보기</b> 동작을 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {/* review modal */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-bold text-gray-800">Review campaign before submitting</h3>
            <dl className="divide-y divide-gray-100 text-[13px]">
              <Row k="Campaign name" v={name} />
              <Row k="Audience" v={audienceType === "all" ? "All users" : `${group} · ${countries.join(", ")}`} />
              <Row k="Banner tap" v={tapType === "none" ? "Nothing (informational)" : tapType === "in_app_menu" ? `앱 메뉴: ${tapMenu}` : `외부 URL: ${tapUrl}`} />
              <Row k="Display order" v={displayOrder} />
              <Row k="Start showing" v={startType === "immediate" ? "Immediately" : fmtDT(startAt) || "—"} />
              <Row k="Stop showing" v={fmtDT(endAt) || "—"} />
            </dl>
            <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-[12px] text-green-700">
              On submit, this campaign will be{" "}
              <b>{startType === "immediate" ? "LIVE immediately" : "SCHEDULED"}</b> — determined by the Start showing option.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setReviewOpen(false)}>Back / Edit</button>
              <button className="btn btn-red" onClick={confirmSubmit}>Confirm &amp; Submit</button>
            </div>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-gray-500">{k}</dt>
      <dd className="font-medium text-gray-800">{v || "—"}</dd>
    </div>
  );
}
