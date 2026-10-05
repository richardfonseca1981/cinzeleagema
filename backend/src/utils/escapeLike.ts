// "contains" do Prisma NÃO escapa os curingas do LIKE/ILIKE: sem isso, buscar
// "%" ou "_" casaria com todas as peças e "100%" com qualquer "100...". A
// barra invertida é o caractere de escape padrão do LIKE no PostgreSQL.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
