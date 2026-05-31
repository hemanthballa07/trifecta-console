interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "amber" | "red" | "emerald" | "blue";
}

const accentMap = {
  amber: "border-amber-500 text-amber-400",
  red: "border-red-500 text-red-400",
  emerald: "border-emerald-500 text-emerald-400",
  blue: "border-blue-500 text-blue-400",
};

export function KpiCard({ label, value, sub, accent = "blue" }: KpiCardProps) {
  return (
    <div className={`bg-slate-800 rounded-lg border-l-4 ${accentMap[accent]} p-5`}>
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accentMap[accent].split(" ")[1]}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}
