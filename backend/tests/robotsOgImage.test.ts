import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildAvailableProductMeta, buildCatalogMeta, buildHomeMeta } from "../src/lib/seo/meta";

const SITE_URL = "https://www.cinzeleagema.com.br";
const ROBOTS_PATH = path.resolve(__dirname, "../../frontend/public/robots.txt");

// Lê os "Disallow" do grupo "User-agent: *" do robots.txt REAL servido em
// produção (frontend/public/robots.txt, ver CONTEXT.md "SEO — Rodada 1") —
// nunca uma cópia/mock, para travar a regressão que motivou a Rodada 2:
// og:image apontando para um caminho bloqueado pelo próprio robots.txt
// (o crawler de prévia social do Facebook/WhatsApp respeita esse arquivo ao
// buscar a imagem, requisição separada da do HTML).
function readDisallowRulesForAllAgents(): string[] {
  const content = fs.readFileSync(ROBOTS_PATH, "utf-8");
  const disallows: string[] = [];
  let inStarGroup = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^user-agent:\s*\*/i.test(line)) {
      inStarGroup = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inStarGroup = false;
      continue;
    }
    if (!inStarGroup) continue;
    const match = line.match(/^disallow:\s*(\S+)/i);
    if (match) disallows.push(match[1]);
  }
  return disallows;
}

function isBlocked(pathname: string, disallowRules: string[]): boolean {
  return disallowRules.some((rule) => rule !== "" && pathname.startsWith(rule));
}

describe("robots.txt vs og:image gerado", () => {
  it("o grupo '*' ainda bloqueia /admin e /api (pré-condição deste teste)", () => {
    const disallowRules = readDisallowRulesForAllAgents();
    expect(disallowRules).toContain("/admin");
    expect(disallowRules).toContain("/api");
  });

  it("og:image da home, do catálogo e de uma peça disponível não bate em nenhum Disallow do grupo '*'", () => {
    const disallowRules = readDisallowRulesForAllAgents();

    const home = buildHomeMeta(SITE_URL);
    const catalog = buildCatalogMeta(SITE_URL);
    const product = buildAvailableProductMeta(SITE_URL, {
      name: "Drusa de Ametista",
      weightSize: "2,77 kg · 22 cm",
      canonicalSlug: "drusa-de-ametista-8dnvub",
    });

    for (const meta of [home, catalog, product]) {
      const pathname = new URL(meta.image).pathname;
      expect(isBlocked(pathname, disallowRules)).toBe(false);
    }
  });

  it("a URL antiga (/api/preview/og-image/...) continua bloqueada — por isso não pode mais ser o og:image público", () => {
    const disallowRules = readDisallowRulesForAllAgents();
    expect(isBlocked("/api/preview/og-image/drusa-de-ametista-8dnvub.jpg", disallowRules)).toBe(true);
  });
});
