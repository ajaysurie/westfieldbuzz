import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COPY, ROUTES, SELECTORS } from "./selectors.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("skill frontmatter registers the skill", () => {
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: verify-westfieldbuzz\n/);
  assert.match(skill, /^description: .+/m);
  assert.match(skill, /helpers\/launch\.mjs/);
  assert.match(skill, /helpers\/doctor\.mjs/);
  assert.match(skill, /helpers\/drive\.mjs/);
  assert.match(skill, /helpers\/cleanup\.mjs/);
});

test("selectors and routes match files in app/", () => {
  const nav = fs.readFileSync(path.join(skillRoot, "../../../app/src/components/Nav.tsx"), "utf8");
  assert.match(nav, /aria-label="Primary navigation"/);
  assert.match(nav, /href: "\/events"/);
  const homeSearch = fs.readFileSync(path.join(skillRoot, "../../../app/src/components/search/HomeSearch.tsx"), "utf8");
  assert.match(homeSearch, /id="home-search"/);
  const searchForm = fs.readFileSync(path.join(skillRoot, "../../../app/src/components/search/SearchForm.tsx"), "utf8");
  assert.match(searchForm, /id="event-search"/);
  const friday = fs.readFileSync(path.join(skillRoot, "../../../app/src/components/FridaySignup.tsx"), "utf8");
  assert.match(friday, /id="friday-email"/);
  const smoke = fs.readFileSync(path.join(skillRoot, "../../../app/e2e/smoke.spec.ts"), "utf8");
  assert.match(smoke, /input#event-search/);
  assert.equal(SELECTORS.homeSearch, "#home-search");
  assert.equal(SELECTORS.eventSearch, "#event-search");
  assert.equal(ROUTES.events, "/events");
  assert.equal(ROUTES.cronIngest, "/api/cron/ingest?group=core-libraries");
  assert.match("What's on around Westfield this week.", COPY.homeH1);
});
