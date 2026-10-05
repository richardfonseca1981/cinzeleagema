import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { CartItem } from "../../types";
import { ERROR_MESSAGES, describeUnavailable, type ShippingAction, type ShippingMessage } from "../../lib/shipping/errors";
import { deliveryRangeText } from "../../lib/shipping/options";
import { formatCents, toDisplayCents } from "../../lib/shipping/money";
import type { ShippingController } from "../../lib/shipping/useShippingController";
import { ARRANGE_OPTION_ID, type ShippingOption } from "../../lib/shipping/types";

interface ShippingCalculatorProps {
  controller: ShippingController;
  items: CartItem[];
  exchangeRate: number | null;
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";
const secondaryButton =
  "rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50";

// Cartões de carregamento com a mesma altura dos cartões reais (sem pulo de layout).
function OptionsSkeleton({ label }: { label: string }) {
  return (
    <div className="mt-4 space-y-2" role="status" aria-label={label} aria-busy="true" data-testid="shipping-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-[76px] animate-pulse items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <div className="h-4 w-4 rounded-full bg-[#E2E8F0]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-[#E2E8F0]" />
            <div className="h-3 w-1/4 rounded bg-[#E2E8F0]" />
          </div>
          <div className="h-4 w-16 rounded bg-[#E2E8F0]" />
        </div>
      ))}
    </div>
  );
}

export function ShippingCalculator({ controller: c, items, exchangeRate }: ShippingCalculatorProps) {
  const { t, i18n } = useTranslation();
  const postalRef = useRef<HTMLInputElement>(null);
  const money = (brl: number) => formatCents(toDisplayCents(brl, i18n.language, exchangeRate), i18n.language, exchangeRate);

  const cooling = c.cooldownSecondsLeft > 0;
  const arranged = c.selection === ARRANGE_OPTION_ID;

  function runAction(action: ShippingAction) {
    if (action === "retry") void c.calculate();
    else if (action === "checkPostalCode") postalRef.current?.focus();
    else if (action === "reviewCart") document.getElementById("cart-items")?.scrollIntoView({ block: "start" });
    else c.chooseArrange();
  }

  function renderMessage(message: ShippingMessage, tone: "error" | "info") {
    const actions = message.actions.filter((a) => !(a === "arrange" && arranged));
    return (
      <div
        role={tone === "error" ? "alert" : "status"}
        className={`mt-4 rounded-lg border p-3 text-sm ${
          tone === "error" ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]" : "border-[#E2E8F0] bg-[#F8FAFC] text-[#1A1A1A]"
        }`}
        data-testid="shipping-message"
      >
        <p>{t(message.messageKey)}</p>
        {actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => runAction(action)}
                disabled={action === "retry" && (c.isLoading || cooling)}
                className={secondaryButton}
              >
                {t(`shipping.actions.${action}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderOption(option: ShippingOption) {
    const selected = c.selection === option.id;
    const days = deliveryRangeText(t, option.deliveryDaysMin, option.deliveryDaysMax);
    return (
      <label
        key={option.id}
        className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-[#C78F50]/40 ${
          selected ? "border-[#C78F50] bg-[#C78F50]/5" : "border-[#E2E8F0] bg-white hover:border-[#C78F50]/60"
        }`}
      >
        <input
          type="radio"
          name="shipping-option"
          value={option.id}
          checked={selected}
          onChange={() => c.selectOption(option.id)}
          className="h-4 w-4 accent-[#C78F50]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-[#1A1A1A]">
              {option.carrier} — {option.service}
            </span>
            {c.badges.cheapestId === option.id && (
              <span className="rounded-full bg-[#F0FDF4] px-2 py-0.5 text-xs font-semibold text-[#15803D]">{t("shipping.badge.cheapest")}</span>
            )}
            {c.badges.fastestId === option.id && (
              <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">{t("shipping.badge.fastest")}</span>
            )}
            {option.kind === "estimated" && (
              <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-xs font-semibold text-[#B45309]">{t("shipping.estimate.label")}</span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-[#64748B]">{days ?? t("shipping.delivery.unknown")}</span>
          {option.kind === "estimated" && <span className="mt-0.5 block text-xs text-[#B45309]">{t("shipping.estimate.note")}</span>}
        </span>
        <span className="whitespace-nowrap font-semibold text-[#1A1A1A]">{money(option.priceBRL)}</span>
      </label>
    );
  }

  const state = c.quoteState;
  const result = c.result;

  // A mensagem de erro/indisponibilidade já oferece "Combinar pelo WhatsApp":
  // nesse caso o link discreto do rodapé seria redundante.
  const shownMessage =
    state.status === "error"
      ? ERROR_MESSAGES[state.error]
      : state.status === "success" && result?.unavailable && result.mode !== "international"
        ? describeUnavailable(result.unavailable.reason)
        : null;
  const messageOffersArrange = Boolean(shownMessage?.actions.includes("arrange"));

  return (
    <section aria-labelledby="shipping-title" className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-4" data-testid="shipping-calculator">
      <h2 id="shipping-title" className="text-base font-semibold text-[#1A1A1A]">
        {t("shipping.title")}
      </h2>
      <p className="mt-1 text-sm text-[#64748B]">{t("shipping.subtitle")}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="shipping-country" className="block text-sm font-medium text-[#1A1A1A]">
            {t("shipping.country")}
          </label>
          <select id="shipping-country" value={c.country} onChange={(e) => c.setCountry(e.target.value)} className={fieldClass}>
            {c.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="shipping-postal" className="block text-sm font-medium text-[#1A1A1A]">
            {c.isBrazil ? t("shipping.postalCodeBr") : t("shipping.postalCodeOther")}
          </label>
          <input
            id="shipping-postal"
            ref={postalRef}
            type="text"
            inputMode={c.isBrazil ? "numeric" : "text"}
            autoComplete="postal-code"
            maxLength={c.isBrazil ? 9 : 20}
            placeholder={c.isBrazil ? "00000-000" : ""}
            value={c.postal}
            onChange={(e) => c.setPostal(e.target.value)}
            aria-invalid={c.postalError}
            aria-describedby="shipping-postal-help"
            className={`${fieldClass} ${c.postalError ? "border-[#DC2626]" : ""}`}
          />
          <p id="shipping-postal-help" className="mt-1 min-h-[1.25rem] text-xs text-[#64748B]" aria-live="polite">
            {c.postalError
              ? t("shipping.error.invalid_postal_code")
              : c.isBrazil
                ? c.place?.city
                  ? `${c.place.city}${c.place.state ? `, ${c.place.state}` : ""}`
                  : t("shipping.postalCodeBrHint")
                : ""}
          </p>
        </div>
      </div>

      {!c.isBrazil && (
        <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm" data-testid="international-note">
          <p className="font-medium text-[#1A1A1A]">{t("shipping.international.title")}</p>
          <p className="mt-1 text-[#64748B]">{t("shipping.international.text")}</p>
          <p className="mt-1 text-[#64748B]">{t("shipping.international.taxes")}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void c.calculate()}
        disabled={c.isLoading || cooling || items.length === 0}
        className="mt-4 w-full rounded-lg bg-[#C78F50] px-4 py-2.5 text-sm font-semibold text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50 sm:w-auto"
      >
        {c.isLoading ? t("shipping.calculating") : cooling ? t("shipping.cooldown", { seconds: c.cooldownSecondsLeft }) : t("shipping.calculate")}
      </button>

      {c.expiredNotice && state.status === "idle" && (
        <p className="mt-3 text-sm text-[#B45309]" role="status">
          {t("shipping.expired")}
        </p>
      )}

      {state.status === "loading" && <OptionsSkeleton label={t("shipping.calculating")} />}

      {state.status === "error" && renderMessage(ERROR_MESSAGES[state.error], "error")}

      {state.status === "success" && result && (
        <div aria-live="polite">
          {result.unavailable ? (
            result.mode === "international" ? (
              // país sem tabela: não é erro — o frete é confirmado pelo atendimento
              <p className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#1A1A1A]" role="status" data-testid="shipping-message">
                {t("shipping.international.text")}
              </p>
            ) : (
              renderMessage(describeUnavailable(result.unavailable.reason), "info")
            )
          ) : (
            <fieldset className="mt-4">
              <legend className="sr-only">{t("shipping.optionsLabel")}</legend>
              <div role="radiogroup" aria-label={t("shipping.optionsLabel")} className="space-y-2">
                {result.options.map(renderOption)}
              </div>
              {result.notice === "taxes_not_included" && <p className="mt-2 text-xs text-[#64748B]">{t("shipping.taxesNotice")}</p>}
            </fieldset>
          )}
          {c.cartChangedSinceQuote && (
            <p className="mt-3 text-sm text-[#B45309]" role="status">
              {t("shipping.summary.staleWarning")}
            </p>
          )}
        </div>
      )}

      <div className={messageOffersArrange && !arranged ? "" : "mt-4 border-t border-[#E2E8F0] pt-3"}>
        {arranged ? (
          <p className="text-sm text-[#64748B]" data-testid="arrange-chosen">
            {t("shipping.arrange.chosen")}
          </p>
        ) : (
          !messageOffersArrange && (
            <button type="button" onClick={c.chooseArrange} className="text-sm text-[#64748B] underline underline-offset-2 transition hover:text-[#C78F50]">
              {t("shipping.arrange.link")}
            </button>
          )
        )}
      </div>
    </section>
  );
}
