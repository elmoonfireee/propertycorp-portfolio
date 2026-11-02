import assert from "node:assert/strict";
import fs from "node:fs";

// Test-only reference validator for the PC-05 contract. Production parsing
// remains the scope of PC-06 and must not import this script.
const specUrl = new URL("../docs/PROPERTYCORP_DESCRIPTION_FORMAT_V1.md", import.meta.url);
const spec = fs.readFileSync(specUrl, "utf8");
const examplesSection = spec
  .slice(spec.indexOf("## 15. Examples"), spec.indexOf("## 16. Ambiguity resolution"));
const validExamples = [...examplesSection.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)]
  .map((match) => match[1]);

const canonicalMeasurement = /^(?:ok\. )?\d+,\d{2} m²$/u;
const canonicalMeasurementNote = /^(?:ok\. )?\d+,\d{2} m²\s+\|\s+\S/u;

function letters(value) {
  return [...value].filter((character) => /\p{L}/u.test(character)).join("");
}

function isSectionHeadingLabel(value) {
  const valueLetters = letters(value);
  return value.length >= 2
    && value.length <= 80
    && Boolean(valueLetters)
    && valueLetters === valueLetters.toLocaleUpperCase("pl-PL");
}

function isSubheadingLabel(value) {
  const valueLetters = letters(value);
  if (!valueLetters || value.length > 60) return false;
  const firstLetter = [...valueLetters][0];
  return firstLetter === firstLetter.toLocaleUpperCase("pl-PL")
    && valueLetters !== valueLetters.toLocaleUpperCase("pl-PL");
}

function validate(source) {
  const errors = [];
  let section = null;
  let subheading = null;

  const addContent = () => {
    if (section) section.content += 1;
    if (subheading) subheading.content += 1;
  };

  const closeSubheading = () => {
    if (subheading?.content === 0) {
      errors.push({ code: "EMPTY_SUBHEADING", line: subheading.line });
    }
    subheading = null;
  };

  const closeSection = () => {
    closeSubheading();
    if (section?.content === 0) {
      errors.push({ code: "EMPTY_SECTION", line: section.line });
    }
    section = null;
  };

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (/^-\s*$/.test(line)) {
      errors.push({ code: "EMPTY_LIST_ITEM", line: lineNumber });
      return;
    }
    if (!line) {
      return;
    }

    if (line.startsWith("- ")) {
      if (!section) errors.push({ code: "LIST_ITEM_OUTSIDE_SECTION", line: lineNumber });
      const payload = line.slice(2).trim();
      if (!payload) errors.push({ code: "EMPTY_LIST_ITEM", line: lineNumber });

      const labeled = payload.match(/^([^:]+): (.+)$/u);
      if (labeled && section?.title === "UKŁAD POMIESZCZEŃ") {
        const value = labeled[2];
        const measurementCandidate = value.split("|", 1)[0].trim();
        const looksLikeArea = /\d\s*(?:m(?:2|²)?)(?:\b|$)/iu.test(measurementCandidate);
        if (looksLikeArea && !canonicalMeasurement.test(value) && !canonicalMeasurementNote.test(value)) {
          errors.push({ code: "MALFORMED_MEASUREMENT", line: lineNumber });
        }
      }
      addContent();
      return;
    }

    const row = line.match(/^([^:]{1,80}): (.+)$/u);
    if (row) {
      if (!section) errors.push({ code: "KEY_VALUE_OUTSIDE_SECTION", line: lineNumber });
      if (row[1] === "SUMA" && !canonicalMeasurement.test(row[2])) {
        errors.push({ code: "MALFORMED_SUMMARY", line: lineNumber });
      }
      addContent();
      return;
    }

    const standaloneColon = line.match(/^([^:]+):$/u);
    if (standaloneColon && isSectionHeadingLabel(standaloneColon[1])) {
      closeSection();
      section = { title: standaloneColon[1], line: lineNumber, content: 0 };
      return;
    }

    if (standaloneColon && isSubheadingLabel(standaloneColon[1])) {
      closeSubheading();
      if (!section) {
        errors.push({ code: "SUBHEADING_OUTSIDE_SECTION", line: lineNumber });
      } else {
        subheading = { line: lineNumber, content: 0 };
      }
      return;
    }

    addContent();
  });

  closeSection();
  return errors;
}

assert.equal(validExamples.length, 8, "Spec should expose examples A-H as text fixtures.");
validExamples.forEach((example, index) => {
  assert.deepEqual(validate(example), [], `Example ${String.fromCharCode(65 + index)} should have 0 ERROR.`);
});

const invalidExamples = [
  {
    name: "orphan list item",
    source: "- Poza sekcją",
    expected: "LIST_ITEM_OUTSIDE_SECTION",
  },
  {
    name: "malformed summary",
    source: "UKŁAD POMIESZCZEŃ:\n\n- Salon: 20,00 m²\n\nSUMA: 20,0 m2",
    expected: "MALFORMED_SUMMARY",
  },
  {
    name: "malformed measurement",
    source: "UKŁAD POMIESZCZEŃ:\n\n- Salon: 12,5m2",
    expected: "MALFORMED_MEASUREMENT",
  },
  {
    name: "malformed measurement note",
    source: "UKŁAD POMIESZCZEŃ:\n\n- Salon: 12,5m2 | opis",
    expected: "MALFORMED_MEASUREMENT",
  },
  {
    name: "empty section",
    source: "LOKALIZACJA:\n\nDLA KOGO:\n\n- Dla rodzin",
    expected: "EMPTY_SECTION",
  },
  {
    name: "orphan subheading",
    source: "Parter:\n\nOpis bez sekcji.",
    expected: "SUBHEADING_OUTSIDE_SECTION",
  },
  {
    name: "orphan key value",
    source: "Czynsz: 1000 zł",
    expected: "KEY_VALUE_OUTSIDE_SECTION",
  },
  {
    name: "empty list item",
    source: "DODATKOWE INFORMACJE:\n\n- ",
    expected: "EMPTY_LIST_ITEM",
  },
];

invalidExamples.forEach(({ name, source, expected }) => {
  const codes = validate(source).map(({ code }) => code);
  assert.ok(codes.includes(expected), `${name} should report ${expected}; received ${codes.join(", ")}.`);
});

console.log(`Description Format v1 spec: ${validExamples.length} valid documentation examples passed with 0 ERROR.`);
console.log(`Description Format v1 spec: ${invalidExamples.length} invalid fixtures returned their expected ERROR codes.`);
