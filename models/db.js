//db.js
import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool;

const connectToMSSQL = async () => {
  if (!pool) {
    try {
      pool = await sql.connect(dbConfig);
      console.log("✅ Connected to Microsoft SQL Server");
    } catch (err) {
      console.error("❌ MSSQL connection error:", err);
      // Re-throw the error to be caught by the server startup logic
      throw err;
    }
  }
  return pool;
};

// Getter to safely access the initialized pool
const getPool = () => {
  if (!pool) {
    throw new Error("❌ Database not connected. Call connectToMSSQL() first.");
  }
  return pool;
};

// Export the named functions and the sql object itself for use in other files
export { sql, connectToMSSQL, getPool };