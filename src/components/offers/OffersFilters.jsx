import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_OFFER_FILTERS, filterOffers } from "../../domain/offers/offerFilters.js";
import {
  ROOM_OPTIONS,
  SORT_OPTIONS,
  TRANSACTION_OPTIONS,
  pluralizeOffers,
} from "../../domain/offers/offerListing.js";

function selectedValues(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function toggleFilterValue(values, value) {
  const selected = selectedValues(values);
  return selected.includes(value)
    ? selected.filter((entry) => entry !== value)
    : [...selected, value];
}

export function MultiSelectFilter({ id, label, value, options, onChange, allLabel = "Wszystkie", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = React.useId();
  const selected = selectedValues(value);
  const selectedOptions = options.filter((option) => selected.includes(option.value));
  const selectionLabel = selectedOptions.length === 0
    ? allLabel
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} wybrane`;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  return (
    <div className={`offers-multi-select ${className}`.trim()} ref={rootRef} onKeyDown={(event) => {
      if (isOpen && event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        ref={triggerRef}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <strong id={`${id}-value`}>{selectionLabel}</strong>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen && <div id={menuId} className="offers-multi-select__menu" role="group" aria-label={label}>
        <button type="button" className={selected.length === 0 ? "is-active" : ""} onClick={() => onChange([])}>{allLabel}</button>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return <label key={option.value}>
            <input type="checkbox" checked={checked} onChange={() => onChange(toggleFilterValue(selected, option.value))} />
            <span>{option.label}</span>
            {checked && <Check aria-hidden="true" />}
          </label>;
        })}
      </div>}
    </div>
  );
}

function RangeField({ label, minName, maxName, filters, onChange }) {
  return (
    <div className="offers-range-field">
      <span>{label}</span>
      <div>
        <label>
          <span className="sr-only">{label} od</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="od"
            value={filters[minName] ?? ""}
            onChange={(event) => onChange({ [minName]: event.target.value || null })}
          />
        </label>
        <i aria-hidden="true" />
        <label>
          <span className="sr-only">{label} do</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="do"
            value={filters[maxName] ?? ""}
            onChange={(event) => onChange({ [maxName]: event.target.value || null })}
          />
        </label>
      </div>
    </div>
  );
}

function TransactionPicker({ value, onChange }) {
  return (
    <fieldset className="offers-transaction-picker">
      <legend>Transakcja</legend>
      <div>
        <button type="button" className={!value ? "is-active" : ""} aria-pressed={!value} onClick={() => onChange(null)}>Wszystkie</button>
        {TRANSACTION_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

function RoomsPicker({ value, onChange }) {
  const selected = selectedValues(value);
  return (
    <fieldset className="offers-rooms-picker">
      <legend>Liczba pokoi</legend>
      <div>
        <button type="button" className={selected.length === 0 ? "is-active" : ""} aria-pressed={selected.length === 0} onClick={() => onChange([])}>Dowolna</button>
        {ROOM_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={selected.includes(option.value) ? "is-active" : ""} aria-pressed={selected.includes(option.value)} onClick={() => onChange(toggleFilterValue(selected, option.value))}>{option.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function ActiveFilterChips({ chips, onRemove, onClear }) {
  if (!chips.length) return null;

  return (
    <div className="offers-active-filters" aria-label="Aktywne filtry">
      <div className="offers-active-filters__chips">
        {chips.map((chip) => (
          <button type="button" key={chip.key} onClick={() => onRemove(chip.key)}>
            {chip.label}<X aria-hidden="true" />
          </button>
        ))}
      </div>
      <button className="offers-active-filters__clear" type="button" onClick={onClear}>Wyczyść wszystko</button>
    </div>
  );
}

export function OffersSortDropdown({ value, onChange, variant = "results" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const menuId = React.useId();
  const activeIndex = Math.max(0, SORT_OPTIONS.findIndex((option) => option.value === value));
  const activeOption = SORT_OPTIONS[activeIndex];

  const closeMenu = (restoreFocus = false) => {
    setIsOpen(false);
    setFocusIndex(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = (nextFocusIndex = activeIndex) => {
    setFocusIndex(nextFocusIndex);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || focusIndex == null) return undefined;
    const frame = window.requestAnimationFrame(() => optionRefs.current[focusIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusIndex, isOpen]);

  const focusOption = (nextIndex) => {
    const index = (nextIndex + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    setFocusIndex(index);
    optionRefs.current[index]?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu((activeIndex + 1) % SORT_OPTIONS.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu((activeIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(SORT_OPTIONS.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };

  return (
    <div className={`offers-sort-dropdown offers-sort-dropdown--${variant}`} ref={rootRef}>
      <button
        ref={triggerRef}
        className="offers-sort-dropdown__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={`offers-sort-menu-${menuId}`}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>Sortuj</span>
        <strong>{activeOption.label}</strong>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen && (
        <div id={`offers-sort-menu-${menuId}`} className="offers-sort-dropdown__menu" role="menu" aria-label="Kolejność ofert">
          {SORT_OPTIONS.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "is-selected" : ""}
                onClick={() => { onChange(option.value); closeMenu(true); }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{option.label}</span>
                {selected && <Check aria-label="Wybrano" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OffersFilters({
  filters,
  facets,
  onChange,
  onClear,
  chips = [],
  onRemove,
  showActiveFilters = true,
}) {
  const setPartial = (partial) => onChange({ ...filters, ...partial });

  return (
    <div className="offers-filters" aria-label="Filtry ofert">
      <div className="offers-filters__primary">
        <TransactionPicker value={filters.transaction} onChange={(transaction) => setPartial({ transaction })} />
        <MultiSelectFilter id="offers-type" label="Typ nieruchomości" value={filters.type} options={facets.types} onChange={(type) => setPartial({ type })} allLabel="Wszystkie typy" />
        <MultiSelectFilter id="offers-location" label="Lokalizacja" value={filters.location} options={facets.locations} onChange={(location) => setPartial({ location })} allLabel="Wszystkie lokalizacje" />
        <RangeField label="Cena" minName="priceMin" maxName="priceMax" filters={filters} onChange={setPartial} />
        <RangeField label="Powierzchnia" minName="areaMin" maxName="areaMax" filters={filters} onChange={setPartial} />
        <RoomsPicker value={filters.rooms} onChange={(rooms) => setPartial({ rooms })} />
      </div>

      {showActiveFilters && <ActiveFilterChips chips={chips} onRemove={onRemove} onClear={onClear} />}
    </div>
  );
}

export function OffersStickyFilterBar({ visible, resultCount, chips, filters, onChange, onRemove, onOpenFilters }) {
  const visibleChips = chips.slice(0, 2);
  const hiddenChipCount = Math.max(0, chips.length - visibleChips.length);

  return (
    <aside className={`offers-sticky-bar${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
      <div className="offers-sticky-bar__inner final-shell">
        <p className="offers-sticky-bar__count" aria-live="polite"><strong>{resultCount ?? "—"}</strong><span>{resultCount == null ? "ofert" : pluralizeOffers(resultCount)}</span></p>
        {visibleChips.length > 0 && (
          <div className="offers-sticky-bar__chips" aria-label="Najważniejsze aktywne filtry">
            {visibleChips.map((chip) => <button type="button" key={chip.key} onClick={() => onRemove(chip.key)}>{chip.label}<X aria-hidden="true" /></button>)}
            {hiddenChipCount > 0 && <span aria-label={`Kolejne aktywne filtry: ${hiddenChipCount}`}>+{hiddenChipCount}</span>}
          </div>
        )}
        <button type="button" className="offers-sticky-bar__filters" onClick={onOpenFilters}>Filtry ({chips.length}) <SlidersHorizontal aria-hidden="true" /></button>
        <OffersSortDropdown variant="sticky" value={filters.sort} onChange={(sort) => onChange({ ...filters, sort })} />
      </div>
    </aside>
  );
}

function getFocusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
    .filter((element) => !element.hasAttribute("hidden"));
}

export function MobileFiltersSheet({ open, filters, offers, facets, onClose, onApply }) {
  const [draft, setDraft] = useState(filters);
  const sheetRef = useRef(null);
  const resultCount = useMemo(() => filterOffers(offers, draft).length, [offers, draft]);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [filters, open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => getFocusableElements(sheetRef.current)[0]?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(sheetRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const clear = () => {
    const next = { ...DEFAULT_OFFER_FILTERS };
    setDraft(next);
  };

  return (
    <div className="offers-mobile-sheet" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="offers-mobile-sheet__panel" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="offers-mobile-filters-title">
        <div className="offers-mobile-sheet__header">
          <div><p>Oferty</p><h2 id="offers-mobile-filters-title">Filtry</h2></div>
          <button type="button" aria-label="Zamknij filtry" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="offers-mobile-sheet__content">
          <OffersFilters filters={draft} facets={facets} onChange={setDraft} onClear={clear} showActiveFilters={false} />
        </div>
        <div className="offers-mobile-sheet__footer">
          <button className="offers-mobile-sheet__clear" type="button" onClick={clear}>Wyczyść</button>
          <button className="offers-mobile-sheet__apply" type="button" onClick={() => { onApply(draft); onClose(); }}>Pokaż {resultCount} {resultCount === 1 ? "ofertę" : pluralizeOffers(resultCount)}</button>
        </div>
      </section>
    </div>
  );
}
