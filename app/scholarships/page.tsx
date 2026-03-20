"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { FilterBar } from "@/components/scholarships/FilterBar";
import { ScholarshipCard } from "@/components/scholarships/ScholarshipCard";
import { SearchBar } from "@/components/scholarships/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { scholarships } from "@/lib/scholarships";

const regionOptions = ["All", "USA", "UK", "Europe", "Japan", "Australia", "Global"];
const degreeOptions = ["All", "Undergraduate", "Masters", "PhD"];
const fundingOptions = ["All", "Fully Funded", "Partial"];

export default function ScholarshipsPage() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("All");
  const [degree, setDegree] = useState("All");
  const [funding, setFunding] = useState("All");

  const filteredScholarships = useMemo(() => {
    return scholarships.filter((scholarship) => {
      const searchMatch =
        query.trim() === "" ||
        [scholarship.name, scholarship.country, scholarship.organization, ...scholarship.fields]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());

      const regionMatch =
        region === "All" ||
        scholarship.country === region ||
        (region === "Global" && scholarship.country === "Europe");

      const degreeMatch =
        degree === "All" ||
        scholarship.degree.includes(degree.toLowerCase() as "undergraduate" | "masters" | "phd");

      const fundingMatch =
        funding === "All" ||
        (funding === "Fully Funded" ? scholarship.funding === "full" : scholarship.funding === "partial");

      return searchMatch && regionMatch && degreeMatch && fundingMatch;
    });
  }, [degree, funding, query, region]);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="font-heading text-3xl font-bold text-neutral-900">
            Scholarship Directory
          </h1>
          <p className="mt-2 text-base leading-7 text-neutral-600">
            Curated for international students exploring study-abroad opportunities.
          </p>
        </div>

        <div className="sticky top-0 z-10 mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50/95 p-4 backdrop-blur">
          <SearchBar value={query} onChange={setQuery} />
          <FilterBar
            groups={[
              { label: "Region", value: region, options: regionOptions, onChange: setRegion },
              { label: "Degree", value: degree, options: degreeOptions, onChange: setDegree },
              { label: "Funding", value: funding, options: fundingOptions, onChange: setFunding },
            ]}
          />
        </div>

        {filteredScholarships.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={SearchX}
              title="No scholarships match those filters"
              subtitle="Try widening the region or degree filters, or search with a broader keyword."
            />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredScholarships.map((scholarship) => (
              <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
