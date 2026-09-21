import { GALLERY_PLACEHOLDER_ITEMS } from "./data";
import { PlaceholderImage } from "./PlaceholderImage";

export function Gallery() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#1B3A6B]">Galeria</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">Peças e bastidores</h2>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {GALLERY_PLACEHOLDER_ITEMS.map((label) => (
            <PlaceholderImage key={label} label={label} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}
