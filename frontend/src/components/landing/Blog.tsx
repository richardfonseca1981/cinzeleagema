import { BLOG_PLACEHOLDER_POSTS } from "./data";
import { PlaceholderImage } from "./PlaceholderImage";

export function Blog() {
  return (
    <section id="blog" className="bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#1B3A6B]">Blog</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">Conteúdo sobre pedras preciosas</h2>
          <p className="mt-4 text-[#64748B]">Em breve, artigos completos aqui. Confira uma prévia do que está por vir.</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {BLOG_PLACEHOLDER_POSTS.map((post) => (
            <div key={post.title} className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <PlaceholderImage label="Imagem do artigo (placeholder)" className="h-36 w-full" />
              <div className="flex flex-1 flex-col p-5">
                <span className="w-fit rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#64748B]">
                  Em breve
                </span>
                <h3 className="mt-3 font-semibold text-[#1A1A1A]">{post.title}</h3>
                <p className="mt-2 flex-1 text-sm text-[#64748B]">{post.excerpt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
