import mysql from "mysql2/promise";

// Singleton — survives Next.js hot-reloads in dev, preventing "Too many connections"
const g = globalThis as unknown as { paymentPool?: mysql.Pool };

export function getPaymentDb(): mysql.Pool {
  if (!g.paymentPool) {
    g.paymentPool = mysql.createPool({
      host: process.env.PAYMENT_DB_HOST || "127.0.0.1",
      port: parseInt(process.env.PAYMENT_DB_PORT || "3307"),
      user: process.env.PAYMENT_DB_USER,
      password: process.env.PAYMENT_DB_PASSWORD,
      database: process.env.PAYMENT_DB_NAME || "payment",
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 10,
      timezone: "Z",
      dateStrings: false,
    });
  }
  return g.paymentPool;
}
