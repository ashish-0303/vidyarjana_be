// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import helmet from "helmet";
// import morgan from "morgan";
// import jwt from "jsonwebtoken";

// // Correctly import named exports from your db module
// import { sql, connectToMSSQL, getPool } from "./models/db.js";

// import adminRoutes from "./routes/adminRoutes.js";
// import { createSuperadminIfNotExist } from "./controllers/adminController.js";

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 5000;

// // --- Middleware ---
// app.use(helmet());
// app.use(morgan("combined"));
// app.use(express.json());

// const allowedOrigins = [
//   process.env.FRONTEND_URL,
//   "http://localhost:3000",
//   "https://academyracetiming.com",
// ];

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true,
//   })
// );

// // --- JWT Verification Middleware ---
// const verifyToken = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "Token required" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     res.status(401).json({ error: "Invalid token" });
//   }
// };

// // --- Routes ---
// app.get("/", (req, res) => {
//   res.send("✅ RFID Race Logger Backend is running with MSSQL!");
// });

// app.use("/api/admins", adminRoutes);

// // Add student
// // app.post("/api/students", verifyToken, async (req, res) => {
// //   const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
// //   const createdBy = req.user.email;

// //   if (!rollNo || !name || !age || !tag_id || !weight || !contact || !gender || !race || !academy) {
// //     return res.status(400).json({ error: "All fields are required." });
// //   }

// //   try {
// //     const pool = getPool(); // Use the getter to access the pool
// //     const result = await pool.request()
// //       .input("roll_no", sql.VarChar, rollNo)
// //       .input("name", sql.VarChar, name)
// //       .input("age", sql.Int, age)
// //       .input("tag_id", sql.VarChar, tag_id)
// //       .input("weight", sql.Float, weight)
// //       .input("contact", sql.VarChar, contact)
// //       .input("gender", sql.VarChar, gender)
// //       .input("race", sql.NVarChar, race)
// //       .input("academy", sql.VarChar, academy)
// //       .input("student_role", sql.VarChar, studentRole || null)
// //       .input("created_by", sql.VarChar, createdBy)
// //       .query(`
// //         INSERT INTO student_records (roll_no, name, age, tag_id, weight, contact, gender, race, academy, student_role, created_by, created_at)
// //         OUTPUT INSERTED.*
// //         VALUES (@roll_no, @name, @age, @tag_id, @weight, @contact, @gender, @race, @academy, @student_role, @created_by, GETDATE())
// //       `);

// //     res.status(201).json({
// //       message: "Student added successfully!",
// //       student: result.recordset[0],
// //     });
// //   } catch (err) {
// //     console.error("Insert Error:", err);
// //     res.status(500).json({ error: "Database error during insert" });
// //   }
// // });

// app.post("/api/students", verifyToken, async (req, res) => {
//   const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
//   const createdBy = req.user.email;

//   // All validation, then:
//   try {
//     const pool = getPool();
//     const result = await pool.request()
//       .input("roll_no", sql.VarChar, rollNo)
//       .input("name", sql.VarChar, name)
//       .input("age", sql.Int, age)
//       .input("tag_id", sql.NVarChar, req.body.tag_id)
//       .input("weight", sql.Float, weight)
//       .input("contact", sql.VarChar, contact)
//       .input("gender", sql.VarChar, gender)
//       .input("race", sql.NVarChar, JSON.stringify(race))
//       .input("academy", sql.VarChar, academy)
//       .input("student_role", sql.VarChar, studentRole || null)
//       .input("created_by", sql.VarChar, createdBy)
//       .query(`
//         INSERT INTO student_records 
//         (roll_no, name, age, tag_id, weight, contact, gender, race, academy, student_role, created_by, created_at)
//         OUTPUT INSERTED.*
//         VALUES (@roll_no, @name, @age, @tag_id, @weight, @contact, @gender, @race, @academy, @student_role, @created_by, GETDATE())
//       `);

//     // Parse race before sending back:
//     const student = result.recordset[0];
//     student.race = JSON.parse(student.race);

//     res.status(201).json({ message: "Student added successfully!", student });
//   } catch (err) {
//     console.error("Insert Error:", err);
//     res.status(500).json({ error: "Database error during insert" });
//   }
// });

// // Get students
// app.get("/api/students", verifyToken, async (req, res) => {
//   const { role, email } = req.user;
//   let query = `SELECT * FROM student_records`;
  
//   try {
//     const pool = getPool(); // Use the getter
//     const request = pool.request();

//     if (role === "admin") {
//       query += ` WHERE created_by = @created_by`;
//       request.input("created_by", sql.VarChar, email);
//     } else if (role !== "superadmin") {
//       return res.status(403).json({ error: "Unauthorized access" });
//     }

//     query += ` ORDER BY created_at DESC`;

//     const result = await request.query(query);
// //     for (let value of result) {
// //   console.log(value);
// // }
// let jsondata=result['recordsets'];
// console.log(jsondata[0].length);

// for(let value of jsondata[0])
// {
//   console.log(value.tag_id);
// }



// // for (const key of Object.keys(result)) {
// //   console.log(key, result[key]);
// //   console.log(result[key].tag_id);
// // }
//     res.json(result.recordset);
//   } catch (err) {
//     console.error("Fetch Error:", err);
//     res.status(500).json({ error: "Database error during fetch" });
//   }
// });

// // Delete one student
// app.delete("/api/students/:id", verifyToken, async (req, res) => {
//   const { id } = req.params;
//   const { role, email } = req.user;

//   if (!id) return res.status(400).json({ error: "Invalid student ID" });

//   try {
//     const pool = getPool(); 

//     const checkRequest = pool.request().input("id", sql.UniqueIdentifier, id);
//     let checkQuery = `SELECT * FROM student_records WHERE id = @id`;

//     if (role === "admin") {
//       checkQuery += ` AND created_by = @created_by`;
//       checkRequest.input("created_by", sql.VarChar, email);
//     } else if (role !== "superadmin") {
//       return res.status(403).json({ error: "Unauthorized access" });
//     }

//     const checkResult = await checkRequest.query(checkQuery);
//     const student = checkResult.recordset[0];

//     if (!student) {
//       return res.status(404).json({ error: "Student not found or access denied" });
//     }

//     if ((student.student_role === "SRPF" || student.student_role === "Police") && role !== "superadmin") {
//       return res.status(403).json({ error: "Only superadmin can delete protected student records" });
//     }

//     // If checks pass, delete the student
//     await pool.request()
//       .input("id", sql.UniqueIdentifier, id)
//       .query(`DELETE FROM student_records WHERE id = @id`);

//     res.status(200).json({
//       message: `Student '${student.name}' (Roll No: ${student.roll_no}) deleted successfully`,
//       deletedStudent: { id: student.id, name: student.name, rollNo: student.roll_no , tagId: student.tag_id },
//     });
//   } catch (err) {
//     console.error("Delete Error:", err);
//     res.status(500).json({ error: "Database error during deletion" });
//   }
// });

// //Delete All
// app.delete("/api/students", verifyToken, async (req, res) => {
//   const { role, email } = req.user;
//   try {
//     const pool = getPool();

//     if (role === "superadmin") {
//       await pool.request().query(`DELETE FROM student_records`);
//       res.status(200).json({ message: "All student records deleted successfully" });

//     } else if (role === "admin") {
//       await pool
//         .request()
//         .input("created_by", email)
//         .query(`DELETE FROM student_records WHERE created_by = @created_by`);
//       res.status(200).json({ message: "All student records created by admin deleted successfully" });

//     } else {
//       return res.status(403).json({ error: "Only superadmin or admin can delete students" });
//     }

//   } catch (err) {
//     console.error("Delete All Error:", err);
//     res.status(500).json({ error: "Database error during deletion of students" });
//   }
// });

// //Update student
// app.put("/api/students/:id", verifyToken, async (req, res) => {
//   const { id } = req.params;
//   const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
//   const updatedBy = req.user.email;

//   if (!rollNo || !name || !age || !tag_id || !weight || !contact || !gender || !race || !academy) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   try {
//     const pool = getPool();
//     const result = await pool.request()
//       .input("id", sql.UniqueIdentifier, id)
//       .input("roll_no", sql.VarChar, rollNo)
//       .input("name", sql.VarChar, name)
//       .input("age", sql.Int, age)
//       .input("tag_id", sql.VarChar, tag_id)
//       .input("weight", sql.Float, weight)
//       .input("contact", sql.VarChar, contact)
//       .input("gender", sql.VarChar, gender)
//       .input("race", sql.VarChar, race)
//       .input("academy", sql.VarChar, academy)
//       .input("student_role", sql.VarChar, studentRole || null)
//       .query(`
//         UPDATE student_records
// SET
//   roll_no = @roll_no,
//   name = @name,
//   age = @age,
//   tag_id = @tag_id,
//   weight = @weight,
//   contact = @contact,
//   gender = @gender,
//   race = @race,
//   academy = @academy,
//   student_role = @student_role
// OUTPUT INSERTED.*
// WHERE id = @id;

//       `);

//     if (result.recordset.length === 0) {
//       return res.status(404).json({ error: "Student not found." });
//     }

//     res.status(200).json({
//       message: "Student updated successfully!",
//       student: result.recordset[0],
//     });
//   } catch (err) {
//     console.error("Update Error:", err);
//     res.status(500).json({ error: "Database error during update" });
//   }
// });



// // --- Server Startup ---
// const startServer = async () => {
//     try {
//         // 1. Connect to the database
//         await connectToMSSQL();

//         // 2. Initialize superadmin after DB is connected
//         await createSuperadminIfNotExist(getPool());

//         // 3. Start the Express server
//         app.listen(PORT, () => {
//             console.log(`🚀 Server running on http://localhost:${PORT}`);
//         });
//     } catch (error) {
//         console.error("❌ Failed to start server:", error.message);
//         process.exit(1); // Exit if the database connection fails
//     }
// };

// startServer();

// // --- Graceful Shutdown ---
// process.on("SIGTERM", async () => {
//   console.log("🛑 Shutting down...");
//   const pool = getPool();
//   if (pool) await pool.close();
//   process.exit(0);
// }); 

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

// Add student
// app.post("/api/students", verifyToken, async (req, res) => {
//   const { rollNo, name, age, tag_id, weight, contact, gender, race, academy, studentRole } = req.body;
//   const createdBy = req.user.email;

//   if (!rollNo || !name || !age || !tag_id || !weight || !contact || !gender || !race || !academy) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   try {
//     const pool = getPool(); // Use the getter to access the pool
//     const result = await pool.request()
//  .input("roll_no", sql.VarChar, rollNo)
//  .input("name", sql.VarChar, name)
//  .input("age", sql.Int, age)
//  .input("tag_id", sql.VarChar, tag_id)
//  .input("weight", sql.Float, weight)
//  .input("contact", sql.VarChar, contact)
//  .input("gender", sql.VarChar, gender)
//  .input("race", sql.NVarChar, race)
//  .input("academy", sql.VarChar, academy)
//  .input("student_role", sql.VarChar, studentRole || null)
//  .input("created_by", sql.VarChar, createdBy)
//  .query(`
//    INSERT INTO student_records (roll_no, name, age, tag_id, weight, contact, gender, race, academy, student_role, created_by, created_at)
//    OUTPUT INSERTED.*
//    VALUES (@roll_no, @name, @age, @tag_id, @weight, @contact, @gender, @race, @academy, @student_role, @created_by, GETDATE())
//  `);

//     res.status(201).json({
//  message: "Student added successfully!",
//  student: result.recordset[0],
//     });
//   } catch (err) {
//     console.error("Insert Error:", err);
//     res.status(500).json({ error: "Database error during insert" });
//   }
// });

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
 .input("race", sql.NVarChar, JSON.stringify(race))
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
    student.race = JSON.parse(student.race);

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
//     for (let value of result) {
//   console.log(value);
// }
let jsondata=result['recordsets'];
console.log(jsondata[0].length);

for(let value of jsondata[0])
{ 
  console.log(value.tag_id);
  // for today
//   let raceTimeQuery=`WITH per_card AS (
//     SELECT 
//         pin,
//         MIN(create_time) AS min_time,
//         MAX(create_time) AS max_time
//     FROM zkbiocvsecurity.dbo.acc_transaction
//     WHERE CAST(create_time AS DATE) = CAST(GETDATE() AS DATE)
//       AND pin = '`+value.tag_id+`'
//     GROUP BY pin , CAST(create_time AS DATE)
// )e 
// SELECT
//     parts.hours        AS diff_hours,
//     parts.minutes      AS diff_minutes,
//     parts.seconds      AS diff_seconds,
//     parts.milliseconds AS diff_milliseconds
// FROM per_card AS p
// CROSS APPLY (
//     SELECT diff_ms = DATEDIFF_BIG(millisecond, p.min_time, p.max_time)
// ) AS ms
// CROSS APPLY (
//     SELECT
//         hours        = ms.diff_ms / 3600000,
//         minutes      = (ms.diff_ms % 3600000) / 60000,
//         seconds      = (ms.diff_ms % 60000) / 1000,
//         milliseconds = ms.diff_ms % 1000
// ) AS parts
// ORDER BY p.pin;`;


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

// For custome date 
//   let raceTimeQuery = `WITH per_card AS (
//     SELECT 
//         card_no,
//         MIN(create_time) AS min_time,
//         MAX(create_time) AS max_time
//     FROM zkbiocvsecurity.dbo.acc_transaction
//     WHERE CONVERT(date, create_time, 103) = '2025-08-11'
//     GROUP BY card_no
// )
// SELECT
//     p.card_no,
//     p.min_time,
//     p.max_time,
//     parts.hours        AS diff_hours,
//     parts.minutes      AS diff_minutes,
//     parts.seconds      AS diff_seconds,
//     parts.milliseconds AS diff_milliseconds
// FROM per_card AS p
// CROSS APPLY (
//     SELECT diff_ms = DATEDIFF_BIG(millisecond, p.min_time, p.max_time)
// ) AS ms
// CROSS APPLY ( 
//     SELECT
//         hours        = ms.diff_ms / 3600000,
//         minutes      = (ms.diff_ms % 3600000) / 60000,
//         seconds      = (ms.diff_ms % 60000) / 1000,
//         milliseconds = ms.diff_ms % 1000
// ) AS parts
// ORDER BY p.card_no;`

// console.log(raceTimeQuery);
  const raceResult = await request.query(raceTimeQuery);
  let racejsondata=raceResult['recordsets'];
// console.log(racejsondata);
// console.log(racejsondata[0][0]);

// let raceStats = racejsondata[0][0];
// if (raceStats) {
//   let differenceTime = raceStats.diff_hours + ":" + raceStats.diff_minutes + ":" + raceStats.diff_seconds + ":" + raceStats.diff_milliseconds;
//   value.differenceTime = differenceTime;
// } else {
//   value.differenceTime = "00:00:00:000"; // or null, or any default you prefer
// }
// const stats = racejsondata[0][0];
const stats=racejsondata[0][0];
console.log(stats);
// let differenceTime = `$[stats.diff_hours]`;
// let differenceTime=racejsondata[0][0].diff_hours+":"+racejsondata[0][0].diff_minutes+":"+racejsondata[0][0].diff_seconds+":"+racejsondata[0][0].diff_milliseconds;


// let differenceTime = `${stats.diff_hours}:${stats.diff_minutes}:${stats.diff_seconds}:${stats.diff_milliseconds}`;
if (stats) {
  let differenceTime = `${stats.diff_hours.toString().padStart(2, "0")}:${stats.diff_minutes.toString().padStart(2, "0")}:${stats.diff_seconds.toString().padStart(2, "0")}:${stats.diff_milliseconds.toString().padStart(2, "0").slice(0, 2)}`;
    console.log(differenceTime);
  value.completionTime = differenceTime;
  console.log(value);
  console.log(value.tag_id);
} else {
  value.completionTime = "00:00:00:00";
  console.log(value);
  console.log(value.tag_id);
}


// let differenceTime = `${stats.diff_hours}:${stats.diff_minutes}:${stats.diff_seconds}:${stats.diff_milliseconds}`;
//  let differenceTime=`$[stats.diff_hours]+":"+racejsondata[0][0].diff_minutes+":"+racejsondata[0][0].diff_seconds+":"+racejsondata[0][0].diff_milliseconds;`
//  const differenceTime = `${stats.diff_hours}:${stats.diff_minutes}:${stats.diff_seconds}:${stats.diff_milliseconds}`; 
// let differenceTime=racejsondata[0][0].diff_hours+":"+racejsondata[0][0].diff_minutes+":"+racejsondata[0][0].diff_seconds+":"+racejsondata[0][0].diff_milliseconds;
  // let differenceTime=racejsonData[0][0]['diff_hours']+":"+racejsondata[0][0]['diff_minutes']+":"+racejsonData[0][0]['diff_seconds']+":"+racejsonData[0][0]['diff_milliseconds'];
  
  
  // console.log(differenceTime);
  // value.completionTime=differenceTime;
  // console.log(value);
  // console.log(value.tag_id);


  //console.log(value.completion_time);
}

// for (const key of Object.keys(result)) {
//   console.log(key, result[key]);
//   console.log(result[key].tag_id);
// }
    res.json(result.recordset);
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

