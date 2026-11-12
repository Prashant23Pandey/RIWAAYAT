import { listOrders } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders — EMERGENCE admin",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { password } = await searchParams;
  const expected = process.env.ADMIN_PASSWORD || "changeme";

  if (password !== expected) {
    return (
      <div className="admin-body">
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Orders</h1>
        <form method="get">
          <input
            type="password"
            name="password"
            placeholder="Admin password"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              marginRight: 8,
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              background: "#111",
              color: "#fff",
              border: 0,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Open
          </button>
        </form>
        <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
          Set the <code>ADMIN_PASSWORD</code> environment variable to change the
          password (defaults to &quot;changeme&quot;).
        </p>
      </div>
    );
  }

  const orders = listOrders();

  return (
    <div className="admin-body">
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>
        Orders <span style={{ color: "#888", fontWeight: 400 }}>({orders.length})</span>
      </h1>
      {orders.length === 0 ? (
        <p style={{ fontSize: 14, color: "#666" }}>No orders yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date (UTC)</th>
              <th>Page</th>
              <th>Product</th>
              <th>Size</th>
              <th>Name</th>
              <th>Address</th>
              <th>Postal code</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Delivery</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.created_at}</td>
                <td>{o.page}</td>
                <td>{o.product}</td>
                <td>{o.size || "—"}</td>
                <td>{o.name || "—"}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{o.address || "—"}</td>
                <td>{o.postal_code || "—"}</td>
                <td>{o.phone || "—"}</td>
                <td>{o.email || "—"}</td>
                <td>{o.delivery || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
