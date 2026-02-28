

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
    const {
        rollNo,
        name,
        age,
        tag_id,
        weight,
        contact,
        gender,
        race,
        running_ground,   // ✅ Added
        academy,
        studentRole
    } = req.body;

    const createdBy = req.user.email;

    try {
        const pool = getPool();

        const result = await pool.request()
            .input("roll_no", sql.VarChar, rollNo)
            .input("name", sql.VarChar, name)
            .input("age", sql.Int, age)
            .input("tag_id", sql.NVarChar, tag_id)
            .input("weight", sql.Float, weight)
            .input("contact", sql.VarChar, contact)
            .input("gender", sql.VarChar, gender)
            .input("race", sql.NVarChar, race)
            .input("running_ground", sql.NVarChar, running_ground || race) // ✅ if null use race
            .input("academy", sql.VarChar, academy)
            .input("student_role", sql.VarChar, studentRole || null)
            .input("created_by", sql.VarChar, createdBy)
            .query(`
                INSERT INTO student_records
                (roll_no, name, age, tag_id, weight, contact, gender, race, running_ground, academy, student_role, created_by, created_at)
                    OUTPUT INSERTED.*
                VALUES
                    (@roll_no, @name, @age, @tag_id, @weight, @contact, @gender, @race, @running_ground, @academy, @student_role, @created_by, GETDATE())
            `);

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

app.get("/api/race-students", verifyToken, async (req, res) => {
    const { role, email } = req.user;
    const { race } = req.query;

    if (!race) {
        return res.status(400).json({
            error: "Query param 'race' is required (e.g. ?race=1600m)"
        });
    }

    if (role !== "superadmin" && role !== "admin") {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    try {
        const pool = getPool();
        const request = pool.request();
        request.input("race_filter", sql.NVarChar, race);

        let adminFilter = "";
        if (role === "admin") {
            adminFilter = "AND s.created_by = @created_by";
            request.input("created_by", sql.VarChar, email);
        }

        const query = `
            WITH
            -- ── 1. Students enrolled in the selected race ──────────────────
            race_students AS (
                SELECT
                    id, roll_no, name, age, weight, contact,
                    gender, race, running_ground, academy, student_role,
                    created_by, created_at, tag_id
                FROM [zkteco_64n3].[dbo].[student_records] s
                WHERE s.race = @race_filter
                ${adminFilter}
            ),

            -- ── 2. Per-student scan/round config from race × running_ground ─
            --   Special rule: 1600m on 800m ground → only 2 scans (token carry)
            --   All others:   required_scans = (race / ground) + 1
            --                 required_rounds = (race / ground)
            race_config AS (
                SELECT
                    tag_id,
                    running_ground,
                    CASE
                        WHEN race = '1600m' AND running_ground = '200m'  THEN 9   -- 8 rounds
                        WHEN race = '1600m' AND running_ground = '400m'  THEN 5   -- 4 rounds
                        WHEN race = '1600m' AND running_ground = '800m'  THEN 2   -- 2 rounds, token carry (no mid scan)
                        WHEN race = '1600m' AND running_ground = '1600m' THEN 2   -- 1 round
                        WHEN race = '800m'  AND running_ground = '400m'  THEN 3   -- 2 rounds
                        WHEN race = '800m'  AND running_ground = '800m'  THEN 2   -- 1 round
                        WHEN race = '100m'  AND running_ground = '100m'  THEN 2   -- 1 round
                        ELSE -- Generic fallback: scans = (race_m / ground_m) + 1
                            CAST(
                                CAST(REPLACE(race, 'm', '') AS FLOAT)
                                / NULLIF(CAST(REPLACE(running_ground, 'm', '') AS FLOAT), 0)
                            AS INT) + 1
                    END AS required_scans,
                    CASE
                        WHEN race = '1600m' AND running_ground = '200m'  THEN 8
                        WHEN race = '1600m' AND running_ground = '400m'  THEN 4
                        WHEN race = '1600m' AND running_ground = '800m'  THEN 2   -- token carry still = 2 rounds
                        WHEN race = '1600m' AND running_ground = '1600m' THEN 1
                        WHEN race = '800m'  AND running_ground = '400m'  THEN 2
                        WHEN race = '800m'  AND running_ground = '800m'  THEN 1
                        WHEN race = '100m'  AND running_ground = '100m'  THEN 1
                        ELSE -- Generic fallback: rounds = (race_m / ground_m)
                            CAST(
                                CAST(REPLACE(race, 'm', '') AS FLOAT)
                                / NULLIF(CAST(REPLACE(running_ground, 'm', '') AS FLOAT), 0)
                            AS INT)
                    END AS required_rounds
                FROM race_students
            ),

            -- ── 3. All today's scans, numbered per tag (unlimited) ──────────
            ordered_scans AS (
                SELECT
                    tag_id,
                    date,
                    ROW_NUMBER() OVER (PARTITION BY tag_id ORDER BY date ASC) AS rn
                FROM IDT401I_Multiport_Reader.dbo.tbltagLogs
                WHERE date >= CAST(GETDATE() AS DATE)
                  AND date <  DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
                  AND tag_id IN (SELECT tag_id FROM race_students)
            ),

            -- ── 4. Cap scans per student at their required_scans ────────────
            limited_scans AS (
                SELECT os.tag_id, os.date, os.rn
                FROM ordered_scans os
                JOIN race_config rc ON os.tag_id = rc.tag_id
                WHERE os.rn <= rc.required_scans          -- ← dynamic per student
            ),

            -- ── 5. Gap between consecutive scans = one round time ──────────
            round_calc AS (
                SELECT
                    tag_id,
                    rn,
                    DATEDIFF(MILLISECOND,
                        LAG(date) OVER (PARTITION BY tag_id ORDER BY rn),
                        date) AS round_ms
                FROM limited_scans
            ),

            -- ── 6. Pivot up to 10 rounds ────────────────────────────────────
            round_pivot AS (
                SELECT
                    tag_id,
                    MAX(CASE WHEN rn = 2  THEN round_ms END) AS r1,
                    MAX(CASE WHEN rn = 3  THEN round_ms END) AS r2,
                    MAX(CASE WHEN rn = 4  THEN round_ms END) AS r3,
                    MAX(CASE WHEN rn = 5  THEN round_ms END) AS r4,
                    MAX(CASE WHEN rn = 6  THEN round_ms END) AS r5,
                    MAX(CASE WHEN rn = 7  THEN round_ms END) AS r6,
                    MAX(CASE WHEN rn = 8  THEN round_ms END) AS r7,
                    MAX(CASE WHEN rn = 9  THEN round_ms END) AS r8,
                    MAX(CASE WHEN rn = 10 THEN round_ms END) AS r9,
                    MAX(CASE WHEN rn = 11 THEN round_ms END) AS r10,
                    COUNT(*) - 1 AS rounds_done
                FROM round_calc
                GROUP BY tag_id
            ),

            -- ── 7. Total scan count + total elapsed ms per tag ──────────────
            scan_summary AS (
                SELECT
                    tag_id,
                    COUNT(*)                                        AS scan_count,
                    DATEDIFF(MILLISECOND, MIN(date), MAX(date))    AS total_ms
                FROM limited_scans
                GROUP BY tag_id
            )

            -- ── 8. Final SELECT ─────────────────────────────────────────────
            SELECT
                rs.id,
                rs.roll_no,
                rs.name,
                rs.age,
                rs.weight,
                rs.contact,
                rs.gender,
                rs.race,
                rs.running_ground,
                rs.academy,
                rs.student_role,
                rs.created_by,
                rs.created_at,
                rs.tag_id,

                rc.required_scans,
                rc.required_rounds,

                ISNULL(ss.scan_count, 0)        AS scan_count,
                ISNULL(rp.rounds_done, 0)        AS rounds_done,
                ISNULL(ss.total_ms, 0)           AS total_ms,
                ISNULL(ss.total_ms, 0) / 1000    AS total_seconds,

                FORMAT(DATEADD(MILLISECOND, ISNULL(ss.total_ms, 0), 0), 'HH:mm:ss.fff') AS completionTime,

                -- Round times (up to 10)
                FORMAT(DATEADD(MILLISECOND, rp.r1,  0), 'HH:mm:ss.fff') AS round1,
                FORMAT(DATEADD(MILLISECOND, rp.r2,  0), 'HH:mm:ss.fff') AS round2,
                FORMAT(DATEADD(MILLISECOND, rp.r3,  0), 'HH:mm:ss.fff') AS round3,
                FORMAT(DATEADD(MILLISECOND, rp.r4,  0), 'HH:mm:ss.fff') AS round4,
                FORMAT(DATEADD(MILLISECOND, rp.r5,  0), 'HH:mm:ss.fff') AS round5,
                FORMAT(DATEADD(MILLISECOND, rp.r6,  0), 'HH:mm:ss.fff') AS round6,
                FORMAT(DATEADD(MILLISECOND, rp.r7,  0), 'HH:mm:ss.fff') AS round7,
                FORMAT(DATEADD(MILLISECOND, rp.r8,  0), 'HH:mm:ss.fff') AS round8,
                FORMAT(DATEADD(MILLISECOND, rp.r9,  0), 'HH:mm:ss.fff') AS round9,
                FORMAT(DATEADD(MILLISECOND, rp.r10, 0), 'HH:mm:ss.fff') AS round10,

                -- Marks: only awarded when all required scans are present
                CASE
                    WHEN ISNULL(ss.scan_count, 0) >= rc.required_scans
                        THEN ISNULL(mc.marks, 0)
                    ELSE 0
                    END AS marks
            
            FROM race_students rs
            JOIN  race_config rc ON rs.tag_id = rc.tag_id
            LEFT JOIN scan_summary ss ON rs.tag_id = ss.tag_id
            LEFT JOIN round_pivot  rp ON rs.tag_id = rp.tag_id
            LEFT JOIN [zkteco_64n3].[dbo].[student_marks_criteria] mc
            ON  mc.gender   = rs.gender
                AND mc.post     = rs.student_role
                AND mc.distance = rs.race
                AND FLOOR(ISNULL(ss.total_ms, 0) / 1000.0)
                BETWEEN mc.min_seconds AND mc.max_seconds

            ORDER BY ss.total_ms ASC, rs.roll_no ASC;
        `;

        const result = await request.query(query);

        const formatted = result.recordset.map(row => {
            // Status uses per-student required_scans from DB
            let status;
            if (row.scan_count === 0) {
                status = "DNS";
            } else if (row.scan_count >= row.required_scans) {
                status = "completed";
            } else {
                status = "incomplete";
            }

            // Build round_info dynamically — only include rounds that exist
            const round_info = {};
            for (let i = 1; i <= 10; i++) {
                const val = row[`round${i}`];
                if (val) round_info[`round${i}`] = val;
            }

            return {
                id:             row.id,
                roll_no:        row.roll_no,
                name:           row.name,
                age:            row.age,
                weight:         row.weight,
                contact:        row.contact,
                gender:         row.gender,
                race:           row.race,
                running_ground: row.running_ground,
                academy:        row.academy,
                student_role:   row.student_role,
                created_by:     row.created_by,
                created_at:     row.created_at,
                tag_id:         row.tag_id,

                required_scans:  row.required_scans,
                required_rounds: row.required_rounds,

                status,
                total_rounds:   row.rounds_done,
                total_seconds:  row.total_seconds,
                completionTime: row.completionTime,

                round_info,   // only populated rounds included

                marks: row.marks
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

