// Clients for the models we can call from the sandbox. Answers are sampled at temperature 0.7,
// so the same question can get a different answer on each call.
import { readFileSync } from "node:fs";

const questions = new Map(
  readFileSync(new URL("../data/questions.jsonl", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .map((question) => [question.id, question]),
);
const SKILL = { "model-a": 0.78, "model-b": 0.7, "judge-corvid": 0.9, "judge-wren": 0.88 };
const TEMPLATE_BONUS = { "support-v1": 0, "support-v2": 0.04 };

function answerTo(model, questionId, template) {
  const question = questions.get(questionId);

  if (!question) throw new Error(`unknown question ${questionId}`);

  const chance = SKILL[model] + (TEMPLATE_BONUS[template] ?? 0) - question.difficulty * 0.25;
  const style = model === "model-a" ? "Certainly! " : "";

  return Math.random() < chance ? `${style}${question.reference}` : `${style}${question.plausible_wrong_answer}`;
}

/** Ask a candidate model one question from data/questions.jsonl. */
export async function ask(model, questionId, { template = "support-v1" } = {}) {
  if (model !== "model-a" && model !== "model-b") throw new Error(`no candidate model "${model}"`);

  await new Promise((resolve) => setTimeout(resolve, 5));

  return answerTo(model, questionId, template);
}

/** Ask a judge model whether an answer matches the reference. Returns "correct" or "incorrect". */
export async function judge(judgeModel, questionId, answer) {
  if (judgeModel !== "judge-corvid" && judgeModel !== "judge-wren") throw new Error(`no judge model "${judgeModel}"`);

  const question = questions.get(questionId);
  const right = answer.includes(question.reference);
  const likesItsFamily = judgeModel === "judge-corvid" && answer.startsWith("Certainly!") && Math.random() < 0.3;
  const accurate = Math.random() < SKILL[judgeModel];

  return (accurate ? right : !right) || likesItsFamily ? "correct" : "incorrect";
}
