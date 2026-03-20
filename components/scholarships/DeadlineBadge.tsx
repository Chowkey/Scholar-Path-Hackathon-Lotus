import { differenceInDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/Badge";

type DeadlineBadgeProps = {
  deadline: string;
};

export function DeadlineBadge({ deadline }: DeadlineBadgeProps) {
  const parsed = parseISO(deadline);
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
