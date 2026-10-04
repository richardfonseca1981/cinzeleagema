import { prisma } from "../src/lib/prisma";

// Estado "como em produção ANTES da migração" (seed antigo): 5 categorias, 10
// subcategorias (Formas dentro de BIG) e produtos espalhados.
export async function seedOldLayout() {
  const cat = async (name: string, slug: string, position: number) => prisma.category.create({ data: { name, slug, position } });
  const sub = async (name: string, slug: string, categoryId: string, position: number) =>
    prisma.subcategory.create({ data: { name, slug, categoryId, position } });

  const brutas = await cat("Pedras Brutas", "pedras-brutas", 1);
  const polidas = await cat("Pedras Polidas", "pedras-polidas", 2);
  const big = await cat("Big", "big", 3);
  const homedecor = await cat("Homedecor", "homedecor", 4);
  const acessorios = await cat("Acessorios", "acessorios", 5);

  const capelas = await sub("Capelas de Ametista", "capelas-de-ametista", brutas.id, 1);
  await sub("Pedras Brutas Peça", "pedras-brutas-peca", brutas.id, 2);
  await sub("Capelas de Citrino", "capelas-de-citrino", brutas.id, 3);
  await sub("Pedras Exclusivas", "pedras-exclusivas", brutas.id, 4);
  await sub("Pedras Roladas", "pedras-roladas", polidas.id, 1);
  await sub("Pedras Polidas Exclusivas", "pedras-polidas-exclusivas", polidas.id, 2);
  const ametistas = await sub("Ametistas", "ametistas", big.id, 1);
  await sub("Calcitas", "calcitas", big.id, 2);
  const citrinos = await sub("Citrinos", "citrinos", big.id, 3);
  const formas = await sub("Formas", "formas", big.id, 4);

  const product = (name: string, slug: string, categoryId: string, subcategoryId: string | null, active = true) =>
    prisma.product.create({ data: { name, slug, price: 10, categoryId, subcategoryId, active } });

  const moved = [
    await product("Esfera de Quartzo", "esfera-de-quartzo", big.id, formas.id),
    await product("Pirâmide de Selenita", "piramide-de-selenita", big.id, formas.id),
    await product("Ovo de Ágata (inativo)", "ovo-de-agata", big.id, formas.id, false),
  ];
  const others = [
    await product("Ametista Gigante", "ametista-gigante", big.id, ametistas.id),
    await product("Citrino Grande", "citrino-grande", big.id, citrinos.id),
    await product("Capela Pequena", "capela-pequena", brutas.id, capelas.id),
    await product("Vaso Decor", "vaso-decor", homedecor.id, null),
    await product("Pulseira", "pulseira", acessorios.id, null),
  ];
  return { brutas, polidas, big, homedecor, acessorios, formasSub: formas, moved, others };
}

// Foto completa e determinística do banco (para provar "nada mudou" / "voltou ao original").
export async function snapshot() {
  const categories = await prisma.category.findMany({ orderBy: { slug: "asc" } });
  const subcategories = await prisma.subcategory.findMany({ orderBy: { slug: "asc" } });
  const products = await prisma.product.findMany({ orderBy: { slug: "asc" }, select: { id: true, slug: true, categoryId: true, subcategoryId: true, active: true } });
  return JSON.parse(JSON.stringify({ categories, subcategories, products }));
}

