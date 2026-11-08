// Casos REAIS de produção (banco Railway, consulta somente leitura em
// 08/11 — ver backend/tmp/identificacoes-producao.json, fora do git) —
// as 9 peças que têm identificationPt/En preenchido. Classificação pela
// relação entre o início da identificação e o Nome, pedida para investigar
// o bug "nome duplicado" relatado pelo Felipe: (a) igual, (b) nome editado
// levemente, (c) nome editado muito. Nenhuma peça real na classe (d) "sem
// relação" existia no banco nesta data — ver REAL_NAME_IDENTIFICATION_CLASS_D
// abaixo para o fixture sintético dessa classe.
export interface RealIdentificationCase {
  ref: string;
  name: string;
  nameEn: string;
  identificationPt: string;
  identificationEn: string;
  class: "a" | "b" | "c";
}

export const REAL_IDENTIFICATION_NAME_CASES: RealIdentificationCase[] = [
  { ref: "66", name: "Esfera de Quartzo Fumê Polido", nameEn: "Polished Smoky Quartz Sphere", identificationPt: "Esfera de Quartzo Fumê Polido", identificationEn: "Polished Smoky Quartz Sphere", class: "a" },
  { ref: "96", name: "Ágata com Drusa em Formato de Coração", nameEn: "Heart-Shaped Agate with Drusy", identificationPt: "Ágata com Drusa em Formato de Coração", identificationEn: "Agate Geode Heart Shape", class: "a" },
  { ref: "93", name: "Cianita Azul em Matriz", nameEn: "Blue Kyanite in Matrix", identificationPt: "Cianita em Matriz", identificationEn: "Kyanite in Matrix", class: "b" },
  { ref: "105", name: "Drusa de Quartzo Rosa", nameEn: "Rose Quartz Druse", identificationPt: "Quartzo Rosa Bruto", identificationEn: "Raw Rose Quartz", class: "b" },
  { ref: "108", name: "Drusa de Ametista", nameEn: "Amethyst Druse", identificationPt: "Geodo de Ametista", identificationEn: "Amethyst Geode", class: "b" },
  { ref: "91", name: "Geodo de Ágata Azul com Ametista e Calcita", nameEn: "Blue Agate Geode with Amethyst and Calcite", identificationPt: "Ágata Azul com Drusa e Ametista", identificationEn: "Blue Agate with Amethyst Druse", class: "b" },
  { ref: "106", name: "Drusa de Calcedônia Botrioidal", nameEn: "Botryoidal Chalcedony Druse", identificationPt: "Drusa de Quartzo em Matriz", identificationEn: "Quartz Drusy with Matrix", class: "c" },
  { ref: "82", name: "Água Marinha Bruto em Matriz", nameEn: "Rough Aquamarine in Matrix", identificationPt: "Berilo Verde Bruto em Matriz", identificationEn: "Green Beryl Rough on Host Rock", class: "c" },
  { ref: "92", name: "Geodo de Citrino Aberto", nameEn: "Open Citrine Geode", identificationPt: "Geodo de Quartzo Amarelo em Matriz", identificationEn: "Yellow Quartz Geode in Matrix", class: "c" },
];

// Fixture SINTÉTICO (não existe caso real na classe "d" nos dados de
// produção na data da investigação): identificação sem relação nenhuma com
// o nome cadastrado — ex.: a IA errou a espécie por completo e o admin
// corrigiu com um nome de catálogo totalmente diferente.
export const REAL_NAME_IDENTIFICATION_CLASS_D = {
  ref: "SINTETICO-D",
  name: "Olho de Tigre Facetado",
  nameEn: "Faceted Tiger's Eye",
  identificationPt: "Cristal Verde em Matriz",
  identificationEn: "Green Crystal in Matrix",
};
