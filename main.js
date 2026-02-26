import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";

// --- Import the connection logic from your db.js ---
import { connectToMSSQL, getPool, sql } from "./models/db.js"; // Import sql too if needed for data types

import adminRoutes from "./routes/adminRoutes.js";
import { createSuperadminIfNotExist } from "./controllers/adminController.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "https://academyracetiming.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Health check
app.get("/", (req, res) => {
  res.send("✅ RFID Race Logger Backend is running with MSSQL!");
});

// Admin routes
app.use("/api/admins", adminRoutes);

// Add student
app.post("/api/students", verifyToken, async (req, res) => {
  const {
    rollNo,
    name,
    age,
    weight,
    contact,
    gender,
    race,
    academy,
    studentRole,
  } = req.body;
  const createdBy = req.user.email;

  if (
    !rollNo || !name || !age || !weight ||
    !contact || !gender || !race || !academy
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const pool = getPool(); // Get the already connected pool

    const result = await pool.request()
      .input("roll_no", sql.VarChar, rollNo)
      .input("name", sql.VarChar, name)
      .input("age", sql.Int, age)
      .input("weight", sql.Float, weight)
      .input("contact", sql.VarChar, contact)
      .input("gender", sql.VarChar, gender)
      .input("race", sql.VarChar, race)
      .input("academy", sql.VarChar, academy)
      .input("student_role", sql.VarChar, studentRole || null)
      .input("created_by", sql.VarChar, createdBy)
      .query(`
        INSERT INTO student_records
        (roll_no, name, age, weight, contact, gender, race, academy, student_role, created_by, created_at)
        OUTPUT INSERTED.*
        VALUES (@roll_no, @name, @age, @weight, @contact, @gender, @race, @academy, @student_role, @created_by, GETDATE())
      `);

    res.status(201).json({
      message: "Student added successfully!",
      student: result.recordset[0],
    });
  } catch (err) {
    console.error("Insert Error:", err);
    res.status(500).json({ error: "Database error during insert" });
  }
});

// Get students
app.get("/api/students", verifyToken, async (req, res) => {
  const { role, email } = req.user;

  let query = `SELECT * FROM student_records`;
  const pool = getPool(); // Get the already connected pool
  const request = pool.request();

  if (role === "admin") {
    query += ` WHERE created_by = @created_by`;
    request.input("created_by", sql.VarChar, email);
  } else if (role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  query += ` ORDER BY created_at DESC`;

  try {
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Database error during fetch" });
  }
});

// Delete student
app.delete("/api/students/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { role, email } = req.user;

  if (!id) return res.status(400).json({ error: "Invalid student ID" });

  try {
    const pool = getPool(); // Get the already connected pool

    let checkQuery = `SELECT * FROM student_records WHERE id = @id`;
    const checkRequest = pool.request().input("id", sql.Int, id);

    if (role === "admin") {
      checkQuery += ` AND created_by = @created_by`;
      checkRequest.input("created_by", sql.VarChar, email);
    } else if (role !== "superadmin") {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    const checkResult = await checkRequest.query(checkQuery);
    const student = checkResult.recordset[0];

    if (!student) {
      return res.status(404).json({
        error: "Student not found or access denied",
      });
    }

    if (
      (student.student_role === "SRPF" || student.student_role === "Police") &&
      role !== "superadmin"
    ) {
      return res.status(403).json({
        error: "Only superadmin can delete protected student records",
      });
    }

    await pool.request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM student_records WHERE id = @id`);

    res.status(200).json({
      message: `Student '${student.name}' (Roll No: ${student.roll_no}) deleted successfully`,
      deletedStudent: {
        id: student.id,
        name: student.name,
        rollNo: student.roll_no,
      },
    });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Database error during deletion" });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Something went wrong!" });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down...");
  const pool = getPool(); // Get the pool to close it
  if (pool) {
    await pool.close();
  }
  process.exit(0);
});

// --- Start the server after database connection ---
async function startApplication() {
  try {
    // Establish database connection using the centralized function
    await connectToMSSQL();
    console.log("Superadmin Check/Creation:");
    // Pass the pool from db.js to createSuperadminIfNotExist
    await createSuperadminIfNotExist(getPool());

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start application:", error);
    process.exit(1); // Exit if the database connection or superadmin creation fails
  }
}

startApplication();