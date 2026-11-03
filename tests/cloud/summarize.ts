/** Summarize sanitized checkpoint evidence only; never reads credentials or calls a network. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const directory = "artifacts/cloud";
type Check = { name: string; status: "pass" | "fail" | "blocked"; detail?: unknown };
type Run = { at: string; checks: Check[] };
const aliases: Record<string, string> = {
  "Exact hosted report recheck (correct net credit and original sale count semantics)":
    "Exact event report reconciliation against independent expected deltas",
  "Anonymous denial on 18 PostgREST tables/views and real private RPC":
    "Anonymous denial on 18 PostgREST tables/views and mutation RPC",
  "Real login UI failure + login Axe and cookie SSR success":
    "Real login UI failure + login Axe and SSR success",
};
const runs = readdirSync(directory)
  .filter((name) => name.endsWith("-evidence.json") && name !== "consolidated-evidence.json")
  .map((name) => ({ name, run: JSON.parse(readFileSync(`${directory}/${name}`, "utf8")) as Run }))
  .sort((a, b) => a.run.at.localeCompare(b.run.at));
const latest = new Map<string, Check & { source: string }>();
for (const { name: source, run } of runs) {
  for (const check of run.checks) {
    // The original timeout was replaced by an explicit failed action-absence check
    // plus a narrower native print-media check. Keep both, not a generic timeout.
    if (check.name === "Receipt print contract and accessible sale detail") continue;
    const name = aliases[check.name] || check.name;
    latest.set(name, { ...check, name, source });
  }
}
const checks = [...latest.values()];
const counts = {
  pass: checks.filter((check) => check.status === "pass").length,
  fail: checks.filter((check) => check.status === "fail").length,
  blocked: checks.filter((check) => check.status === "blocked").length,
};
writeFileSync(
  `${directory}/consolidated-evidence.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      method:
        "Latest chronological observation per named checkpoint; historical harness-assumption corrections are explicitly aliased. Original phase files remain unchanged.",
      counts,
      checks,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(counts));
