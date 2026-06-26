"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  claimedBy?: Map<string, string>; // vpa → agent name
}

export default function UpiMultiSelect({ options, selected, onChange, claimedBy }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter(
    (vpa) =>
      vpa.toLowerCase().includes(query.toLowerCase()) && !selected.includes(vpa)
  );

  function add(vpa: string) {
    onChange([...selected, vpa]);
    setQuery("");
  }

  function remove(vpa: string) {
    onChange(selected.filter((v) => v !== vpa));
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((vpa) => (
            <span
              key={vpa}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-mono px-2 py-1 rounded-full"
            >
              {vpa}
              <button
                type="button"
                onClick={() => remove(vpa)}
                className="text-blue-500 hover:text-blue-800 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div
        className="flex items-center border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 bg-white cursor-text"
        onClick={() => setOpen(true)}
      >
        <svg className="w-4 h-4 text-gray-400 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? "Search to add more…" : "Search UPI IDs…"}
          className="flex-1 outline-none text-sm text-gray-900 bg-transparent placeholder-gray-400"
        />
        {query && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setQuery(""); }}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1"
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">
              {query ? `No results for "${query}"` : options.length === selected.length ? "All UPI IDs selected" : "No UPI IDs available"}
            </div>
          ) : (
            filtered.map((vpa) => {
              const owner = claimedBy?.get(vpa);
              return (
                <button
                  key={vpa}
                  type="button"
                  onClick={() => add(vpa)}
                  className="w-full text-left flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 group"
                >
                  <span className="font-mono text-sm text-gray-800 group-hover:text-blue-700">
                    {vpa}
                  </span>
                  {owner ? (
                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0 ml-2">
                      {owner}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                      + add
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
