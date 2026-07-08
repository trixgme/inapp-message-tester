"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TestSend } from "@/lib/types";
import { DAY_MS, deleteTestSend, loadTestSends } from "@/lib/store";

function remain(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "만료";
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${h}시간 ${m}분 남음`;
}

export default function TestSendsPage() {
  const [list, setList] = useState<TestSend[] | null>(null);

  useEffect(() => {
    setList(loadTestSends());
    const t = setInterval(() => setList(loadTestSends()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!list) return <div className="p-10 text-sm text-gray-400">불러오는 중…</div>;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-4">
      <div className="mb-2 text-[12px] text-gray-500">
        Home / Other Services / In-App Message /{" "}
        <span className="font-semibold text-gray-700">Test Sends log</span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="btn btn-outline btn-xs">← Back to history</Link>
        <h1 className="text-lg font-bold text-gray-800">Test Sends log</h1>
      </div>

      <div className="info-strip mb-4">
        실제 캠페인 리스트와 <b>완전 별도 관리</b>됩니다. 각 테스트는 전송 24시간 후 자동 만료되며, 아래에서 즉시 삭제도 가능합니다. 캠페인 이력·통계에는 기록되지 않습니다.
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="dtable">
          <thead>
            <tr>
              <th>배너</th><th>Campaign</th><th>Wallet</th><th>Status</th><th>Sent at</th><th>만료까지</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">테스트 발송 기록이 없습니다. New Campaign의 “5. Test this campaign”에서 Send test 해보세요.</td></tr>
            )}
            {list.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.bannerImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.bannerImage} alt="" className="h-10 w-8 rounded object-cover" />
                  ) : (
                    <span className="inline-flex h-10 w-8 items-center justify-center rounded bg-slate-100 text-slate-400">🖼️</span>
                  )}
                </td>
                <td className="font-semibold text-gray-800">{t.campaignName}</td>
                <td>{t.wallet}</td>
                <td><span className="badge badge-live">sent</span></td>
                <td className="text-gray-600">{new Date(t.sentAt).toLocaleString("ko-KR")}</td>
                <td className="text-gray-600">{remain(t.expiresAt)}</td>
                <td>
                  <button
                    className="btn btn-xs"
                    style={{ background: "#dc2626", color: "#fff" }}
                    onClick={() => setList(deleteTestSend(t.id))}
                  >
                    Delete now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-gray-400">TTL {DAY_MS / (60 * 60 * 1000)}시간 · 페이지를 열 때 만료분은 자동 제거됩니다.</p>
    </div>
  );
}
