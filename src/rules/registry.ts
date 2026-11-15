import { z } from "zod";
import rulesFile from "./rules.json" with { type: "json" };

const ruleSchema = z.strictObject({
  id: z.string().regex(/^[A-Z]\d+$/),
  level: z.enum(["must", "should"]),
  /** The instruction to the agent. */
  text: z.string().min(1),
  pitfall: z.string().min(1).optional(),
  /** The schema field or the check of the tool that proves the rule was followed. */
  proved_by: z.string().min(1).optional(),
  /** The file of the skill that explains the rule. */
  explained_in: z.string().min(1),
});

export type Rule = z.infer<typeof ruleSchema>;

const RULES: Rule[] = z.array(ruleSchema).parse(rulesFile);
const ruleById = new Map(RULES.map((entry) => [entry.id, entry]));

export function rule(id: string): Rule | undefined {
  return ruleById.get(id.toUpperCase());
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
export function formatIssue(issue: Issue): string {
  const explainingRule = rule(issue.rule);
  const where = explainingRule ? ` (see ${explainingRule.explained_in})` : "";

  return `${issue.severity} ${issue.rule} ${issue.path}: ${issue.message}${where}`;
}
