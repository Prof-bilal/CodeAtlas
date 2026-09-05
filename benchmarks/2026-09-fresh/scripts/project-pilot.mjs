// Pilot task projection for the 2026-09-fresh benchmark (pilot infra only).
// Reads the 8 domain task manifests, selects the 16 pilot tasks, and emits a
// TaskFile JSON per config. For Config D it inlines each task's skill
// (skills/<id>/SKILL.md) into the prompt the way @atlas/benchmark's Skills
// renderer does, so the runnable CLI sees the skill in the agent prompt.
// Also writes a manifest mapping task -> repo key.
// Usage: node scripts/project-pilot.cjs <A|B|C|D> <outdir>
// Deliberately does NOT import @atlas/* (plain node can't load the SDK bundle);
// skill injection reads SKILL.md directly.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "..");
const tasksDir = join(base, "tasks");
const skillsDir = join(base, "skills");

const PILOT_IDS = [
	"FRONTEND-MEDIUM-01", "FRONTEND-HARD-01",
	"BACKEND-EASY-01", "BACKEND-MEDIUM-01",
	"DEBUGGING-HARD-01", "DEBUGGING-EXPERT-01",
	"FULLSTACK-MEDIUM-01", "FULLSTACK-EXPERT-01",
	"REFACTORING-MEDIUM-01", "REFACTORING-HARD-01",
	"TESTING-MEDIUM-01", "TESTING-HARD-01",
	"EXT-HARD-01", "EXT-EXPERT-01",
	"ARCH-EASY-01", "ARCH-MEDIUM-01",
];

const TASK_REPO = {
	"FRONTEND-MEDIUM-01": "codeatlas", "FRONTEND-HARD-01": "frontend-fixture",
	"BACKEND-EASY-01": "01-small-app", "BACKEND-MEDIUM-01": "01-small-app",
	"DEBUGGING-HARD-01": "01-small-app-debug1", "DEBUGGING-EXPERT-01": "01-small-app-debug2",
	"FULLSTACK-MEDIUM-01": "codeatlas", "FULLSTACK-EXPERT-01": "codeatlas",
	"REFACTORING-MEDIUM-01": "01-small-app", "REFACTORING-HARD-01": "01-small-app",
	"TESTING-MEDIUM-01": "01-small-app", "TESTING-HARD-01": "01-small-app-testing1",
	"EXT-HARD-01": "codeatlas", "EXT-EXPERT-01": "codeatlas",
	"ARCH-EASY-01": "codeatlas", "ARCH-MEDIUM-01": "codeatlas",
};

const DOMAIN_CATEGORY = {
	frontend: "code-modification", backend: "code-modification", debugging: "bug-investigation",
	"full-stack": "feature-planning", refactoring: "code-modification", testing: "testing",
	"external-knowledge": "repository-understanding", architecture: "repository-understanding",
};

const DOMAIN_FILES = [
	"frontend.json", "backend.json", "debugging.json", "fullstack.json",
	"refactoring.json", "testing.json", "external-knowledge.json", "architecture.json",
];

function loadTasks() {
	const byId = {};
	for (const f of DOMAIN_FILES) {
		const path = join(tasksDir, f);
		if (!existsSync(path)) continue;
		for (const t of JSON.parse(readFileSync(path, "utf-8"))) byId[t.id] = t;
	}
	return byId;
}

function parseSkill(md) {
	const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md);
	if (!m) return { meta: "", body: md };
	const meta = m[1].split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")).join("\n");
	return { meta, body: md.slice(m[0].length).trim() };
}

function renderSkill(skillId) {
	const path = join(skillsDir, skillId, "SKILL.md");
	if (!existsSync(path)) return null;
	const { meta, body } = parseSkill(readFileSync(path, "utf-8"));
	return [
		"## Reusable skill applied to this task", "", meta, "",
		"Follow these instructions for this task where relevant:", "", body,
	].join("\n");
}

function main() {
	const config = process.argv[2];
	const outDir = process.argv[3];
	if (!["A", "B", "C", "D"].includes(config) || !outDir) {
		console.error("usage: node scripts/project-pilot.cjs <A|B|C|D> <outdir>");
		process.exit(1);
	}
	mkdirSync(outDir, { recursive: true });
	const all = loadTasks();
	const tasks = [];
	const manifest = [];
	for (const id of PILOT_IDS) {
		const t = all[id];
		if (!t) { console.error(`missing task ${id}`); continue; }
		const repoKey = TASK_REPO[id];
		let prompt = t.prompt;
		let skillInjected = null;
		if (config === "D" && t.skill) {
			const block = renderSkill(t.skill);
			if (block) { prompt = `${block}\n\n---\n\n${prompt}`; skillInjected = t.skill; }
		}
		const categoryRaw = DOMAIN_CATEGORY[t.domain] ?? "repository-understanding";
		tasks.push({
			id, category: categoryRaw, prompt,
			expected_files: Array.isArray(t.expected_files) ? t.expected_files.filter((x) => !x.startsWith("<")) : [],
			expected_concepts: t.expected_concepts ?? [],
			evaluation_method: t.evaluation_method ?? "auto",
			...(t.gold_impact_files ? { gold_impact_files: t.gold_impact_files.filter((x) => !x.startsWith("<")) } : {}),
			...(t.forbidden_changes ? { forbidden_changes: t.forbidden_changes.filter((x) => !x.startsWith("<")) } : {}),
			...(t.max_seconds ? { max_seconds: t.max_seconds } : {}),
		});
		manifest.push({ id, domain: t.domain, difficulty: t.difficulty, repo: repoKey, skill: skillInjected });
	}
	const taskFile = { repository: "pilot-2026-09-fresh", name: `pilot-config-${config}`, version: "1.0.0", files: tasks.length, tasks };
	writeFileSync(join(outDir, `pilot-tasks-${config}.json`), JSON.stringify(taskFile, null, 2));
	writeFileSync(join(outDir, `pilot-manifest-${config}.json`), JSON.stringify(manifest, null, 2));
	console.log(`wrote ${outDir}/pilot-tasks-${config}.json (${tasks.length} tasks, skill-injected=${manifest.filter((m) => m.skill).length})`);
}

main();