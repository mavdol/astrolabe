import { RULES } from "./registry.generated.js";

export interface Rule {
  id: string;
  level: "must" | "should";
  /** The instruction to the agent. */
  text: string;
  pitfall: string;
  /** Schema field or check that proves the rule. */
  field: string;
  /** File of the skill that explains the rule. */
  file: string;
}

const byId = new Map(RULES.map((r) => [r.id, r]));

export function rule(id: string): Rule | undefined {
  return byId.get(id.toUpperCase());
}

export function allRules(): Rule[] {
  return RULES;
}

export interface Issue {
  severity: "error" | "warning";
  /** Rule id, or "schema" when no rule covers the field. */
  rule: string;
  /** Path of the field to fix, e.g. results.metrics[0].unit */
  path: string;
  message: string;
}

/** One line per issue: severity, rule id, field, message and the skill file that explains it. */
export function formatIssue(i: Issue): string {
  const r = rule(i.rule);
  const where = r ? ` (see ${r.file})` : "";

  return `${i.severity} ${i.rule} ${i.path}: ${i.message}${where}`;
}
