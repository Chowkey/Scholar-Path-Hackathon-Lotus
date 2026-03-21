/**
 * Utility functions for fetching and managing acceptance rates
 * for universities/schools using server-side Exa web search
 */

interface AcceptanceRateData {
  schoolName: string;
  acceptanceRate: number | null;
  source?: string;
}

/**
 * Fetches the acceptance rate for a given school via server API
 * @param schoolName - Full school name (e.g., 'Harvard University')
 * @returns The school name and acceptance rate (as decimal, e.g., 0.04 for 4%)
 */
export async function fetchAcceptanceRate(
  schoolName: string
): Promise<AcceptanceRateData> {
  try {
    const response = await fetch("/api/acceptance-rate-exa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolName }),
    });

    if (!response.ok) {
      console.warn(`Failed to fetch acceptance rate for ${schoolName}`);
      return {
        schoolName,
        acceptanceRate: null,
      };
    }

    const data = (await response.json()) as AcceptanceRateData;
    return data;
  } catch (error) {
    console.error(`Error fetching acceptance rate for ${schoolName}:`, error);
    return {
      schoolName,
      acceptanceRate: null,
    };
  }
}

/**
 * Fetches acceptance rates for multiple schools in parallel
 * @param schoolNames - Array of school names
 * @returns Promise resolving to an array of acceptance rate data
 */
export async function fetchAcceptanceRates(
  schoolNames: string[]
): Promise<AcceptanceRateData[]> {
  const promises = schoolNames.map((school) => fetchAcceptanceRate(school));
  return Promise.all(promises);
}

/**
 * Formats acceptance rate as a percentage string
 * @param acceptanceRate - Decimal value (e.g., 0.04)
 * @returns Formatted percentage (e.g., "4%")
 */
export function formatAcceptanceRate(acceptanceRate: number | null): string {
  if (acceptanceRate === null) return "Not available";
  return `${(acceptanceRate * 100).toFixed(1)}%`;
}

/**
 * Gets the competitiveness level based on acceptance rate
 * @param acceptanceRate - Decimal value (e.g., 0.04)
 * @returns Competitiveness label
 */
export function getCompetitivenessLevel(
  acceptanceRate: number | null
): "Very Selective" | "Highly Selective" | "Selective" | "Moderately Selective" | "Unknown" {
  if (acceptanceRate === null) return "Unknown";
  if (acceptanceRate <= 0.1) return "Very Selective";
  if (acceptanceRate <= 0.2) return "Highly Selective";
  if (acceptanceRate <= 0.35) return "Selective";
  return "Moderately Selective";
}
