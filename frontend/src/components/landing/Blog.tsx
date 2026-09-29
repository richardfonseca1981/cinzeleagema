import { useTranslation } from "react-i18next";
import { PlaceholderImage } from "./PlaceholderImage";

interface BlogPost {
  title: string;
  excerpt: string;
}

export function Blog() {
  const { t } = useTranslation();
  const posts = t("blog.posts", { returnObjects: true }) as BlogPost[];

  return (
    <section id="blog" className="bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#C78F50]">{t("blog.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">{t("blog.title")}</h2>
          <p className="mt-4 text-[#64748B]">{t("blog.subtitle")}</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {posts.map((post) => (
            <div key={post.title} className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <PlaceholderImage label={t("blog.imageAlt")} className="h-36 w-full" />
              <div className="flex flex-1 flex-col p-5">
                <span className="w-fit rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#64748B]">
                  {t("blog.comingSoon")}
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
