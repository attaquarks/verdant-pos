import { describe, expect, it } from "vitest";
import { Exact, lineTotal, money, quantity, stockStatus, sum } from "../src/lib/money";

describe("decimal arithmetic and presentation", () => {
  it("does not accumulate binary floating point errors", () => {
    expect(sum(["0.10", "0.20"])).toBe("0.30");
    expect(lineTotal("3", "0.10", "0.01")).toBe("0.29");
  });
  it("rounds half up exactly like PostgreSQL numeric", () => {
    expect(lineTotal("0.125", "0.20")).toBe("0.03");
    expect(lineTotal("1.005", "1.00")).toBe("1.01");
    expect(lineTotal("0.333", "12.50", "0.01")).toBe("4.15");
    // The rounded subtotal is 0.01, so a 0.01 discount is a valid free line.
    expect(lineTotal("0.001", "5.00", "0.01")).toBe("0.00");
  });
  it("handles large decimals without using floats for arithmetic", () => {
    expect(new Exact("999999999999.99").minus("0.01").toFixed(2)).toBe("999999999999.98");
  });
  it("does not pretend unknown costs are zero", () => {
    expect(money(null, "USD")).toBe("—");
  });
  it("formats money and fractional stock clearly", () => {
    expect(money("1234.5", "USD")).toBe("$1,234.50");
    expect(quantity("12.345")).toBe("12.345");
    expect(quantity("12.000")).toBe("12");
    expect(money("99999999999999.99", "USD")).toBe("$99,999,999,999,999.99");
    expect(money("-0.01", "USD")).toBe("-$0.01");
    expect(quantity("9999999999999999.999")).toBe("9,999,999,999,999,999.999");
  });
  it("classifies zero, threshold, and sufficient stock", () => {
    expect(stockStatus({ current_stock: "0", low_stock_threshold: "5" })).toBe("out");
    expect(stockStatus({ current_stock: "5.000", low_stock_threshold: "5" })).toBe("low");
    expect(stockStatus({ current_stock: "5.001", low_stock_threshold: "5" })).toBe("in");
  });
});
