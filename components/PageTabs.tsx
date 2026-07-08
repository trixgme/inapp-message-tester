const TABS = [
  "In-App Message History",
  "Push Notification History",
  "SMS History",
  "Email History",
  "Marketing Promotion History",
  "Birthday Coupon Report",
];

export default function PageTabs() {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((t, i) => (
        <span
          key={t}
          className={
            i === 0
              ? "rounded-t-md border border-b-white border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-800"
              : "cursor-default rounded-t-md bg-slate-600 px-3 py-2 text-[12px] font-medium text-white/90"
          }
        >
          {t}
        </span>
      ))}
    </div>
  );
}
