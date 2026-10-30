import { describe, expect, it } from "vitest";
import { menuPosition } from "../src/lib/menu-position";
import { MOVEMENT_LABELS } from "../src/lib/movement-labels";
import { translate } from "../src/lib/translations";

describe("measured portal menu placement", () => {
  for (const rtl of [false, true]) {
    for (const width of [320, 360, 390, 1440]) {
      it(`keeps both horizontal edges inside ${width}px in ${rtl ? "RTL" : "LTR"}`, () => {
        for (const left of [0, 12, width - 54]) {
          const position = menuPosition(
            { left, right: left + 44, top: 20, bottom: 64 },
            { width: 192, height: 150 },
            { width, height: 844 },
            rtl,
          );
          expect(position.left).toBeGreaterThanOrEqual(12);
          expect(position.left + 192).toBeLessThanOrEqual(width - 12);
          expect(position.top).toBe(70);
        }
      });
    }
  }
  it("aligns the appropriate trigger edge when there is room", () => {
    const box = { left: 250, right: 294, top: 20, bottom: 64 };
    expect(
      menuPosition(box, { width: 192, height: 150 }, { width: 600, height: 844 }, true).left,
    ).toBe(250);
    expect(
      menuPosition(box, { width: 192, height: 150 }, { width: 600, height: 844 }, false).left,
    ).toBe(102);
  });
  it("opens above a bottom-edge trigger and clamps a tall menu", () => {
    const box = { left: 12, right: 56, top: 740, bottom: 784 };
    expect(
      menuPosition(box, { width: 192, height: 200 }, { width: 390, height: 844 }, true).top,
    ).toBe(534);
    expect(
      menuPosition(box, { width: 192, height: 820 }, { width: 390, height: 844 }, true).top,
    ).toBe(12);
  });
});

it("covers every inventory movement kind with a typed authored Urdu label", () => {
  expect(Object.keys(MOVEMENT_LABELS).sort()).toEqual(
    ["opening", "sale", "receipt", "correction", "damage", "missing", "return", "reversal"].sort(),
  );
  for (const label of Object.values(MOVEMENT_LABELS))
    expect(translate("ur", label)).toMatch(/[\u0600-\u06ff]/);
  expect(translate("ur", MOVEMENT_LABELS.receipt)).toBe("نیا مال وصول ہوا");
});
