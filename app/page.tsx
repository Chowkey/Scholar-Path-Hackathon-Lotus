import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  Compass,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const featureCards = [
  {
    title: "AI Counselor",
    description:
      "Ask messy, real questions about documents, SOPs, timelines, and where to start. ScholarPath keeps narrowing the path with smarter follow-up questions.",
    icon: MessageCircle,
    href: "/counselor",
    cta: "Open Counselor",
  },
  {
    title: "Scholarship Match",
    description:
      "Browse and filter scholarships, then get grounded suggestions that align with your target country, degree level, and funding needs.",
    icon: BookOpen,
    href: "/scholarships",
    cta: "Explore Scholarships",
  },
  {
    title: "Profile Evaluator",
    description:
      "Check how competitive your profile is against specific scholarships and get a practical gap analysis instead of generic advice.",
    icon: BarChart2,
    href: "/evaluator",
    cta: "Check My Fit",
  },
  {
    title: "Alumni Discovery",
    description:
      "Find relevant alumni around your dream university and field so students can learn from real trajectories, not just official brochures.",
    icon: Users,
    href: "/alumni",
    cta: "Find Alumni",
  },
];

const highlights = [
  {
    title: "Clear next steps",
    text: "Clarifies the study-abroad process step by step.",
    tone: "from-brand-600 to-brand-700 text-white border-brand-400/40",
    icon: Compass,
  },
  {
    title: "Grounded matching",
    text: "Matches students to scholarships using structured data.",
    tone: "from-warm-500 to-orange-600 text-white border-orange-300/40",
    icon: BookOpen,
  },
  {
    title: "Real fit analysis",
    text: "Evaluates profile strength against real opportunities.",
    tone: "from-teal-500 to-emerald-600 text-white border-emerald-300/40",
    icon: BarChart2,
  },
  {
    title: "Human context",
    text: "Connects planning with alumni-based guidance.",
    tone: "from-white to-brand-50 text-neutral-900 border-white/80",
    icon: Users,
  },
];

const workflow = [
  {
    step: "01",
    title: "Start with confusion, not perfect inputs",
    text: "Students can begin with broad questions like what documents they need, whether IELTS is necessary, or which country might fit their goals.",
  },
  {
    step: "02",
    title: "Narrow the journey interactively",
    text: "The assistant keeps asking targeted follow-up questions until the student has enough clarity for meaningful guidance.",
  },
  {
    step: "03",
    title: "Turn answers into action",
    text: "ScholarPath translates that context into scholarship discovery, fit evaluation, and the next concrete steps to take.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_42%,_#fffaf5_100%)]">
      <section className="relative px-6 pb-16 pt-10 md:px-10 md:pt-14">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-4 py-2 text-sm font-medium text-brand-700 shadow-card backdrop-blur">
              <Sparkles className="h-4 w-4" />
              Study-abroad guidance, scholarship matching, and alumni discovery
            </div>

            <h1 className="mt-6 max-w-4xl font-heading text-5xl font-bold leading-[1.02] text-neutral-900 md:text-6xl">
              From &quot;I don&apos;t know where to start&quot; to a real study-abroad plan.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              ScholarPath is an AI study-abroad copilot that answers application questions,
              matches students to scholarships, evaluates their fit, and helps them learn from
              alumni pathways.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/counselor">
                <Button size="lg" className="whitespace-nowrap">
                  Talk to the Counselor
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/scholarships">
                <Button size="lg" variant="outline">
                  Explore Scholarships
                </Button>
              </Link>
            </div>

          </div>

          <div className="relative">
            <div className="absolute -left-8 top-10 hidden h-28 w-28 rounded-full bg-brand-100/70 blur-2xl md:block" />
            <div className="absolute -right-4 bottom-6 hidden h-32 w-32 rounded-full bg-warm-100/80 blur-2xl md:block" />
            <div className="absolute left-10 top-4 hidden rounded-full border border-brand-200/70 bg-white/85 px-4 py-2 text-sm font-medium text-brand-700 shadow-card md:block">
              Personalized journey mapping
            </div>

            <div className="relative rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_60px_-24px_rgba(30,58,95,0.28)] backdrop-blur">
              <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-gradient-to-br from-brand-50 via-white to-warm-50 p-2">
                <Image
                  src="/Illustration.png"
                  alt="ScholarPath landing page illustration"
                  width={1200}
                  height={900}
                  className="h-auto w-full rounded-[1.15rem] object-cover"
                  priority
                />
              </div>
            </div>

            <div className="absolute -bottom-4 left-6 hidden rounded-[1.4rem] border border-white/80 bg-white/92 px-4 py-3 shadow-[0_18px_40px_-28px_rgba(37,99,235,0.45)] md:block">
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">
                Core Flows
              </p>
              <h2 className="mt-3 font-heading text-3xl font-bold text-neutral-900">
                Four ways students move through ScholarPath
              </h2>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map(({ title, description, icon: Icon, href, cta }) => (
              <Card
                key={title}
                hoverable
                className="border-white/70 bg-white/90 shadow-[0_18px_40px_-28px_rgba(37,99,235,0.45)]"
              >
                <div className="w-fit rounded-2xl bg-gradient-to-br from-brand-50 to-warm-50 p-3 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-heading text-xl font-semibold text-neutral-900">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{description}</p>
                <Link
                  href={href}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 transition hover:text-brand-800"
                >
                  {cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 pt-8 md:px-10 md:pb-20">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-brand-100 bg-white/80 p-6 shadow-[0_20px_50px_-30px_rgba(30,58,95,0.35)] backdrop-blur md:p-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-warm-500">
              How It Works
            </p>
            <h2 className="mt-3 font-heading text-3xl font-bold text-neutral-900">
              Built for the moment students feel overwhelmed
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {workflow.map((item) => (
              <div
                key={item.step}
                className="rounded-[1.5rem] border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-5"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-500">
                  {item.step}
                </p>
                <h3 className="mt-4 font-heading text-xl font-semibold text-neutral-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] bg-neutral-900 px-6 py-5 text-white">
            <div>
              <p className="font-heading text-2xl font-semibold">Ready to turn exploration into action?</p>
              <p className="mt-1 text-sm text-neutral-300">
                Start with scholarships, test your fit, or talk to the counselor.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/scholarships">
                <Button size="lg">Browse Scholarships</Button>
              </Link>
              <Link href="/alumni">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                  Explore Alumni
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
