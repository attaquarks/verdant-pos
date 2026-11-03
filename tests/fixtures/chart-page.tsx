import { CategoryChart, RevenueChart } from "@/components/charts";

const shortDates = [
  "2025-01-01",
  "2025-02-02",
  "2025-03-03",
  "2025-04-04",
  "2025-05-05",
  "2025-06-06",
].map((date, i) => ({ date, revenue: ["20.00", "-4.50", "37.30", "0.00", "12.75", "9.95"][i] }));
const longDates = shortDates.map((p, i) => ({
  ...p,
  revenue: [
    "1234567890.12",
    "-543210987.65",
    "100000000.01",
    "0.00",
    "121212121.12",
    "999999999.99",
  ][i],
}));
export default function ChartFixture() {
  return (
    <main style={{ padding: "20px 18px", maxWidth: 600, margin: "auto" }}>
      <h1>Chart fixture</h1>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Short revenue</h2>
        <RevenueChart data={shortDates} currency="USD" />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Short categories</h2>
        <CategoryChart
          currency="USD"
          data={[
            { category: "Tea", revenue: "37.30" },
            { category: "Soap", revenue: "-4.50" },
            { category: "Rice", revenue: "20.00" },
            { category: "Zero", revenue: "0.00" },
          ]}
        />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Long revenue</h2>
        <RevenueChart data={longDates} currency="USD" />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Long categories</h2>
        <CategoryChart
          currency="USD"
          data={[
            {
              category: "Household cleaning and personal care essentials",
              revenue: "1234567890.12",
            },
            { category: "گھریلو صفائی اور روزمرہ استعمال کی اشیاء", revenue: "-543210987.65" },
            { category: "UnbrokenCategoryNameWithExtraLongWords", revenue: "90071992547409.91" },
          ]}
        />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Category limit</h2>
        <CategoryChart
          currency="USD"
          data={Array.from({ length: 7 }, (_, i) => ({
            category: `Group ${i + 1}`,
            revenue: `${i + 1}.00`,
          }))}
        />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>PKR revenue</h2>
        <RevenueChart data={longDates} currency="PKR" />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>PKR categories</h2>
        <CategoryChart
          currency="PKR"
          data={[
            { category: "مصالحے", revenue: "1234567890.12" },
            { category: "Everyday food", revenue: "-543210987.65" },
          ]}
        />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Empty revenue</h2>
        <RevenueChart data={[]} currency="USD" />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Empty categories</h2>
        <CategoryChart data={[]} currency="USD" />
      </section>
      <section style={{ border: "1px solid var(--line)", minWidth: 0 }}>
        <h2>Zero categories</h2>
        <CategoryChart
          currency="USD"
          data={Array.from({ length: 7 }, (_, i) => ({
            category: `Zero group ${i + 1}`,
            revenue: i === 6 ? "1.00" : "0.00",
          }))}
        />
      </section>
    </main>
  );
}
