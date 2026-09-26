import type { Category } from "../../types";

interface CategoryNavProps {
  categories: Category[];
  categoryId: string;
  subcategoryId: string;
  onSelectCategory: (id: string) => void;
  onSelectSubcategory: (categoryId: string, subcategoryId: string) => void;
}

export function CategoryNav({
  categories,
  categoryId,
  subcategoryId,
  onSelectCategory,
  onSelectSubcategory,
}: CategoryNavProps) {
  return (
    <nav className="space-y-5">
      <button
        onClick={() => onSelectCategory("")}
        className={`block text-left text-base font-bold transition ${
          !categoryId ? "text-[#1B3A6B]" : "text-[#1A1A1A] hover:text-[#1B3A6B]"
        }`}
      >
        Todas as peças
      </button>

      {categories.map((category) => (
        <div key={category.id}>
          <button
            onClick={() => onSelectCategory(category.id)}
            className={`block text-left text-base font-bold uppercase tracking-wide transition ${
              categoryId === category.id ? "text-[#1B3A6B]" : "text-[#1A1A1A] hover:text-[#1B3A6B]"
            }`}
          >
            {category.name}
          </button>

          {category.subcategories.length > 0 && (
            <ul className="mt-1.5 space-y-1 border-l border-[#E2E8F0] pl-3">
              {category.subcategories.map((subcategory) => {
                const active = categoryId === category.id && subcategoryId === subcategory.id;
                return (
                  <li key={subcategory.id}>
                    <button
                      onClick={() => onSelectSubcategory(category.id, subcategory.id)}
                      className={`text-left text-sm font-normal transition ${
                        active ? "font-medium text-[#1B3A6B]" : "text-[#64748B] hover:text-[#1B3A6B]"
                      }`}
                    >
                      {subcategory.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
