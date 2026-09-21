type LeadInput = {
  companyMatch?: number;
  buyingPotential?: number;
  contactQuality?: number;
  contactability?: number;
  marketActivity?: number;
};

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

export type LeadGradeValue = "A" | "B" | "C" | "D";

export function scoreLead(input: Record<string, unknown>) {
  const data = input as LeadInput;

  const breakdown = {
    companyMatch: clamp(Number(data.companyMatch ?? 0), 30),
    buyingPotential: clamp(Number(data.buyingPotential ?? 0), 25),
    contactQuality: clamp(Number(data.contactQuality ?? 0), 20),
    contactability: clamp(Number(data.contactability ?? 0), 15),
    marketActivity: clamp(Number(data.marketActivity ?? 0), 10)
  };

  const score = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  const grade: LeadGradeValue = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";

  return { score, grade, breakdown };
}
