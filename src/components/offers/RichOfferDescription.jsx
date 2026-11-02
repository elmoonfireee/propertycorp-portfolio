import React from "react";
import { ArrowRight } from "lucide-react";
import { descriptionSectionKinds } from "../../domain/offers/parseOfferDescription.js";

function RichInline({ parts = [] }) {
  return parts.map((part, index) => {
    const key = `${index}-${part.text.slice(0, 18)}`;
    let content = part.text;
    if (part.emphasis) content = <em>{content}</em>;
    if (part.strong) content = <strong>{content}</strong>;
    return <React.Fragment key={key}>{content}{index < parts.length - 1 ? " " : ""}</React.Fragment>;
  });
}

function isDropCapCandidate(block) {
  const text = String(block?.text || "").trim();
  return text.length >= 42
    && !/^[\-–—•]/u.test(text)
    && /^[\p{L}„“"']/u.test(text)
    && !/[:;]$/u.test(text);
}

function Prose({ blocks, className = "", dropCap = false }) {
  if (!blocks?.length) return null;
  const classes = [
    "offer-description-rich__prose",
    className,
    dropCap && isDropCapCandidate(blocks[0]) ? "offer-description-rich__prose--drop-cap" : "",
  ].filter(Boolean).join(" ");
  return <div className={classes}>{blocks.map((block, index) => <p key={`${index}-${block.text.slice(0, 26)}`}><RichInline parts={block.inline} /></p>)}</div>;
}

function SectionHeading({ title }) {
  return <header className="offer-description-rich__section-heading"><span aria-hidden="true" /><h3>{title}</h3><span aria-hidden="true" /></header>;
}

function ListItems({ items, sectionType }) {
  const isFactGrid = sectionType === "keyFacts";
  const isAdditionalInfo = sectionType === "additionalInfo";
  const isBenefits = sectionType === "audience";
  return <ul className={`offer-description-rich__list${isFactGrid ? " offer-description-rich__list--facts" : ""}${isAdditionalInfo ? " offer-description-rich__list--additional" : ""}${isBenefits ? " offer-description-rich__list--benefits" : ""}`}>
    {items.map((item, index) => <li key={`${index}-${item.label || item.content[0]?.text || "item"}`}>
      <i aria-hidden="true" />
      <div>{item.label && <strong>{item.label}</strong>}{item.label && item.content.length ? " " : null}<RichInline parts={item.content} /></div>
    </li>)}
  </ul>;
}

function ListSection({ section }) {
  return <ListItems items={section.items} sectionType={section.type} />;
}

function KeyValueRows({ rows }) {
  return <dl className="offer-description-rich__key-values">
    {rows.map((row, index) => <div className={row.type === "summary" ? "is-summary" : ""} key={`${row.label}-${index}`}>
      <dt>{row.label}</dt>
      <dd>{row.type === "summary" ? row.measurement : <RichInline parts={row.content} />}</dd>
    </div>)}
  </dl>;
}

function StructuredBlocks({ blocks, sectionType }) {
  const content = [];
  let prose = [];
  let rows = [];
  const flushProse = () => {
    if (prose.length) content.push(<Prose blocks={prose} key={`prose-${content.length}`} />);
    prose = [];
  };
  const flushRows = () => {
    if (rows.length) content.push(<KeyValueRows rows={rows} key={`rows-${content.length}`} />);
    rows = [];
  };

  blocks.forEach((block, index) => {
    if (block.type === "paragraph") {
      flushRows();
      prose.push(block);
    } else if (block.type === "list") {
      flushProse();
      flushRows();
      content.push(<ListItems key={`list-${index}`} items={block.items} sectionType={sectionType} />);
    } else if (block.type === "keyValue" || block.type === "summary") {
      flushProse();
      rows.push(block);
    } else if (block.type === "subheading") {
      flushProse();
      flushRows();
      content.push(<h4 className="offer-description-rich__subheading" key={`subheading-${index}`}>{block.title}</h4>);
    }
  });
  flushProse();
  flushRows();
  return <>{content}</>;
}

function LayoutSection({ section }) {
  return <>
    <div className="offer-description-rich__well offer-description-rich__well--layout">
      {section.groups.map((group, groupIndex) => <div className="offer-description-rich__layout-group" key={`${group.title || "layout"}-${groupIndex}`}>
        {group.title && <h4>{group.title}</h4>}
        <dl className={group.rows.some((row) => row.value) ? "" : "offer-description-rich__layout-list"}>
          {group.rows.map((row, index) => <div className={row.isSummary ? "is-summary" : ""} key={`${index}-${row.label}`}>
            <dt><span>{row.label}</span>{row.note && <small>{row.note}</small>}</dt>
            {row.value && <dd>{row.value}</dd>}
          </div>)}
        </dl>
      </div>)}
    </div>
    {section.tailBlocks?.length > 0 && <Prose blocks={section.tailBlocks} className="offer-description-rich__layout-following-prose" />}
  </>;
}

function DescriptionSection({ section }) {
  const isList = descriptionSectionKinds.list.has(section.type);
  const isWell = descriptionSectionKinds.well.has(section.type);
  const isStructured = section.source === "v1" || section.type === "generic" || section.blocks.some((block) => block.type !== "paragraph");

  if (section.type === "prose") {
    return <section className="offer-description-rich__section offer-description-rich__section--prose"><Prose blocks={section.blocks} /></section>;
  }

  if (section.type === "contact") {
    return <aside className="offer-description-rich__closing offer-description-rich__closing--contact">
      <SectionHeading title={section.title} />
      <StructuredBlocks blocks={section.blocks} sectionType={section.type} />
    </aside>;
  }

  return <section className={`offer-description-rich__section offer-description-rich__section--${section.type}`}>
    <SectionHeading title={section.title} />
    {section.type === "layout"
      ? <LayoutSection section={section} />
      : isList && section.legacyList
        ? <ListSection section={section} />
        : <div className={isWell || isStructured ? `offer-description-rich__well${section.type === "important" ? " offer-description-rich__well--important" : ""}` : "offer-description-rich__prose-wrap"}>
          {isStructured ? <StructuredBlocks blocks={section.blocks} sectionType={section.type} /> : <Prose blocks={section.blocks} />}
        </div>}
  </section>;
}

export function RichOfferDescription({ model, onContact }) {
  return <article className="offer-description-rich">
    {model.intro.length > 0 && <Prose blocks={model.intro} className="offer-description-rich__intro" dropCap />}
    {model.sections.map((section, index) => <DescriptionSection key={`${section.type}-${section.title}-${index}`} section={section} />)}
    {model.closing.length > 0 && <aside className="offer-description-rich__closing">
      <Prose blocks={model.closing} />
      <a href="#kontakt" onClick={onContact}>Umów prezentację <ArrowRight aria-hidden="true" /></a>
    </aside>}
    {model.legal && <footer className="offer-description-rich__legal"><RichInline parts={model.legal.inline} /></footer>}
  </article>;
}
