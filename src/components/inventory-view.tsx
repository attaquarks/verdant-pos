"use client";

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
import {
  ActionMenu,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Notice,
  PageHeading,
  Pagination,
} from "./ui";
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
          ? "Inactive"
          : status === "out"
            ? "Out of stock"
            : status === "low"
              ? "Low stock"
              : "In stock"}
      </Badge>
    );
  };
  return (
    <>
      <PageHeading
        title="Inventory"
        subtitle="Your products, stock levels, and everyday stock movements."
        actions={
          <>
            <a href="/api/export?type=inventory" className="button button--secondary">
              <Download size={16} />
              Export
            </a>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              Import
            </Button>
            <Button onClick={() => setCreate(true)}>
              <Plus size={17} />
              Add product
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <div className="inventory-summary" aria-label="Inventory summary">
        <button
          type="button"
          className={!data.filters.stock || data.filters.stock === "all" ? "is-selected" : ""}
          onClick={() => update({ stock: null, active: "active" })}
        >
          <span className="summary-icon">
            <Package size={17} />
          </span>
          <span>Active products</span>
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
          <span>Low stock</span>
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
          <span>Out of stock</span>
          <strong>{data.counts.out.toLocaleString()}</strong>
        </button>
        <Button
          variant="ghost"
          className="category-create-button"
          onClick={() => setCategoryOpen(true)}
        >
          <Tags size={16} />
          New category
        </Button>
      </div>
      <section className="panel inventory-panel" aria-label="Product catalog">
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
            <label htmlFor="inventory-search" className="sr-only">
              Search products
            </label>
            <input
              id="inventory-search"
              type="search"
              placeholder="Search name, SKU, barcode…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="search-submit" aria-label="Search inventory">
              <ArrowUpFromLine size={15} className="search-enter-icon" />
            </button>
          </form>
          <div className="filters">
            <label className="filter-select">
              <span className="sr-only">Category filter</span>
              <select
                aria-label="Filter by category"
                value={data.filters.category || "all"}
                onChange={(event) =>
                  update({ category: event.target.value === "all" ? null : event.target.value })
                }
              >
                <option value="all">All categories</option>
                <option value="uncategorized">Uncategorized</option>
                {data.categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">Stock filter</span>
              <select
                aria-label="Filter by stock status"
                value={data.filters.stock || "all"}
                onChange={(event) =>
                  update({ stock: event.target.value === "all" ? null : event.target.value })
                }
              >
                <option value="all">All stock levels</option>
                <option value="alerts">Needs attention</option>
                <option value="in">In stock</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">Product visibility</span>
              <select
                aria-label="Filter active products"
                value={data.filters.active || "active"}
                onChange={(event) => update({ active: event.target.value })}
              >
                <option value="active">Active products</option>
                <option value="archived">Inactive products</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-meta">
          <span>
            {data.products.count.toLocaleString()}{" "}
            {data.products.count === 1 ? "product" : "products"}
            {filtered ? " matching filters" : " in your catalog"}
            {filtered && (
              <button
                className="text-link clear-filters"
                type="button"
                onClick={() => update({ q: null, category: null, stock: null, active: "active" })}
              >
                Clear filters
              </button>
            )}
          </span>
          <label className="sort-control">
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>Sort:</span>
            <select
              aria-label="Sort products"
              value={data.filters.sort || "name"}
              onChange={(event) => update({ sort: event.target.value })}
            >
              <option value="name">Name A–Z</option>
              <option value="stock">Stock: low to high</option>
              <option value="price">Price: low to high</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>
        {!data.products.rows.length ? (
          <EmptyState
            icon={Package}
            title={filtered ? "No products match these filters" : "A well-stocked shop starts here"}
            description={
              filtered
                ? "Try a different search or clear the filters to see more products."
                : "Add your first product or import a CSV to start tracking inventory and recording sales."
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => update({ q: null, category: null, stock: null, active: "active" })}
                >
                  Clear filters
                </Button>
              ) : (
                <div className="button-row">
                  <Button onClick={() => setCreate(true)}>
                    <Plus size={16} />
                    Add your first product
                  </Button>
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    Import CSV
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table inventory-table">
              <caption className="sr-only">Product inventory, prices and stock levels</caption>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="numeric">Selling price</th>
                  <th className="numeric">Unit cost</th>
                  <th className="numeric">Stock on hand</th>
                  <th>Status</th>
                  <th className="actions-heading">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.products.rows.map((product) => (
                  <tr key={product.id}>
                    <td data-label="Product" className="product-name-cell">
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
                              ? `SKU ${product.sku}`
                              : product.barcode
                                ? `Barcode ${product.barcode}`
                                : "No SKU"}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td data-label="Category">
                      <span className="category-text">
                        {product.category?.name ??
                          data.categories.find((category) => category.id === product.category_id)
                            ?.name ??
                          "Uncategorized"}
                      </span>
                    </td>
                    <td data-label="Selling price" className="numeric amount-cell">
                      {money(product.selling_price, shop.currency)}
                    </td>
                    <td data-label="Unit cost" className="numeric">
                      {product.cost_price === null ? (
                        <span className="unavailable" title="Cost has not been provided">
                          Unknown
                        </span>
                      ) : (
                        unitCost(product.cost_price, shop.currency)
                      )}
                    </td>
                    <td
                      data-label="Stock on hand"
                      className={`numeric stock-amount stock-amount--${stockStatus(product)}`}
                    >
                      <strong>{quantity(product.current_stock)}</strong>
                      <span className="unit-text">{product.unit}</span>
                    </td>
                    <td data-label="Status">{statusBadge(product)}</td>
                    <td className="row-actions" data-label="Actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!product.is_active || stockStatus(product) === "out"}
                        onClick={() => setDialog({ mode: "sell", product })}
                      >
                        Sell
                      </Button>
                      <IconButton
                        label={`Receive ${product.name}`}
                        onClick={() => setDialog({ mode: "receive", product })}
                      >
                        <ArrowDownToLine size={17} />
                      </IconButton>
                      <ActionMenu
                        label={`More actions for ${product.name}`}
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
        <Pagination result={data.products} noun="products" />
      </section>
      <p className="page-footnote">
        Stock is updated only after a delivery, sale, return, or adjustment is successfully
        recorded.
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
