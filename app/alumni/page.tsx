"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MapPin, GraduationCap, Briefcase, ExternalLink, CheckCircle2, AlertCircle, Users } from "lucide-react";

type Alumni = {
  name: string;
  profileUrl: string;
  university: string;
  recentMatching?: string | null;
  headline?: string | null;
  location?: string | null;
  graduation?: string | null;
  matchReasons: string[];
  confidence: "high" | "medium" | "low";
};

type SearchResult = {
  dreamUniversity: string;
  alumni: Alumni[];
};

export default function AlumniPage() {
  const [nationality, setNationality] = useState("");
  const [university, setUniversity] = useState("");
  const [field, setField] = useState("");
  const [currentSchool, setCurrentSchool] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!university) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dreamUniversity: university,
          fieldOfStudy: field,
          nationality: nationality,
          currentSchool: currentSchool,
          limit: 5,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch alumni.");
      }
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-neutral-900">Alumni Match</h1>
        <p className="mt-2 text-neutral-600">
          Find real alumni from your dream university with matching fields and backgrounds to connect with.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Search Form */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8">
            <form onSubmit={handleSearch} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Dream University *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="e.g. Stanford University"
                    className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Field of Study
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400">
                    <Briefcase className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    placeholder="e.g. Computer Science"
                    className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Nationality / Region
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="e.g. Vietnam"
                    className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Current School (Optional)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={currentSchool}
                    onChange={(e) => setCurrentSchool(e.target.value)}
                    placeholder="e.g. Hanoi Amsterdam"
                    className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                {isLoading ? "Searching Web..." : "Find Alumni"}
              </Button>
            </form>
          </Card>
        </div>

        {/* Results Area */}
        <div className="space-y-6 lg:col-span-2">
          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Error finding alumni</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          )}

          {!result && !isLoading && !error && (
             <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 text-center">
              <div className="rounded-full bg-neutral-100 p-4 text-neutral-400">
                <Users className="h-8 w-8" />
              </div>
              <p className="mt-4 font-medium text-neutral-900">No search results yet.</p>
              <p className="mt-1 max-w-sm text-sm text-neutral-500">
                Fill out the form to the left to search the web for alumni from your dream university.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-neutral-900">
                Found {result.alumni.length} results for {result.dreamUniversity}
              </h2>
              
              {result.alumni.length === 0 && (
                <Card>
                  <p className="text-neutral-600">No concrete alumni matches were found. Try broadening your search terms.</p>
                </Card>
              )}

              {result.alumni.map((alumnus, idx) => (
                <Card key={idx} className="overflow-hidden p-0">
                  <div className="border-b border-neutral-100 bg-neutral-50 p-5 sm:flex sm:items-start sm:justify-between sm:gap-4">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-brand-700">
                        {alumnus.name}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-neutral-700">
                        {alumnus.headline}
                      </p>
                      {alumnus.location && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin className="h-3.5 w-3.5" />
                          {alumnus.location}
                        </p>
                      )}
                    </div>
                    
                    <a
                      href={alumnus.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 sm:mt-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Profile
                    </a>
                  </div>
                  
                  <div className="p-5">
                    <div className="mb-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Match Reasons
                      </h4>
                      <ul className="mt-2 space-y-1.5 pl-6 text-sm text-neutral-600">
                        {alumnus.matchReasons.map((reason, i) => (
                          <li key={i} className="list-disc leading-relaxed">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {alumnus.recentMatching && (
                      <div className="rounded-lg bg-warm-50 p-3 text-sm text-neutral-700">
                        <span className="font-semibold text-warm-700">Evidence: </span>
                        {alumnus.recentMatching}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


