-- Dimensões (px) da foto exibida — opcionais: fotos antigas ficam NULL
-- ("proporção desconhecida") até serem trocadas. Migration aditiva.
ALTER TABLE "ProductImage" ADD COLUMN "width" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN "height" INTEGER;
