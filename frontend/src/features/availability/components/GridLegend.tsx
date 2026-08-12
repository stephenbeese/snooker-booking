const ITEMS = [
  { label: 'Available', className: 'bg-felt-100' },
  { label: 'Selected', className: 'bg-felt-700' },
  { label: "Doesn't fit", className: 'bg-felt-50 border border-felt-100' },
  { label: 'Booked', className: 'bg-rose-100' },
  { label: 'Maintenance', className: 'bg-amber-100' },
  { label: 'Unavailable', className: 'bg-gray-100' },
];

export function GridLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-3 rounded ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
