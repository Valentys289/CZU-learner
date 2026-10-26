import type { SubjectCode } from "../types";

export function SubjectBadge({ code }: { code: SubjectCode }) {
  return <span className={`badge badge-${code}`}>{code}</span>;
}
