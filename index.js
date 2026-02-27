

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";

// Correctly import named exports from your db module
import { sql, connectToMSSQL, getPool } from "./models/db.js";

import adminRoutes from "./routes/adminRoutes.js";
import { createSuperadminIfNotExist } from "./controllers/adminController.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
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

// --- JWT Verification Middleware ---
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

// --- Routes ---
app.get("/", (req, res) => {
  res.send("✅ RFID Race Logger Backend is running with MSSQL!");
});

app.use("/api/admins", adminRoutes);

app.post("/api/students", verifyToken, async (req, res) => {
  const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
  const createdBy = req.user.email;

  // All validation, then:
  try {
    const pool = getPool();
    const result = await pool.request()
 .input("roll_no", sql.VarChar, rollNo)
 .input("name", sql.VarChar, name)
 .input("age", sql.Int, age)
 .input("tag_id", sql.NVarChar, req.body.tag_id)
 .input("weight", sql.Float, weight)
 .input("contact", sql.VarChar, contact)
 .input("gender", sql.VarChar, gender)
 .input("race", sql.NVarChar, race)
 .input("academy", sql.VarChar, academy)
 .input("student_role", sql.VarChar, studentRole || null)
 .input("created_by", sql.VarChar, createdBy)
 .query(`
   INSERT INTO student_records 
   (roll_no, name, age, tag_id, weight, contact, gender, race, academy, student_role, created_by, created_at)
   OUTPUT INSERTED.*
   VALUES (@roll_no, @name, @age, @tag_id, @weight, @contact, @gender, @race, @academy, @student_role, @created_by, GETDATE())
 `);

    // Parse race before sending back:
    const student = result.recordset[0];

    res.status(201).json({ message: "Student added successfully!", student });
  } catch (err) {
    console.error("Insert Error:", err);
    res.status(500).json({ error: "Database error during insert" });
  }
});

// Get students
app.get("/api/students", verifyToken, async (req, res) => {
  const { role, email } = req.user;
  let query = `SELECT * FROM student_records`;
  
  try {
    const pool = getPool(); // Use the getter
    const request = pool.request();

    if (role === "admin") {
 query += ` WHERE created_by = @created_by`;
 request.input("created_by", sql.VarChar, email);
    } else if (role !== "superadmin") {
 return res.status(403).json({ error: "Unauthorized access" });
    }

    query += ` ORDER BY created_at DESC`;

    const result = await request.query(query);
let jsondata=result['recordsets'];

for(let value of jsondata[0])
{

// // custome date with tag_id
let raceTimeQuery = `
WITH per_tag AS (
    SELECT 
        tag_id,
        MIN(date) AS min_time,
        MAX(date) AS max_time
    FROM IDT401I_Multiport_Reader.dbo.tbltagLogs
    WHERE CAST(date AS DATE) = CAST(GETDATE() AS DATE)
    AND tag_id = '`+value.tag_id+`'
    GROUP BY tag_id
    HAVING COUNT(*) >= 2
)
SELECT
    p.tag_id,
    parts.hours        AS diff_hours,
    parts.minutes      AS diff_minutes,
    parts.seconds      AS diff_seconds,
    parts.milliseconds AS diff_milliseconds
FROM per_tag AS p
CROSS APPLY (
    SELECT diff_ms = DATEDIFF_BIG(millisecond, p.min_time, p.max_time)
) AS ms
CROSS APPLY (
    SELECT
        hours        = ms.diff_ms / 3600000,
        minutes      = (ms.diff_ms % 3600000) / 60000,
        seconds      = (ms.diff_ms % 60000) / 1000,
        milliseconds = ms.diff_ms % 1000
) AS parts
ORDER BY p.tag_id;
`;

  const raceResult = await request.query(raceTimeQuery);
  let racejsondata=raceResult['recordsets'];

const stats=racejsondata[0][0];


if (stats) {
  let differenceTime = `${stats.diff_hours.toString().padStart(2, "0")}:${stats.diff_minutes.toString().padStart(2, "0")}:${stats.diff_seconds.toString().padStart(2, "0")}:${stats.diff_milliseconds.toString().padStart(2, "0").slice(0, 2)}`;
  value.completionTime = differenceTime;
} else {
  value.completionTime = "00:00:00:00";
}
}
    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Database error during fetch" });
  }
});

// ============================================================
// RACE CONFIG — add new races here as needed
// ============================================================
const RACE_CONFIG = {
    "1600m": {
        totalScans:  5,      // 1 start + 4 laps
        totalRounds: 4,
        markingCriteria: (totalSeconds) => {
            if (totalSeconds < 310)  return 20;
            if (totalSeconds <= 330) return 18;
            if (totalSeconds <= 350) return 16;
            if (totalSeconds <= 370) return 14;
            if (totalSeconds <= 390) return 12;
            if (totalSeconds <= 410) return 10;
            if (totalSeconds <= 430) return 8;
            if (totalSeconds <= 450) return 5;
            return 0;
        }
    }
    // Add more races here:
    // "800m":  { totalScans: 3, totalRounds: 2, markingCriteria: (s) => { ... } },
    // "100m":  { totalScans: 2, totalRounds: 1, markingCriteria: (s) => { ... } },
};

// ============================================================
// GET /api/race-students?race=1600m
// Returns all students registered for a race with status:
//   "completed"  — all rounds done today
//   "incomplete" — some rounds done today
//   "DNS"        — did not start today
// ============================================================
app.get("/api/race-students", verifyToken, async (req, res) => {
    const { role, email } = req.user;
    const { race } = req.query;

    // ── Validate race param ──────────────────────────────────
    if (!race) {
        return res.status(400).json({ error: "Query param 'race' is required (e.g. ?race=1600m)" });
    }

    const config = RACE_CONFIG[race];
    if (!config) {
        return res.status(400).json({
            error: `Unsupported race type: '${race}'. Supported: ${Object.keys(RACE_CONFIG).join(", ")}`
        });
    }

    // ── Role guard ───────────────────────────────────────────
    if (role !== "superadmin" && role !== "admin") {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    const { totalScans, totalRounds, markingCriteria } = config;

    try {
        const pool    = getPool();
        const request = pool.request();

        request.input("race_filter", sql.NVarChar, race);

        // ── Optional admin filter ────────────────────────────
        let adminFilter = "";
        if (role === "admin") {
            adminFilter = "AND s.created_by = @created_by";
            request.input("created_by", sql.VarChar, email);
        }

        // ── Main query ───────────────────────────────────────
        // Step 1 : Pull all students whose race JSON array contains the
        //          requested race (e.g. ["1600m"]).
        // Step 2 : LEFT JOIN with today's tag-log scans so DNS students
        //          are still returned (with NULL scan data).
        // Step 3 : Compute round times and total time in SQL; status
        //          logic is applied in JS after the fetch.

        const query = `
            WITH
            -- ── All students registered for this race ──────────────────
            race_students AS (
                SELECT
                    id, roll_no, name, age, weight, contact,
                    gender, race, academy, student_role,
                    created_by, created_at, tag_id
                FROM [zkteco_64n3].[dbo].[student_records] s
                WHERE s.race = @race_filter
                ${adminFilter}
            ),

            -- ── Today's scans from the tag reader ───────────────────────
            ordered_scans AS (
                SELECT
                    tag_id,
                    date,
                    ROW_NUMBER() OVER (PARTITION BY tag_id ORDER BY date ASC) AS rn,
                    LAG(date)    OVER (PARTITION BY tag_id ORDER BY date ASC) AS prev_date
                FROM IDT401I_Multiport_Reader.dbo.tbltagLogs
                WHERE date >= CAST(GETDATE() AS DATE)
                  AND date <  DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
                  AND tag_id IN (SELECT tag_id FROM race_students)   -- only relevant tags
            ),

            -- ── Per-round elapsed time (rn 2..5 for 1600m) ──────────────
            round_calc AS (
                SELECT
                    tag_id,
                    rn,
                    DATEDIFF(MILLISECOND, prev_date, date) AS round_ms
                FROM ordered_scans
                WHERE rn > 1
            ),

            -- ── Pivot: one row per tag with r1..r4 ──────────────────────
            round_pivot AS (
                SELECT
                    tag_id,
                    MAX(CASE WHEN rn = 2 THEN round_ms END) AS r1,
                    MAX(CASE WHEN rn = 3 THEN round_ms END) AS r2,
                    MAX(CASE WHEN rn = 4 THEN round_ms END) AS r3,
                    MAX(CASE WHEN rn = 5 THEN round_ms END) AS r4,
                    COUNT(*)                                 AS rounds_done
                FROM round_calc
                GROUP BY tag_id
            ),

            -- ── Total elapsed time & scan count ─────────────────────────
            scan_summary AS (
                SELECT
                    tag_id,
                    COUNT(*)                                             AS scan_count,
                    DATEDIFF(MILLISECOND, MIN(date), MAX(date))         AS total_ms
                FROM ordered_scans
                GROUP BY tag_id
            )

            -- ── Final SELECT: all race students, LEFT JOIN scan data ─────
            SELECT
                rs.id,
                rs.roll_no,
                rs.name,
                rs.age,
                rs.weight,
                rs.contact,
                rs.gender,
                rs.race,
                rs.academy,
                rs.student_role,
                rs.created_by,
                rs.created_at,
                rs.tag_id,

                -- Scan / round counts (NULL if DNS)
                ISNULL(ss.scan_count,    0)   AS scan_count,
                ISNULL(rp.rounds_done,   0)   AS rounds_done,
                ISNULL(ss.total_ms,      0)   AS total_ms,
                ISNULL(ss.total_ms, 0) / 1000 AS total_seconds,

                -- Formatted times
                FORMAT(DATEADD(MILLISECOND, ISNULL(ss.total_ms, 0), 0), 'HH:mm:ss.fff') AS completionTime,
                FORMAT(DATEADD(MILLISECOND, rp.r1, 0), 'HH:mm:ss.fff')                  AS round1,
                FORMAT(DATEADD(MILLISECOND, rp.r2, 0), 'HH:mm:ss.fff')                  AS round2,
                FORMAT(DATEADD(MILLISECOND, rp.r3, 0), 'HH:mm:ss.fff')                  AS round3,
                FORMAT(DATEADD(MILLISECOND, rp.r4, 0), 'HH:mm:ss.fff')                  AS round4

            FROM race_students rs
            LEFT JOIN scan_summary ss ON rs.tag_id = ss.tag_id
            LEFT JOIN round_pivot  rp ON rs.tag_id = rp.tag_id
            ORDER BY ss.total_ms ASC, rs.roll_no ASC
        `;

        const result = await request.query(query);

        // ── Shape response in JS ─────────────────────────────────────────
        const formatted = result.recordset.map(row => {

            // ── Determine status ─────────────────────────────
            let status;
            if (row.scan_count === 0) {
                status = "DNS";                             // Did Not Start
            } else if (row.scan_count >= totalScans) {
                status = "completed";
            } else {
                status = "incomplete";
            }

            // ── Marks: only for completed students ───────────
            const marks = status === "completed"
                ? markingCriteria(row.total_seconds)
                : 0;

            return {
                id:           row.id,
                roll_no:      row.roll_no,
                name:         row.name,
                age:          row.age,
                weight:       row.weight,
                contact:      row.contact,
                gender:       row.gender,
                race:         row.race,
                academy:      row.academy,
                student_role: row.student_role,
                created_by:   row.created_by,
                created_at:   row.created_at,
                tag_id:       row.tag_id,

                status,                                     // "completed" | "incomplete" | "DNS"
                total_rounds: row.rounds_done,
                total_seconds: row.total_seconds,
                completionTime: row.completionTime,

                round_info: {
                    round1: row.round1 || null,
                    round2: row.round2 || null,
                    round3: row.round3 || null,
                    round4: row.round4 || null
                },

                marks
            };
        });

        res.json(formatted);

    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: "Database error during fetch" });
    }
});

// Delete one student
app.delete("/api/students/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { role, email } = req.user;

  if (!id) return res.status(400).json({ error: "Invalid student ID" });

  try {
    const pool = getPool(); 

    const checkRequest = pool.request().input("id", sql.UniqueIdentifier, id);
    let checkQuery = `SELECT * FROM student_records WHERE id = @id`;

    if (role === "admin") {
 checkQuery += ` AND created_by = @created_by`;
 checkRequest.input("created_by", sql.VarChar, email);
    } else if (role !== "superadmin") {
 return res.status(403).json({ error: "Unauthorized access" });
    }

    const checkResult = await checkRequest.query(checkQuery);
    const student = checkResult.recordset[0];

    if (!student) {
 return res.status(404).json({ error: "Student not found or access denied" });
    }

    if ((student.student_role === "SRPF" || student.student_role === "Police") && role !== "superadmin") {
 return res.status(403).json({ error: "Only superadmin can delete protected student records" });
    }

    // If checks pass, delete the student
    await pool.request()
 .input("id", sql.UniqueIdentifier, id)
 .query(`DELETE FROM student_records WHERE id = @id`);

    res.status(200).json({
 message: `Student '${student.name}' (Roll No: ${student.roll_no}) deleted successfully`,
 deletedStudent: { id: student.id, name: student.name, rollNo: student.roll_no , tagId: student.tag_id },
    });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Database error during deletion" });
  }
});

//Delete All
app.delete("/api/students", verifyToken, async (req, res) => {
  const { role, email } = req.user;
  try {
    const pool = getPool();

    if (role === "superadmin") {
 await pool.request().query(`DELETE FROM student_records`);
 res.status(200).json({ message: "All student records deleted successfully" });

    } else if (role === "admin") {
 await pool
   .request()
   .input("created_by", email)
   .query(`DELETE FROM student_records WHERE created_by = @created_by`);
 res.status(200).json({ message: "All student records created by admin deleted successfully" });

    } else {
 return res.status(403).json({ error: "Only superadmin or admin can delete students" });
    }

  } catch (err) {
    console.error("Delete All Error:", err);
    res.status(500).json({ error: "Database error during deletion of students" });
  }
});

//Update student
app.put("/api/students/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
  const updatedBy = req.user.email;

  if (!rollNo || !name || !age || !tag_id || !weight || !contact || !gender || !race || !academy) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const pool = getPool();
    const result = await pool.request()
 .input("id", sql.UniqueIdentifier, id)
 .input("roll_no", sql.VarChar, rollNo)
 .input("name", sql.VarChar, name)
 .input("age", sql.Int, age)
 .input("tag_id", sql.VarChar, tag_id)
 .input("weight", sql.Float, weight)
 .input("contact", sql.VarChar, contact)
 .input("gender", sql.VarChar, gender)
 .input("race", sql.VarChar, race)
 .input("academy", sql.VarChar, academy)
 .input("student_role", sql.VarChar, studentRole || null)
 .query(`
   UPDATE student_records
SET
  roll_no = @roll_no,
  name = @name,
  age = @age,
  tag_id = @tag_id,
  weight = @weight,
  contact = @contact,
  gender = @gender,
  race = @race,
  academy = @academy,
  student_role = @student_role
OUTPUT INSERTED.*
WHERE id = @id;

 `);

    if (result.recordset.length === 0) {
 return res.status(404).json({ error: "Student not found." });
    }

    res.status(200).json({
 message: "Student updated successfully!",
 student: result.recordset[0],
    });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: "Database error during update" });
  }
});



// --- Server Startup ---
const startServer = async () => {
    try {
   // 1. Connect to the database
   await connectToMSSQL();

   // 2. Initialize superadmin after DB is connected
   await createSuperadminIfNotExist(getPool());

   // 3. Start the Express server
   app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
   });
    } catch (error) {
   console.error("❌ Failed to start server:", error.message);
   process.exit(1); // Exit if the database connection fails
    }
};

startServer();

// --- Graceful Shutdown ---
process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down...");
  const pool = getPool();
  if (pool) await pool.close();
  process.exit(0);
}); 

