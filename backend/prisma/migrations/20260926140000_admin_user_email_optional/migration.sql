-- Torna email opcional: campo não é usado para login (username já cobre isso)
-- e a nova tela de gestão de usuários admin cria contas só com username/senha.
ALTER TABLE "AdminUser" ALTER COLUMN "email" DROP NOT NULL;
