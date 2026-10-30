"use client";
import { LocalizedForm, useT } from "./preferences";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  History,
  Package,
  PackageMinus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Tags,
  Upload,
} from "lucide-react";
import type { InventoryData, Product, Shop } from "../lib/types";
import { money, quantity, stockStatus } from "../lib/money";
import { useQueryFilters } from "./hooks";
import { unitCost } from "./format";
import { ActionMenu, Badge, Button, EmptyState, Notice, PageHeading, Pagination } from "./ui";
import {
  AdjustDialog,
  CategoryDialog,
  DeactivateDialog,
  ImportDialog,
  MovementsDialog,
  ProductEditor,
  ReceiveDialog,
} from "./inventory-dialogs";
import { SaleDialog } from "./sale-dialog";

type ProductDialog = {
  mode: "edit" | "sell" | "receive" | "adjust" | "movements" | "deactivate";
  product: Product;
};
export function InventoryView({ data, shop }: { data: InventoryData; shop: Shop }) {
  const t = useT();
  const [search, setSearch] = useState(data.filters.search);
  const [dialog, setDialog] = useState<ProductDialog | null>(null);
  const [create, setCreate] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const update = useQueryFilters();
  useEffect(() => {
    setSearch(data.filters.search);
  }, [data.filters.search]);
  const filtered = Boolean(
    data.filters.search ||
    (data.filters.category && data.filters.category !== "all") ||
    (data.filters.stock && data.filters.stock !== "all") ||
    data.filters.active === "archived",
  );
  function done(message: string) {
    setDialog(null);
    setCreate(false);
    setCategoryOpen(false);
    setImportOpen(false);
    setSuccess(message);
  }
  const statusBadge = (product: Product) => {
    const status = stockStatus(product);
    return (
      <Badge
        dot
        tone={
          !product.is_active
            ? "neutral"
            : status === "out"
              ? "red"
              : status === "low"
                ? "amber"
                : "green"
        }
      >
        {!product.is_active
          ? t("Inactive")
          : status === "out"
            ? t("Out of stock")
            : status === "low"
              ? t("Low stock")
              : t("In stock")}
      </Badge>
    );
  };
  return (
    <>
      <PageHeading
        title={t("Inventory")}
        subtitle={t("Your products, stock levels, and everyday stock movements.")}
        actions={
          <>
            <a href="/api/export?type=inventory" className="button button--secondary">
              <Download size={16} />
              {t("Export")}
            </a>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              {t("Import")}
            </Button>
            <Button onClick={() => setCreate(true)}>
              <Plus size={17} />
              {t("Add product")}
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <div className="inventory-summary" aria-label={t("Inventory summary")}>
        <button
          type="button"
          className={!data.filters.stock || data.filters.stock === "all" ? "is-selected" : ""}
          onClick={() => update({ stock: null, active: "active" })}
        >
          <span className="summary-icon">
            <Package size={17} />
          </span>
          <span>{t("Active products")}</span>
          <strong>{data.counts.active.toLocaleString()}</strong>
        </button>
        <button
          type="button"
          className={data.filters.stock === "low" ? "is-selected" : ""}
          onClick={() => update({ stock: "low", active: "active" })}
        >
          <span className="summary-icon summary-icon--amber">
            <ArrowDownToLine size={17} />
          </span>
          <span>{t("Low stock")}</span>
          <strong>{data.counts.low.toLocaleString()}</strong>
        </button>
        <button
          type="button"
          className={data.filters.stock === "out" ? "is-selected" : ""}
          onClick={() => update({ stock: "out", active: "active" })}
        >
          <span className="summary-icon summary-icon--red">
            <PackageMinus size={17} />
          </span>
          <span>{t("Out of stock")}</span>
          <strong>{data.counts.out.toLocaleString()}</strong>
        </button>
        <Button
          variant="ghost"
          className="category-create-button"
          onClick={() => setCategoryOpen(true)}
        >
          <Tags size={16} />
          {t("New category")}
        </Button>
      </div>
      <section className="panel inventory-panel" aria-label={t("Product catalog")}>
        <div className="filter-toolbar">
          <LocalizedForm
            className="search-input inventory-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: search.trim() });
            }}
          >
            <Search size={17} aria-hidden="true" />
            <label htmlFor="inventory-search" className="sr-only">
              {t("Search products")}
            </label>
            <input
              id="inventory-search"
              type="search"
              placeholder={t("Search name, SKU, barcode…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="search-submit" aria-label={t("Search inventory")}>
              <ArrowUpFromLine size={15} className="search-enter-icon" />
            </button>
          </LocalizedForm>
          <div className="filters">
            <label className="filter-select">
              <span className="sr-only">{t("Category filter")}</span>
              <select
                aria-label={t("Filter by category")}
                value={data.filters.category || "all"}
                onChange={(event) =>
                  update({ category: event.target.value === "all" ? null : event.target.value })
                }
              >
                <option value="all">{t("All categories")}</option>
                <option value="uncategorized">{t("Uncategorized")}</option>
                {data.categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">{t("Stock filter")}</span>
              <select
                aria-label={t("Filter by stock status")}
                value={data.filters.stock || "all"}
                onChange={(event) =>
                  update({ stock: event.target.value === "all" ? null : event.target.value })
                }
              >
                <option value="all">{t("All stock levels")}</option>
                <option value="alerts">{t("Needs attention")}</option>
                <option value="in">{t("In stock")}</option>
                <option value="low">{t("Low stock")}</option>
                <option value="out">{t("Out of stock")}</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">{t("Product visibility")}</span>
              <select
                aria-label={t("Filter active products")}
                value={data.filters.active || "active"}
                onChange={(event) => update({ active: event.target.value })}
              >
                <option value="active">{t("Active products")}</option>
                <option value="archived">{t("Inactive products")}</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-meta">
          <span>
            {data.products.count.toLocaleString()}{" "}
            {data.products.count === 1 ? t("product") : t("products")}
            {filtered ? t(" matching filters") : t(" in your catalog")}
            {filtered && (
              <button
                className="text-link clear-filters"
                type="button"
                onClick={() => update({ q: null, category: null, stock: null, active: "active" })}
              >
                {t("Clear filters")}
              </button>
            )}
          </span>
          <label className="sort-control">
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>{t("Sort:")}</span>
            <select
              aria-label={t("Sort products")}
              value={data.filters.sort || "name"}
              onChange={(event) => update({ sort: event.target.value })}
            >
              <option value="name">{t("Name A–Z")}</option>
              <option value="stock">{t("Stock: low to high")}</option>
              <option value="price">{t("Price: low to high")}</option>
              <option value="newest">{t("Newest first")}</option>
            </select>
          </label>
        </div>
        {!data.products.rows.length ? (
          <EmptyState
            icon={Package}
            title={
              filtered ? t("No products match these filters") : t("A well-stocked shop starts here")
            }
            description={
              filtered
                ? t("Try a different search or clear the filters to see more products.")
                : t(
                    "Add your first product or import a CSV to start tracking inventory and recording sales.",
                  )
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => update({ q: null, category: null, stock: null, active: "active" })}
                >
                  {t("Clear filters")}
                </Button>
              ) : (
                <div className="button-row">
                  <Button onClick={() => setCreate(true)}>
                    <Plus size={16} />
                    {t("Add your first product")}
                  </Button>
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    {t("Import CSV")}
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table inventory-table">
              <caption className="sr-only">
                {t("Product inventory, prices and stock levels")}
              </caption>
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th>{t("Category")}</th>
                  <th className="numeric">{t("Selling price")}</th>
                  <th className="numeric">{t("Unit cost")}</th>
                  <th className="numeric">{t("Stock on hand")}</th>
                  <th>{t("Status")}</th>
                  <th className="actions-heading">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.products.rows.map((product) => (
                  <tr key={product.id}>
                    <td data-label={t("Product")} className="product-name-cell">
                      <button
                        type="button"
                        className="product-name-button"
                        onClick={() => setDialog({ mode: "movements", product })}
                      >
                        <span className="product-thumbnail" aria-hidden="true">
                          <Package size={19} strokeWidth={1.5} />
                        </span>
                        <span>
                          <strong>{product.name}</strong>
                          <span className="cell-meta">
                            {product.sku
                              ? t("SKU {v0}", { v0: product.sku })
                              : product.barcode
                                ? t("Barcode {v0}", { v0: product.barcode })
                                : t("No SKU")}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td data-label={t("Category")}>
                      <span className="category-text">
                        {product.category?.name ??
                          data.categories.find((category) => category.id === product.category_id)
                            ?.name ??
                          t("Uncategorized")}
                      </span>
                    </td>
                    <td data-label={t("Selling price")} className="numeric amount-cell">
                      {money(product.selling_price, shop.currency)}
                    </td>
                    <td data-label={t("Unit cost")} className="numeric">
                      {product.cost_price === null ? (
                        <span className="unavailable" title={t("Cost has not been provided")}>
                          {t("Unknown")}
                        </span>
                      ) : (
                        unitCost(product.cost_price, shop.currency, t("Unavailable"))
                      )}
                    </td>
                    <td
                      data-label={t("Stock on hand")}
                      className={`numeric stock-amount stock-amount--${stockStatus(product)}`}
                    >
                      <strong>{quantity(product.current_stock)}</strong>
                      <span className="unit-text">{product.unit}</span>
                    </td>
                    <td data-label={t("Status")}>{statusBadge(product)}</td>
                    <td className="row-actions" data-label={t("Actions")}>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!product.is_active || stockStatus(product) === "out"}
                        onClick={() => setDialog({ mode: "sell", product })}
                      >
                        {t("Sell")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={t("Receive {v0}", { v0: product.name })}
                        onClick={() => setDialog({ mode: "receive", product })}
                      >
                        <ArrowDownToLine size={17} aria-hidden="true" />
                        <span>{t("Receive")}</span>
                      </Button>
                      <ActionMenu
                        label={t("More actions for {v0}", { v0: product.name })}
                        items={[
                          {
                            label: "Edit product",
                            icon: Pencil,
                            onSelect: () => setDialog({ mode: "edit", product }),
                          },
                          {
                            label: "Adjust stock",
                            icon: SlidersHorizontal,
                            onSelect: () => setDialog({ mode: "adjust", product }),
                          },
                          {
                            label: "Stock movements",
                            icon: History,
                            onSelect: () => setDialog({ mode: "movements", product }),
                          },
                          ...(product.is_active
                            ? [
                                {
                                  label: "Deactivate product",
                                  icon: PackageMinus,
                                  danger: true,
                                  onSelect: () => setDialog({ mode: "deactivate", product }),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination result={data.products} noun={t("products")} />
      </section>
      <p className="page-footnote">
        {t(
          "Stock is updated only after a delivery, sale, return, or adjustment is successfully recorded.",
        )}
      </p>
      {(create || dialog?.mode === "edit") && (
        <ProductEditor
          product={dialog?.mode === "edit" ? dialog.product : undefined}
          categories={data.categories}
          shop={shop}
          onClose={() => {
            setCreate(false);
            setDialog(null);
          }}
          onSuccess={done}
        />
      )}
      {categoryOpen && <CategoryDialog onClose={() => setCategoryOpen(false)} onSuccess={done} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onSuccess={done} />}
      {dialog?.mode === "sell" && (
        <SaleDialog
          shop={shop}
          initialProduct={dialog.product}
          onClose={() => setDialog(null)}
          onSuccess={done}
        />
      )}
      {dialog?.mode === "receive" && (
        <ReceiveDialog
          shop={shop}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSuccess={done}
        />
      )}
      {dialog?.mode === "adjust" && (
        <AdjustDialog product={dialog.product} onClose={() => setDialog(null)} onSuccess={done} />
      )}
      {dialog?.mode === "movements" && (
        <MovementsDialog product={dialog.product} shop={shop} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === "deactivate" && (
        <DeactivateDialog
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSuccess={done}
        />
      )}
    </>
  );
}
