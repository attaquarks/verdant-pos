"use client";

import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import { ArrowRight, Download, Plus, Search, ShoppingBag } from "lucide-react";
import type { DateRange, PageResult, Sale, Shop } from "../lib/types";
import { money } from "../lib/money";
import { formatDate } from "../lib/dates";
import { useQueryFilters } from "./hooks";
import { Button, DateRangeControl, EmptyState, Notice, PageHeading, Pagination } from "./ui";
import { SaleDialog } from "./sale-dialog";
import { PaymentBadge, SaleDetailsDialog, SaleStatus } from "./sale-details";

export function SalesView({
  sales,
  shop,
  range,
  filters,
}: {
  sales: PageResult<Sale>;
  shop: Shop;
  range: DateRange;
  filters: { search: string; method: string };
}) {
  const [search, setSearch] = useState(filters.search);
  const [saleOpen, setSaleOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const update = useQueryFilters();
  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);
  const filtered = Boolean(filters.search || (filters.method && filters.method !== "all"));
  return (
    <>
      <PageHeading
        title="Sales"
        subtitle="Every sale, payment, and return. A complete record, not a running estimate."
        actions={
          <>
            <a
              href={`/api/export?type=sales&from=${range.from}&to=${range.to}`}
              className="button button--secondary"
            >
              <Download size={16} />
              Export
            </a>
            <Button onClick={() => setSaleOpen(true)}>
              <Plus size={17} />
              New sale
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <div className="range-toolbar">
        <DateRangeControl range={range} />
        <span className="timezone-note">Dates in {shop.time_zone.replaceAll("_", " ")}</span>
      </div>
      <section className="panel">
        <div className="filter-toolbar">
          <form
            className="search-input inventory-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: search.trim() });
            }}
          >
            <Search size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="sales-search">
              Search sales
            </label>
            <input
              id="sales-search"
              type="search"
              placeholder="Search reference, customer, or product…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="search-submit" aria-label="Search sales">
              <ArrowRight size={16} />
            </button>
          </form>
          <label className="filter-select">
            <span className="sr-only">Payment method filter</span>
            <select
              value={filters.method || "all"}
              onChange={(event) =>
                update({ method: event.target.value === "all" ? null : event.target.value })
              }
              aria-label="Filter sales by payment method"
            >
              <option value="all">All payment methods</option>
              <option value="cash">Cash</option>
              <option value="digital">Digital</option>
              <option value="credit">Credit</option>
            </select>
          </label>
        </div>
        <div className="table-meta">
          <span>
            {sales.count.toLocaleString()} {sales.count === 1 ? "sale" : "sales"}{" "}
            <span className="muted">· {range.label}</span>
            {filtered && (
              <button
                type="button"
                className="text-link clear-filters"
                onClick={() => update({ q: null, method: null })}
              >
                Clear filters
              </button>
            )}
          </span>
          <span className="muted">Most recent first</span>
        </div>
        {!sales.rows.length ? (
          <EmptyState
            icon={ShoppingBag}
            title={filtered ? "No matching sales" : "No sales in this period"}
            description={
              filtered
                ? "Try a different reference, customer, product, or payment filter."
                : "Record a sale or choose a different date range. Sales appear here only after they are saved."
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => update({ q: null, method: null })}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setSaleOpen(true)}>
                  <Plus size={16} />
                  Record a sale
                </Button>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table sales-table">
              <caption className="sr-only">Sales for {range.label}</caption>
              <thead>
                <tr>
                  <th>Sale / products</th>
                  <th>Date & time</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th className="numeric">Sale amount</th>
                  <th>Status</th>
                  <th className="actions-heading">Details</th>
                </tr>
              </thead>
              <tbody>
                {sales.rows.map((sale) => (
                  <tr key={sale.id}>
                    <td className="sale-reference-cell" data-label="Sale">
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => setSelected(sale.id)}
                      >
                        {sale.reference}
                      </button>
                      <span className="cell-meta truncate-text" title={sale.product_names}>
                        {sale.product_names || "Sale items"}
                      </span>
                    </td>
                    <td data-label="Date & time">
                      <span>
                        {formatDate(sale.occurred_at, shop.time_zone, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="cell-meta">
                        {formatDate(sale.occurred_at, shop.time_zone, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td data-label="Customer">
                      <span>{sale.customer_name || <span className="muted">Walk-in</span>}</span>
                      {sale.customer_contact && (
                        <span className="cell-meta truncate-text">{sale.customer_contact}</span>
                      )}
                    </td>
                    <td data-label="Payment">
                      <PaymentBadge method={sale.payment_method} />
                      {new Decimal(sale.balance_due).gt(0) && (
                        <span className="cell-meta amber-text">
                          {money(sale.balance_due, shop.currency)} due
                        </span>
                      )}
                    </td>
                    <td data-label="Sale amount" className="numeric">
                      <strong>{money(sale.total, shop.currency)}</strong>
                      {new Decimal(sale.returned_total).gt(0) && (
                        <span className="cell-meta">
                          Net {money(sale.net_total, shop.currency)}
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <SaleStatus sale={sale} />
                    </td>
                    <td className="row-actions" data-label="Details">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(sale.id)}
                        aria-label={`View sale ${sale.reference}`}
                      >
                        View
                        <ArrowRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination result={sales} noun="sales" />
      </section>
      <p className="page-footnote">
        Original sales remain in their original period. Returns and reversals are adjustments dated
        when recorded.
      </p>
      {saleOpen && (
        <SaleDialog
          shop={shop}
          onClose={() => setSaleOpen(false)}
          onSuccess={(message) => {
            setSaleOpen(false);
            setSuccess(message);
          }}
        />
      )}
      {selected && (
        <SaleDetailsDialog saleId={selected} shop={shop} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
