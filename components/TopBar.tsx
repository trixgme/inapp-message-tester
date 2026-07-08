import Link from "next/link";

const NAV = [
  "ADMINISTRATION",
  "SYSTEM SECURITY",
  "REMITTANCE",
  "ACCOUNT",
  "INBOUND",
  "OTHER SERVICES",
  "TRANSACTION",
  "EXCHANGE SETUP",
];

export default function TopBar() {
  return (
    <header className="w-full">
      {/* brand row */}
      <div className="bg-[#a20e26] text-white">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-4">
          <Link href="/" className="flex items-baseline gap-1 leading-none">
            <span className="text-lg font-extrabold tracking-tight">GME</span>
            <span className="text-[9px] font-semibold tracking-[0.2em] opacity-80">
              REMITTANCE
            </span>
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <span className="opacity-90">✉ 8</span>
            <span className="rounded-full bg-black/25 px-2 py-0.5">🔔 1900</span>
            <span className="font-semibold">👤 trixh</span>
            <span className="hidden rounded bg-white/95 px-2 py-1 text-[11px] text-gray-500 sm:inline">
              Type to Search…
            </span>
          </div>
        </div>
      </div>
      {/* nav row */}
      <div className="bg-[#c8102e] text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-[11px] font-semibold tracking-wide">
          {NAV.map((n) => (
            <span
              key={n}
              className={
                n === "OTHER SERVICES"
                  ? "cursor-default border-b-2 border-white pb-0.5"
                  : "cursor-default opacity-90 hover:opacity-100"
              }
            >
              {n} <span className="opacity-60">▾</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
