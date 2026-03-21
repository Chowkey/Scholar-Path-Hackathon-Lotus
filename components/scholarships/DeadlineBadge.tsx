import { differenceInDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/Badge";

type DeadlineBadgeProps = {
  deadline: string;
};

export function DeadlineBadge({ deadline }: DeadlineBadgeProps) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return <Badge color="neutral">{deadline || "Check site"}</Badge>;
  }

  const parsed = parseISO(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return <Badge color="neutral">Check site</Badge>;
  }

  const daysLeft = differenceInDays(parsed, new Date());

  if (daysLeft < 0) {
    return <Badge color="neutral">Closed</Badge>;
  }

  if (daysLeft < 30) {
    return <Badge color="red">{daysLeft} days</Badge>;
  }

  if (daysLeft < 90) {
    return <Badge color="amber">{daysLeft} days</Badge>;
  }

  return <Badge color="green">{format(parsed, "MMM yyyy")}</Badge>;
}
